import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Snapshot } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDataDir = path.resolve(__dirname, "../data");
const DEFAULT_SNAPSHOT_FILE = "snapshots.json";
const MIN_WRITE_INTERVAL_MS = 15 * 60 * 1000;
const MAX_PER_ITEM = 480;
const dayStringPattern = /^\d{4}-\d{2}-\d{2}$/u;
const calendarDatePrefixPattern = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/u;

type SnapshotMap = Record<string, Snapshot[]>;

class EmptySnapshotFileError extends Error {}
const historyWriteChains = new Map<string, Promise<void>>();

export type SnapshotStoreStats = {
  itemCount: number;
  rowCount: number;
  latestAt: string | null;
};

export type HistoryStoreOptions = {
  dataDir?: string;
  snapshotFileName?: string;
  minWriteIntervalMs?: number;
  maxPerItem?: number;
};

function isMissingFile(error: unknown) {
  return (
    typeof error === "object" &&
    error != null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function stripBom(raw: string) {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

const nullableNumberSnapshotKeys = [
  "buffClose",
  "yyypClose",
  "spreadPct",
  "top1",
  "top10",
  "buffSell",
  "yyypSell",
  "buffBuy",
  "yyypBuy",
] satisfies Array<keyof Snapshot>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value);
}

function isNullableFiniteNumber(value: unknown) {
  return value === null || isFiniteNumber(value);
}

function isValidDayString(value: string) {
  if (!dayStringPattern.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidCalendarDatePrefix(value: string) {
  const match = calendarDatePrefixPattern.exec(value);
  if (!match) {
    return true;
  }

  return isValidDayString(`${match[1]}-${match[2]}-${match[3]}`);
}

function isValidSnapshotTimestamp(value: string) {
  return calendarDatePrefixPattern.test(value) && isValidCalendarDatePrefix(value) && !Number.isNaN(Date.parse(value));
}

function validateSnapshotRow(row: unknown, goodId: string, sourceLabel: string) {
  if (!isPlainObject(row)) {
    throw new Error(`${sourceLabel} contains an invalid snapshot row for ${goodId}.`);
  }

  if (typeof row.goodId !== "string" || !row.goodId.trim()) {
    throw new Error(`${sourceLabel} contains an invalid snapshot goodId for ${goodId}.`);
  }

  if (typeof row.at !== "string" || !isValidSnapshotTimestamp(row.at)) {
    throw new Error(`${sourceLabel} contains an invalid snapshot timestamp for ${goodId}.`);
  }

  if (row.goodId !== goodId) {
    throw new Error(`${sourceLabel} contains a snapshot row with mismatched goodId for ${goodId}.`);
  }

  if (!isFiniteNumber(row.volume)) {
    throw new Error(`${sourceLabel} contains an invalid volume for ${goodId}.`);
  }

  for (const key of nullableNumberSnapshotKeys) {
    if (!isNullableFiniteNumber(row[key])) {
      throw new Error(`${sourceLabel} contains an invalid ${key} value for ${goodId}.`);
    }
  }

  if ("leaders" in row && row.leaders !== undefined) {
    if (!Array.isArray(row.leaders)) {
      throw new Error(`${sourceLabel} contains invalid leaders for ${goodId}.`);
    }

    row.leaders.forEach((leader, index) => {
      if (!isPlainObject(leader)) {
        throw new Error(`${sourceLabel} contains an invalid leader at ${goodId}[${index}].`);
      }

      if (typeof leader.steamName !== "string" || !isFiniteNumber(leader.num)) {
        throw new Error(`${sourceLabel} contains an invalid leader at ${goodId}[${index}].`);
      }

      for (const optionalKey of ["steamId", "avatar"] as const) {
        if (leader[optionalKey] !== undefined && typeof leader[optionalKey] !== "string") {
          throw new Error(`${sourceLabel} contains an invalid leader at ${goodId}[${index}].`);
        }
      }
    });
  }
}

function validateSnapshotForWrite(snapshot: Snapshot) {
  if (!isPlainObject(snapshot) || typeof snapshot.goodId !== "string") {
    throw new Error("new snapshot contains an invalid goodId.");
  }

  validateSnapshotRow(snapshot, snapshot.goodId, "new snapshot");
}

function parseSnapshotMap(raw: string, sourceLabel: string): SnapshotMap {
  const normalized = stripBom(raw).trim();
  if (!normalized) {
    throw new EmptySnapshotFileError(`${sourceLabel} is empty.`);
  }

  const parsed = JSON.parse(normalized) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${sourceLabel} must contain an object keyed by goodId.`);
  }

  for (const [goodId, rows] of Object.entries(parsed)) {
    if (!Array.isArray(rows)) {
      throw new Error(`${sourceLabel} contains invalid rows for ${goodId}.`);
    }

    rows.forEach((row) => validateSnapshotRow(row, goodId, sourceLabel));
  }

  return parsed as SnapshotMap;
}

function backupFileName(snapshotFileName: string) {
  return snapshotFileName.endsWith(".json")
    ? snapshotFileName.replace(/\.json$/u, ".backup.json")
    : `${snapshotFileName}.backup`;
}

function isEmptySnapshotFile(error: unknown) {
  return error instanceof EmptySnapshotFileError;
}

function significantlyChanged(a: Snapshot, b: Snapshot) {
  return (
    a.buffClose !== b.buffClose ||
    a.yyypClose !== b.yyypClose ||
    a.top10 !== b.top10 ||
    a.top1 !== b.top1 ||
    a.spreadPct !== b.spreadPct ||
    a.buffSell !== b.buffSell ||
    a.yyypSell !== b.yyypSell ||
    a.buffBuy !== b.buffBuy ||
    a.yyypBuy !== b.yyypBuy
  );
}

function collectStats(data: SnapshotMap): SnapshotStoreStats {
  let rowCount = 0;
  let latestAt: string | null = null;

  for (const rows of Object.values(data)) {
    if (!Array.isArray(rows)) {
      continue;
    }

    rowCount += rows.length;
    for (const row of rows) {
      if (!latestAt || Date.parse(row.at) > Date.parse(latestAt)) {
        latestAt = row.at;
      }
    }
  }

  return {
    itemCount: Object.keys(data).length,
    rowCount,
    latestAt,
  };
}

function sortAndDedupeSnapshots(rows: Snapshot[]) {
  const latestByTimestamp = new Map<string, Snapshot>();
  for (const row of rows) {
    latestByTimestamp.set(row.at, row);
  }

  return [...latestByTimestamp.values()].sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

function nearestSnapshot(rows: Snapshot[], at: string) {
  const timestamp = Date.parse(at);
  let nearest: Snapshot | undefined;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const row of rows) {
    const distance = Math.abs(Date.parse(row.at) - timestamp);
    if (distance < nearestDistance) {
      nearest = row;
      nearestDistance = distance;
    }
  }

  return nearest;
}

export function createHistoryStore(options: HistoryStoreOptions = {}) {
  const dataDir = options.dataDir ?? defaultDataDir;
  const snapshotFileName = options.snapshotFileName ?? DEFAULT_SNAPSHOT_FILE;
  const snapshotPath = path.join(dataDir, snapshotFileName);
  const backupPath = path.join(dataDir, backupFileName(snapshotFileName));
  const minWriteIntervalMs = options.minWriteIntervalMs ?? MIN_WRITE_INTERVAL_MS;
  const maxPerItem = options.maxPerItem ?? MAX_PER_ITEM;
  const queueKey = path.resolve(snapshotPath);

  async function ensureDataDir() {
    await mkdir(dataDir, { recursive: true });
  }

  async function loadFromFile(filePath: string) {
    const raw = await readFile(filePath, "utf8");
    return parseSnapshotMap(raw, path.basename(filePath));
  }

  async function loadAll(): Promise<SnapshotMap> {
    await ensureDataDir();

    try {
      return await loadFromFile(snapshotPath);
    } catch (error) {
      try {
        return await loadFromFile(backupPath);
      } catch (backupError) {
        if (isMissingFile(error) && isMissingFile(backupError)) {
          return {};
        }

        if (isEmptySnapshotFile(error) && isMissingFile(backupError)) {
          throw new Error("snapshots.json is empty and no backup file is available for recovery.");
        }

        if (isMissingFile(backupError)) {
          throw new Error(
            "snapshots.json is damaged and no backup file is available for recovery.",
          );
        }

        throw new Error("snapshots.json and its backup cannot be parsed.");
      }
    }
  }

  async function saveAll(data: SnapshotMap) {
    await ensureDataDir();
    const serialized = JSON.stringify(data, null, 2);
    const tempPath = path.join(dataDir, `.${snapshotFileName}.${randomUUID()}.tmp`);
    const backupTempPath = path.join(dataDir, `.${backupFileName(snapshotFileName)}.${randomUUID()}.tmp`);
    await writeFile(tempPath, serialized, "utf8");
    await rename(tempPath, snapshotPath);
    await writeFile(backupTempPath, serialized, "utf8");
    await rename(backupTempPath, backupPath);
  }

  async function listSnapshots(goodId: string) {
    const data = await loadAll();
    return data[goodId] ?? [];
  }

  async function appendSnapshot(snapshot: Snapshot) {
    validateSnapshotForWrite(snapshot);

    const previous = historyWriteChains.get(queueKey) ?? Promise.resolve();
    const task = previous.then(async () => {
      const data = await loadAll();
      const rows = sortAndDedupeSnapshots(data[snapshot.goodId] ?? []);
      const nearest = nearestSnapshot(rows, snapshot.at);

      if (nearest) {
        const age = Math.abs(Date.parse(snapshot.at) - Date.parse(nearest.at));
        if (age < minWriteIntervalMs && !significantlyChanged(snapshot, nearest)) {
          return rows;
        }
      }

      const nextRows = sortAndDedupeSnapshots([...rows, snapshot]).slice(-maxPerItem);
      data[snapshot.goodId] = nextRows;
      await saveAll(data);
      return nextRows;
    });

    historyWriteChains.set(queueKey, task.then(
      () => undefined,
      () => undefined,
    ));

    return task;
  }

  async function getStats() {
    return collectStats(await loadAll());
  }

  return {
    appendSnapshot,
    getStats,
    listSnapshots,
  };
}

const defaultStore = createHistoryStore();

export async function listSnapshots(goodId: string) {
  return defaultStore.listSnapshots(goodId);
}

export async function appendSnapshot(snapshot: Snapshot) {
  return defaultStore.appendSnapshot(snapshot);
}

export async function getSnapshotStoreStats() {
  return defaultStore.getStats();
}
