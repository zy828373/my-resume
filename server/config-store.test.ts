import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createConfigStore, maskToken, normalizeRuntimeConfig } from "./config-store.js";
import type { RuntimeConfig } from "./types.js";

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(path.join(tmpdir(), "cs2-config-"));
  tempDirs.push(dir);
  return dir;
}

function config(name: string): RuntimeConfig {
  return {
    apiToken: `token-${name}`,
    watchlist: [{ goodId: name, name }],
    portfolio: [],
  } as RuntimeConfig;
}

async function writeJson(filePath: string, payload: unknown) {
  await writeFile(filePath, JSON.stringify(payload, null, 2), "utf8");
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("config-store", () => {
  it("masks tokens without exposing the full value", () => {
    expect(maskToken()).toBeNull();
    expect(maskToken("abcdef")).toBe("ab***ef");
    expect(maskToken("abcdefghijklmnop")).toBe("abcd****mnop");
  });

  it("normalizes missing runtime config sections to defaults", () => {
    const normalized = normalizeRuntimeConfig({ watchlist: [] } as unknown as RuntimeConfig);

    expect(normalized.watchlist).toEqual([]);
    expect(normalized.autoRefresh?.enabled).toBe(true);
    expect(normalized.scanner?.recommendationLimit).toBeGreaterThan(0);
    expect(normalized.portfolio).toEqual([]);
  });

  it("loads backup when the primary config file is missing", async () => {
    const dataDir = await makeTempDir();
    const store = createConfigStore({ dataDir });
    await writeJson(path.join(dataDir, "runtime-config.backup.json"), config("backup"));

    const loaded = await store.loadConfig();

    expect(loaded.apiToken).toBe("token-backup");
    expect(loaded.watchlist).toEqual([{ goodId: "backup", name: "backup" }]);
  });

  it("loads backup when the primary config file is empty", async () => {
    const dataDir = await makeTempDir();
    const store = createConfigStore({ dataDir });
    await writeFile(path.join(dataDir, "runtime-config.json"), "", "utf8");
    await writeJson(path.join(dataDir, "runtime-config.backup.json"), config("backup"));

    const loaded = await store.loadConfig();

    expect(loaded.apiToken).toBe("token-backup");
  });

  it("throws when the primary config is empty and no backup exists", async () => {
    const dataDir = await makeTempDir();
    const store = createConfigStore({ dataDir });
    await writeFile(path.join(dataDir, "runtime-config.json"), "", "utf8");

    await expect(store.loadConfig()).rejects.toThrow(/no backup/i);
  });

  it("loads backup when the primary config file is damaged", async () => {
    const dataDir = await makeTempDir();
    const store = createConfigStore({ dataDir });
    await writeFile(path.join(dataDir, "runtime-config.json"), "{damaged", "utf8");
    await writeJson(path.join(dataDir, "runtime-config.backup.json"), config("backup"));

    const loaded = await store.loadConfig();

    expect(loaded.watchlist[0]?.goodId).toBe("backup");
  });

  it("loads backup when the primary config has an invalid runtime shape", async () => {
    const dataDir = await makeTempDir();
    const store = createConfigStore({ dataDir });
    await writeJson(path.join(dataDir, "runtime-config.json"), { watchlist: "not-an-array" });
    await writeJson(path.join(dataDir, "runtime-config.backup.json"), config("backup"));

    const loaded = await store.loadConfig();

    expect(loaded.apiToken).toBe("token-backup");
    expect(loaded.watchlist[0]?.goodId).toBe("backup");
  });

  it("loads backup when nested runtime config fields are invalid", async () => {
    const dataDir = await makeTempDir();
    const store = createConfigStore({ dataDir });
    await writeJson(path.join(dataDir, "runtime-config.json"), {
      watchlist: [],
      scanner: { recommendationLimit: "bad" },
    });
    await writeJson(path.join(dataDir, "runtime-config.backup.json"), config("backup"));

    const loaded = await store.loadConfig();

    expect(loaded.apiToken).toBe("token-backup");
  });

  it("throws when the primary config shape is invalid and no backup exists", async () => {
    const dataDir = await makeTempDir();
    const store = createConfigStore({ dataDir });
    await writeJson(path.join(dataDir, "runtime-config.json"), { portfolio: "not-an-array" });

    await expect(store.loadConfig()).rejects.toThrow(/no backup/i);
  });

  it("normalizes legacy portfolio buy dates before strict validation", async () => {
    const dataDir = await makeTempDir();
    const store = createConfigStore({ dataDir });
    await writeJson(path.join(dataDir, "runtime-config.json"), {
      watchlist: [],
      portfolio: [
        {
          id: "holding-1",
          goodId: "730",
          name: "AK-47 | Redline",
          averageCost: 100,
          quantity: 1,
          createdAt: "2026-02-03T04:05:06.000Z",
          updatedAt: "2026-02-04T04:05:06.000Z",
        },
        {
          id: "holding-2",
          goodId: "731",
          name: "M4A1-S | Printstream",
          averageCost: 200,
          quantity: 2,
          buyDate: "February 5, 2026",
          createdAt: "2026-02-01T04:05:06.000Z",
          updatedAt: "2026-02-04T04:05:06.000Z",
        },
      ],
    });

    const loaded = await store.loadConfig();

    expect(loaded.portfolio?.[0]?.buyDate).toBe("2026-02-03");
    expect(loaded.portfolio?.[1]?.buyDate).toBe("2026-02-05");
  });

  it("loads backup when a legacy portfolio buy date has an impossible calendar day", async () => {
    const dataDir = await makeTempDir();
    const store = createConfigStore({ dataDir });
    await writeJson(path.join(dataDir, "runtime-config.json"), {
      watchlist: [],
      portfolio: [
        {
          id: "holding-1",
          goodId: "730",
          name: "AK-47 | Redline",
          averageCost: 100,
          quantity: 1,
          buyDate: "2026-02-31",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    await writeJson(path.join(dataDir, "runtime-config.backup.json"), config("backup"));

    const loaded = await store.loadConfig();

    expect(loaded.apiToken).toBe("token-backup");
  });

  it("loads backup when a parsed legacy portfolio buy date would roll over", async () => {
    const dataDir = await makeTempDir();
    const store = createConfigStore({ dataDir });
    await writeJson(path.join(dataDir, "runtime-config.json"), {
      watchlist: [],
      portfolio: [
        {
          id: "holding-1",
          goodId: "730",
          name: "AK-47 | Redline",
          averageCost: 100,
          quantity: 1,
          buyDate: "February 31, 2026",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    await writeJson(path.join(dataDir, "runtime-config.backup.json"), config("backup"));

    const loaded = await store.loadConfig();

    expect(loaded.watchlist[0]?.goodId).toBe("backup");
  });

  it("writes config and backup without deleting the primary first", async () => {
    const dataDir = await makeTempDir();
    const store = createConfigStore({ dataDir });

    await store.saveConfig(config("saved"));

    const primary = JSON.parse(await readFile(path.join(dataDir, "runtime-config.json"), "utf8")) as RuntimeConfig;
    const backup = JSON.parse(await readFile(path.join(dataDir, "runtime-config.backup.json"), "utf8")) as RuntimeConfig;
    expect(primary.apiToken).toBe("token-saved");
    expect(backup.apiToken).toBe("token-saved");
  });

  it("serializes concurrent config updates", async () => {
    const dataDir = await makeTempDir();
    const store = createConfigStore({ dataDir });
    await store.saveConfig({ watchlist: [], portfolio: [] } as unknown as RuntimeConfig);

    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        store.updateConfig((current) => ({
          ...current,
          watchlist: [...current.watchlist, { goodId: String(index), name: `item-${index}` }],
        })),
      ),
    );

    const loaded = await store.loadConfig();
    expect(loaded.watchlist).toHaveLength(10);
  });

  it("serializes concurrent config updates across store instances for the same file", async () => {
    const dataDir = await makeTempDir();
    const firstStore = createConfigStore({ dataDir });
    const secondStore = createConfigStore({ dataDir });
    await firstStore.saveConfig({ watchlist: [], portfolio: [] } as unknown as RuntimeConfig);

    await Promise.all(
      Array.from({ length: 10 }, (_, index) => {
        const store = index % 2 === 0 ? firstStore : secondStore;
        return store.updateConfig((current) => ({
          ...current,
          watchlist: [...current.watchlist, { goodId: String(index), name: `item-${index}` }],
        }));
      }),
    );

    expect((await firstStore.loadConfig()).watchlist).toHaveLength(10);
  });

  it("serializes direct saves and resets through the write queue", async () => {
    const dataDir = await makeTempDir();
    const store = createConfigStore({ dataDir });
    await store.saveConfig({ watchlist: [], portfolio: [] } as unknown as RuntimeConfig);

    const updatePromise = store.updateConfig((current) => ({
      ...current,
      watchlist: [{ goodId: "queued-update", name: "queued-update" }],
    }));
    const savePromise = store.saveConfig(config("queued-save"));
    const resetPromise = store.resetConfigToDefault();

    await Promise.all([updatePromise, savePromise, resetPromise]);

    const loaded = await store.loadConfig();
    const primary = JSON.parse(await readFile(path.join(dataDir, "runtime-config.json"), "utf8")) as RuntimeConfig;
    const backup = JSON.parse(await readFile(path.join(dataDir, "runtime-config.backup.json"), "utf8")) as RuntimeConfig;

    expect(loaded.watchlist).toEqual([]);
    expect(primary.watchlist).toEqual([]);
    expect(backup.watchlist).toEqual([]);
  });

  it("rejects invalid config writes before they can overwrite primary or backup files", async () => {
    const dataDir = await makeTempDir();
    const store = createConfigStore({ dataDir });
    await store.saveConfig(config("safe"));

    const primaryBefore = await readFile(path.join(dataDir, "runtime-config.json"), "utf8");
    const backupBefore = await readFile(path.join(dataDir, "runtime-config.backup.json"), "utf8");

    await expect(
      store.updateConfig((current) => ({
        ...current,
        scanner: {
          ...current.scanner!,
          recommendationLimit: "bad" as unknown as number,
        },
      })),
    ).rejects.toThrow(/recommendationLimit/i);

    await expect(
      store.saveConfig({
        ...config("bad-autorefresh"),
        autoRefresh: {
          enabled: true,
          intervalMinutes: 1,
          includeDeep: true,
          maxDeepItems: 3,
        },
      }),
    ).rejects.toThrow(/intervalMinutes/i);

    await expect(
      store.saveConfig({
        ...config("bad-scanner-range"),
        scanner: {
          enabled: true,
          candidatePages: 2,
          candidatePageSize: 24,
          deepAnalyzeLimit: 15,
          recommendationLimit: 50,
          featuredLimit: 3,
          hotWindowSize: 20,
          randomSampleSize: 10,
          maxRoundsPerCycle: 15,
          analysisScopes: ["agent"],
          holoStickerSeries: ["other"],
        },
      }),
    ).rejects.toThrow(/recommendationLimit/i);

    await expect(
      store.saveConfig({
        ...config("bad"),
        watchlist: [{ goodId: 123 as unknown as string }],
      }),
    ).rejects.toThrow(/goodId/i);

    await expect(
      store.saveConfig({
        ...config("bad-portfolio"),
        portfolio: [
          {
            id: "holding-1",
            goodId: "730",
            name: "AK-47 | Redline",
            averageCost: "bad" as unknown as number,
            quantity: 1,
            buyDate: "2026-01-01",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    ).rejects.toThrow(/averageCost/i);

    await expect(
      store.saveConfig({
        ...config("bad-portfolio-date"),
        portfolio: [
          {
            id: "holding-1",
            goodId: "730",
            name: "AK-47 | Redline",
            averageCost: 100,
            quantity: 1,
            buyDate: "2026-02-31",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    ).rejects.toThrow(/buyDate/i);

    expect(await readFile(path.join(dataDir, "runtime-config.json"), "utf8")).toBe(primaryBefore);
    expect(await readFile(path.join(dataDir, "runtime-config.backup.json"), "utf8")).toBe(backupBefore);
    expect((await store.loadConfig()).apiToken).toBe("token-safe");
  });
});
