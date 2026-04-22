import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AlertPolicyConfig, AutoRefreshConfig, RuntimeConfig, ScannerConfig } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");
const configPath = path.join(dataDir, "runtime-config.json");
const backupPath = path.join(dataDir, "runtime-config.backup.json");
const tempPath = path.join(dataDir, "runtime-config.tmp.json");
let writeChain = Promise.resolve();

const defaultAutoRefresh: AutoRefreshConfig = {
  enabled: true,
  intervalMinutes: 20,
  includeDeep: true,
  maxDeepItems: 3,
};

const defaultAlertPolicy: AlertPolicyConfig = {
  enabled: true,
  entryPushThreshold: 72,
  exitPushThreshold: 72,
  llmPushThreshold: 65,
  watchThreshold: 60,
  cooldownBlockEntry: true,
};

const defaultScanner: ScannerConfig = {
  enabled: true,
  candidatePages: 2,
  candidatePageSize: 24,
  deepAnalyzeLimit: 15,
  recommendationLimit: 15,
  featuredLimit: 3,
  hotWindowSize: 20,
  randomSampleSize: 10,
  maxRoundsPerCycle: 15,
};

const defaultConfig: RuntimeConfig = {
  watchlist: [],
  autoRefresh: defaultAutoRefresh,
  alertPolicy: defaultAlertPolicy,
  scanner: defaultScanner,
  portfolio: [],
};

function isMissingFile(error: unknown) {
  return (
    typeof error === "object" &&
    error != null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

function mergeAutoRefreshConfig(config?: Partial<AutoRefreshConfig>): AutoRefreshConfig {
  return {
    enabled: config?.enabled ?? defaultAutoRefresh.enabled,
    intervalMinutes: config?.intervalMinutes ?? defaultAutoRefresh.intervalMinutes,
    includeDeep: config?.includeDeep ?? defaultAutoRefresh.includeDeep,
    maxDeepItems: config?.maxDeepItems ?? defaultAutoRefresh.maxDeepItems,
  };
}

function mergeAlertPolicyConfig(config?: Partial<AlertPolicyConfig>): AlertPolicyConfig {
  return {
    enabled: config?.enabled ?? defaultAlertPolicy.enabled,
    entryPushThreshold: config?.entryPushThreshold ?? defaultAlertPolicy.entryPushThreshold,
    exitPushThreshold: config?.exitPushThreshold ?? defaultAlertPolicy.exitPushThreshold,
    llmPushThreshold: config?.llmPushThreshold ?? defaultAlertPolicy.llmPushThreshold,
    watchThreshold: config?.watchThreshold ?? defaultAlertPolicy.watchThreshold,
    cooldownBlockEntry: config?.cooldownBlockEntry ?? defaultAlertPolicy.cooldownBlockEntry,
  };
}

function mergeScannerConfig(config?: Partial<ScannerConfig>): ScannerConfig {
  return {
    enabled: config?.enabled ?? defaultScanner.enabled,
    candidatePages: config?.candidatePages ?? defaultScanner.candidatePages,
    candidatePageSize: config?.candidatePageSize ?? defaultScanner.candidatePageSize,
    deepAnalyzeLimit: config?.deepAnalyzeLimit ?? defaultScanner.deepAnalyzeLimit,
    recommendationLimit: config?.recommendationLimit ?? defaultScanner.recommendationLimit,
    featuredLimit: config?.featuredLimit ?? defaultScanner.featuredLimit,
    hotWindowSize: config?.hotWindowSize ?? defaultScanner.hotWindowSize,
    randomSampleSize: config?.randomSampleSize ?? defaultScanner.randomSampleSize,
    maxRoundsPerCycle: config?.maxRoundsPerCycle ?? defaultScanner.maxRoundsPerCycle,
  };
}

function mergeRuntimeConfig(parsed: RuntimeConfig): RuntimeConfig {
  return {
    ...defaultConfig,
    ...parsed,
    watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
    autoRefresh: mergeAutoRefreshConfig(parsed.autoRefresh),
    alertPolicy: mergeAlertPolicyConfig(parsed.alertPolicy),
    scanner: mergeScannerConfig(parsed.scanner),
    portfolio: Array.isArray(parsed.portfolio) ? parsed.portfolio : [],
  };
}

async function readConfigFile(filePath: string) {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as RuntimeConfig;
  return mergeRuntimeConfig(parsed);
}

async function writeConfigAtomically(config: RuntimeConfig) {
  const serialized = JSON.stringify(config, null, 2);
  await writeFile(tempPath, serialized, "utf8");

  try {
    await rm(configPath, { force: true });
  } catch {
    // ignore remove races
  }

  await rename(tempPath, configPath);
  await copyFile(configPath, backupPath);
}

export async function ensureDataDir() {
  await mkdir(dataDir, { recursive: true });
}

export async function loadConfig(): Promise<RuntimeConfig> {
  await ensureDataDir();

  try {
    return await readConfigFile(configPath);
  } catch (error) {
    if (isMissingFile(error)) {
      return defaultConfig;
    }

    try {
      return await readConfigFile(backupPath);
    } catch (backupError) {
      if (isMissingFile(backupError)) {
        throw new Error("runtime-config.json 已损坏，且没有可恢复的备份文件。");
      }

      throw new Error("runtime-config.json 和备份文件都无法解析，请检查 data 目录中的配置文件。");
    }
  }
}

export async function saveConfig(config: RuntimeConfig) {
  await ensureDataDir();
  await writeConfigAtomically(config);
}

export async function updateConfig(
  updater: (current: RuntimeConfig) => RuntimeConfig,
) {
  const task = writeChain.then(async () => {
    const current = await loadConfig();
    const next = mergeRuntimeConfig(updater(current));
    await saveConfig(next);
    return next;
  });

  writeChain = task.then(
    () => undefined,
    () => undefined,
  );

  return task;
}

export async function resetConfigToDefault() {
  await ensureDataDir();
  await writeConfigAtomically(defaultConfig);
  return defaultConfig;
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
