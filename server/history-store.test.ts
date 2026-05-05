import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createHistoryStore } from "./history-store.js";
import type { Snapshot } from "./types.js";

const tempDirs: string[] = [];

function snapshot(goodId: string, index: number): Snapshot {
  return {
    at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    goodId,
    buffClose: 100 + index,
    yyypClose: 101 + index,
    spreadPct: index,
    volume: 10 + index,
    top1: index,
    top10: index + 10,
    buffSell: index + 1,
    yyypSell: index + 2,
    buffBuy: index + 3,
    yyypBuy: index + 4,
  };
}

async function makeTempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "cs2-history-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("history-store", () => {
  it("serializes concurrent snapshot writes without losing rows", async () => {
    const dataDir = await makeTempDir();
    const store = createHistoryStore({ dataDir, minWriteIntervalMs: 0 });

    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        store.appendSnapshot(snapshot(index % 2 === 0 ? "a" : "b", index)),
      ),
    );

    expect(await store.listSnapshots("a")).toHaveLength(10);
    expect(await store.listSnapshots("b")).toHaveLength(10);

    const persisted = JSON.parse(await readFile(path.join(dataDir, "snapshots.json"), "utf8")) as Record<string, Snapshot[]>;
    expect(persisted.a).toHaveLength(10);
    expect(persisted.b).toHaveLength(10);
  }, 20_000);

  it("skips unchanged snapshots inside the minimum write interval", async () => {
    const dataDir = await makeTempDir();
    const store = createHistoryStore({ dataDir, minWriteIntervalMs: 15 * 60 * 1000 });
    const first = snapshot("same", 1);
    const second = { ...first, at: new Date(Date.parse(first.at) + 60_000).toISOString() };

    await store.appendSnapshot(first);
    const rows = await store.appendSnapshot(second);

    expect(rows).toHaveLength(1);
    expect(await store.listSnapshots("same")).toHaveLength(1);
  });

  it("loads BOM-prefixed snapshot JSON", async () => {
    const dataDir = await makeTempDir();
    const store = createHistoryStore({ dataDir });
    await writeFile(path.join(dataDir, "snapshots.json"), `\ufeff${JSON.stringify({ bom: [snapshot("bom", 1)] })}`, "utf8");

    expect(await store.listSnapshots("bom")).toHaveLength(1);
  });

  it("recovers from backup when the primary snapshot file is damaged", async () => {
    const dataDir = await makeTempDir();
    const store = createHistoryStore({ dataDir });
    await writeFile(path.join(dataDir, "snapshots.json"), "{damaged", "utf8");
    await writeFile(path.join(dataDir, "snapshots.backup.json"), JSON.stringify({ backup: [snapshot("backup", 1)] }), "utf8");

    expect(await store.listSnapshots("backup")).toHaveLength(1);
  });

  it("recovers from backup when the primary snapshot rows are malformed", async () => {
    const dataDir = await makeTempDir();
    const store = createHistoryStore({ dataDir });
    await writeFile(path.join(dataDir, "snapshots.json"), JSON.stringify({ backup: {} }), "utf8");
    await writeFile(path.join(dataDir, "snapshots.backup.json"), JSON.stringify({ backup: [snapshot("backup", 1)] }), "utf8");

    expect(await store.listSnapshots("backup")).toHaveLength(1);
  });

  it("recovers from backup when snapshot rows have invalid dates or mismatched ids", async () => {
    const dataDir = await makeTempDir();
    const store = createHistoryStore({ dataDir });
    await writeFile(
      path.join(dataDir, "snapshots.json"),
      JSON.stringify({
        bad: [{ ...snapshot("bad", 1), at: "2026-02-31T00:00:00.000Z" }],
      }),
      "utf8",
    );
    await writeFile(path.join(dataDir, "snapshots.backup.json"), JSON.stringify({ backup: [snapshot("backup", 1)] }), "utf8");

    expect(await store.listSnapshots("backup")).toHaveLength(1);
  });

  it("throws when snapshot number fields are malformed and no backup exists", async () => {
    const dataDir = await makeTempDir();
    const store = createHistoryStore({ dataDir });
    await writeFile(
      path.join(dataDir, "snapshots.json"),
      JSON.stringify({
        bad: [{ ...snapshot("bad", 1), buffClose: "100" }],
      }),
      "utf8",
    );

    await expect(store.listSnapshots("bad")).rejects.toThrow(/no backup/i);
  });

  it("rejects invalid snapshot writes before they can overwrite primary or backup files", async () => {
    const dataDir = await makeTempDir();
    const store = createHistoryStore({ dataDir, minWriteIntervalMs: 0 });
    await store.appendSnapshot(snapshot("safe", 1));

    const primaryBefore = await readFile(path.join(dataDir, "snapshots.json"), "utf8");
    const backupBefore = await readFile(path.join(dataDir, "snapshots.backup.json"), "utf8");

    await expect(
      store.appendSnapshot({
        ...snapshot("bad", 2),
        volume: Number.NaN,
      }),
    ).rejects.toThrow(/invalid volume/i);

    await expect(
      store.appendSnapshot({
        ...snapshot("bad-date", 3),
        at: "2026-02-31T00:00:00.000Z",
      }),
    ).rejects.toThrow(/invalid snapshot timestamp/i);

    await expect(
      store.appendSnapshot({
        ...snapshot("bad-text-date", 4),
        at: "February 31, 2026",
      }),
    ).rejects.toThrow(/invalid snapshot timestamp/i);

    expect(await readFile(path.join(dataDir, "snapshots.json"), "utf8")).toBe(primaryBefore);
    expect(await readFile(path.join(dataDir, "snapshots.backup.json"), "utf8")).toBe(backupBefore);
    expect(await store.listSnapshots("safe")).toHaveLength(1);
  });

  it("keeps snapshots sorted by timestamp and replaces duplicate timestamps", async () => {
    const dataDir = await makeTempDir();
    const store = createHistoryStore({ dataDir, minWriteIntervalMs: 0, maxPerItem: 3 });
    const later = snapshot("ordered", 2);
    const earlier = snapshot("ordered", 1);
    const duplicate = { ...snapshot("ordered", 2), volume: 99 };

    await store.appendSnapshot(later);
    await store.appendSnapshot(earlier);
    await store.appendSnapshot(duplicate);

    const rows = await store.listSnapshots("ordered");
    expect(rows.map((row) => row.at)).toEqual([earlier.at, later.at]);
    expect(rows.map((row) => row.volume)).toEqual([earlier.volume, 99]);
    expect((await store.getStats()).latestAt).toBe(later.at);
  });

  it("serializes snapshot writes across store instances for the same file", async () => {
    const dataDir = await makeTempDir();
    const firstStore = createHistoryStore({ dataDir, minWriteIntervalMs: 0 });
    const secondStore = createHistoryStore({ dataDir, minWriteIntervalMs: 0 });

    await Promise.all(
      Array.from({ length: 20 }, (_, index) => {
        const store = index % 2 === 0 ? firstStore : secondStore;
        return store.appendSnapshot(snapshot("shared", index));
      }),
    );

    expect(await firstStore.listSnapshots("shared")).toHaveLength(20);
  });

  it("loads backup when the primary snapshot file is missing", async () => {
    const dataDir = await makeTempDir();
    const store = createHistoryStore({ dataDir });
    await writeFile(path.join(dataDir, "snapshots.backup.json"), JSON.stringify({ backup: [snapshot("backup", 1)] }), "utf8");

    expect(await store.listSnapshots("backup")).toHaveLength(1);
  });

  it("loads backup when the primary snapshot file is empty", async () => {
    const dataDir = await makeTempDir();
    const store = createHistoryStore({ dataDir });
    await writeFile(path.join(dataDir, "snapshots.json"), "", "utf8");
    await writeFile(path.join(dataDir, "snapshots.backup.json"), JSON.stringify({ backup: [snapshot("backup", 1)] }), "utf8");

    expect(await store.listSnapshots("backup")).toHaveLength(1);
  });

  it("throws when the primary file is empty and no backup exists", async () => {
    const dataDir = await makeTempDir();
    const store = createHistoryStore({ dataDir });
    await writeFile(path.join(dataDir, "snapshots.json"), "", "utf8");

    await expect(store.listSnapshots("missing")).rejects.toThrow(/empty/i);
    await expect(store.getStats()).rejects.toThrow(/empty/i);
  });

  it("returns an empty snapshot set on a fresh install with no files", async () => {
    const dataDir = await makeTempDir();
    const store = createHistoryStore({ dataDir });

    expect(await store.listSnapshots("missing")).toEqual([]);
    expect(await store.getStats()).toEqual({ itemCount: 0, rowCount: 0, latestAt: null });
  });

  it("throws when the primary snapshot file is damaged and no backup exists", async () => {
    const dataDir = await makeTempDir();
    const store = createHistoryStore({ dataDir });
    await writeFile(path.join(dataDir, "snapshots.json"), "{damaged", "utf8");

    await expect(store.getStats()).rejects.toThrow(/no backup/i);
  });

  it("serializes concurrent writes for the same goodId", async () => {
    const dataDir = await makeTempDir();
    const store = createHistoryStore({ dataDir, minWriteIntervalMs: 0 });

    await Promise.all(
      Array.from({ length: 20 }, (_, index) => store.appendSnapshot(snapshot("same", index))),
    );

    const rows = await store.listSnapshots("same");
    expect(rows).toHaveLength(20);
    expect(rows.map((row) => row.at)).toHaveLength(new Set(rows.map((row) => row.at)).size);
  });

  it("keeps only maxPerItem snapshots per item", async () => {
    const dataDir = await makeTempDir();
    const store = createHistoryStore({ dataDir, minWriteIntervalMs: 0, maxPerItem: 3 });

    for (let index = 0; index < 5; index += 1) {
      await store.appendSnapshot(snapshot("limited", index));
    }

    const rows = await store.listSnapshots("limited");
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.volume)).toEqual([12, 13, 14]);
  });
});
