import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RuntimeConfig } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");
const configPath = path.join(dataDir, "runtime-config.json");

const defaultConfig: RuntimeConfig = {
  watchlist: [],
  autoRefresh: {
    enabled: true,
    intervalMinutes: 20,
    includeDeep: true,
    maxDeepItems: 3,
  },
  alertPolicy: {
    enabled: true,
    entryPushThreshold: 72,
    exitPushThreshold: 72,
    llmPushThreshold: 65,
    watchThreshold: 60,
    cooldownBlockEntry: true,
  },
};

export async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}

export async function loadConfig(): Promise<RuntimeConfig> {
  await ensureDataDir();

  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as RuntimeConfig;

    return {
      ...defaultConfig,
      ...parsed,
      watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
      autoRefresh: {
        ...defaultConfig.autoRefresh,
        ...(parsed.autoRefresh ?? {}),
      },
      alertPolicy: {
        ...defaultConfig.alertPolicy,
        ...(parsed.alertPolicy ?? {}),
      },
    };
  } catch {
    return defaultConfig;
  }
}

export async function saveConfig(config: RuntimeConfig) {
  await ensureDataDir();
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
}

export async function updateConfig(
  updater: (current: RuntimeConfig) => RuntimeConfig,
) {
  const current = await loadConfig();
  const next = updater(current);
  await saveConfig(next);
  return next;
}

export function maskToken(token?: string) {
  if (!token) {
    return null;
  }

  if (token.length <= 10) {
    return `${token.slice(0, 2)}***${token.slice(-2)}`;
  }

  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}
