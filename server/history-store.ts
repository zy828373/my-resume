import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Snapshot } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");
const snapshotPath = path.join(dataDir, "snapshots.json");
const MIN_WRITE_INTERVAL_MS = 15 * 60 * 1000;
const MAX_PER_ITEM = 480;

type SnapshotMap = Record<string, Snapshot[]>;

async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}

async function loadAll(): Promise<SnapshotMap> {
  await ensureDataDir();

  try {
    const raw = await readFile(snapshotPath, "utf8");
    return JSON.parse(raw) as SnapshotMap;
  } catch {
    return {};
  }
}

async function saveAll(data: SnapshotMap) {
  await ensureDataDir();
  await writeFile(snapshotPath, JSON.stringify(data, null, 2), "utf8");
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

export async function listSnapshots(goodId: string) {
  const data = await loadAll();
  return data[goodId] ?? [];
}

export async function appendSnapshot(snapshot: Snapshot) {
  const data = await loadAll();
  const rows = data[snapshot.goodId] ?? [];
  const last = rows.at(-1);

  if (last) {
    const age = Date.parse(snapshot.at) - Date.parse(last.at);
    if (age < MIN_WRITE_INTERVAL_MS && !significantlyChanged(snapshot, last)) {
      return rows;
    }
  }

  const nextRows = [...rows, snapshot].slice(-MAX_PER_ITEM);
  data[snapshot.goodId] = nextRows;
  await saveAll(data);
  return nextRows;
}
