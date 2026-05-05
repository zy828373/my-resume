import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AlertPolicyConfig,
  AutoRefreshConfig,
  PortfolioHolding,
  RuntimeConfig,
  ScannerConfig,
} from "./types.js";
import {
  DEFAULT_HOLO_STICKER_SERIES,
  DEFAULT_RECOMMENDATION_SCOPES,
  normalizeHoloStickerSeries,
  normalizeRecommendationScopes,
} from "./item-taxonomy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultDataDir = path.resolve(__dirname, "../data");
const CONFIG_FILE_NAME = "runtime-config.json";
const BACKUP_FILE_NAME = "runtime-config.backup.json";
const dayStringPattern = /^\d{4}-\d{2}-\d{2}$/u;
const calendarDatePrefixPattern = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/u;
const monthNames = new Map(
  [
    ["january", "jan"],
    ["february", "feb"],
    ["march", "mar"],
    ["april", "apr"],
    ["may"],
    ["june", "jun"],
    ["july", "jul"],
    ["august", "aug"],
    ["september", "sep", "sept"],
    ["october", "oct"],
    ["november", "nov"],
    ["december", "dec"],
  ].flatMap((names, index) => names.map((month) => [month, index + 1] as const)),
);

export type ConfigStoreOptions = {
  dataDir?: string;
};

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
  analysisScopes: DEFAULT_RECOMMENDATION_SCOPES,
  holoStickerSeries: DEFAULT_HOLO_STICKER_SERIES,
};

const defaultConfig: RuntimeConfig = {
  watchlist: [],
  autoRefresh: defaultAutoRefresh,
  alertPolicy: defaultAlertPolicy,
  scanner: defaultScanner,
  portfolio: [],
};
const configWriteChains = new Map<string, Promise<void>>();

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
    analysisScopes: normalizeRecommendationScopes(config?.analysisScopes),
    holoStickerSeries: normalizeHoloStickerSeries(config?.holoStickerSeries),
  };
}

function normalizeBuyDate(value: unknown, fallback?: string) {
  if (typeof value === "string" && isValidDayString(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (dayStringPattern.test(trimmed)) {
      return trimmed;
    }

    if (!hasValidExplicitCalendarDate(trimmed)) {
      return trimmed;
    }

    const parsedValue = new Date(trimmed);
    if (!Number.isNaN(parsedValue.getTime())) {
      return [
        parsedValue.getFullYear(),
        String(parsedValue.getMonth() + 1).padStart(2, "0"),
        String(parsedValue.getDate()).padStart(2, "0"),
      ].join("-");
    }
  }

  const source = typeof fallback === "string" && fallback ? fallback : new Date().toISOString();
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return parsed.toISOString().slice(0, 10);
}

function mergePortfolio(portfolio?: PortfolioHolding[]): PortfolioHolding[] {
  if (!Array.isArray(portfolio)) {
    return [];
  }

  return portfolio.map((holding) => ({
    ...holding,
    buyDate: normalizeBuyDate(holding.buyDate, holding.createdAt),
  }));
}

function mergeRuntimeConfig(parsed: RuntimeConfig): RuntimeConfig {
  return {
    ...defaultConfig,
    ...parsed,
    watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
    autoRefresh: mergeAutoRefreshConfig(parsed.autoRefresh),
    alertPolicy: mergeAlertPolicyConfig(parsed.alertPolicy),
    scanner: mergeScannerConfig(parsed.scanner),
    portfolio: mergePortfolio(parsed.portfolio),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function validateOptionalString(config: Record<string, unknown>, key: string, label: string) {
  if (key in config && config[key] !== undefined && typeof config[key] !== "string") {
    throw new Error(`${label}.${key} must be a string.`);
  }
}

function validateOptionalObject(config: Record<string, unknown>, key: string, label: string) {
  if (key in config && config[key] !== undefined && !isPlainObject(config[key])) {
    throw new Error(`${label}.${key} must be an object.`);
  }
}

function validateOptionalBoolean(config: Record<string, unknown>, key: string, label: string) {
  if (key in config && config[key] !== undefined && typeof config[key] !== "boolean") {
    throw new Error(`${label}.${key} must be a boolean.`);
  }
}

function validateOptionalFiniteNumber(config: Record<string, unknown>, key: string, label: string) {
  if (
    key in config &&
    config[key] !== undefined &&
    (typeof config[key] !== "number" || !Number.isFinite(config[key]))
  ) {
    throw new Error(`${label}.${key} must be a finite number.`);
  }
}

function validateOptionalIntegerRange(
  config: Record<string, unknown>,
  key: string,
  label: string,
  min: number,
  max: number,
) {
  if (key in config && config[key] !== undefined) {
    const value = config[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
      throw new Error(`${label}.${key} must be an integer between ${min} and ${max}.`);
    }
  }
}

function validateOptionalNumberRange(
  config: Record<string, unknown>,
  key: string,
  label: string,
  min: number,
  max: number,
) {
  if (key in config && config[key] !== undefined) {
    const value = config[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
      throw new Error(`${label}.${key} must be a finite number between ${min} and ${max}.`);
    }
  }
}

function validateOptionalArray(config: Record<string, unknown>, key: string, label: string) {
  if (key in config && config[key] !== undefined && !Array.isArray(config[key])) {
    throw new Error(`${label}.${key} must be an array.`);
  }
}

function validateRequiredString(config: Record<string, unknown>, key: string, label: string) {
  if (typeof config[key] !== "string" || !config[key].trim()) {
    throw new Error(`${label}.${key} must be a non-empty string.`);
  }
}

function validateRequiredPositiveNumber(config: Record<string, unknown>, key: string, label: string) {
  if (typeof config[key] !== "number" || !Number.isFinite(config[key]) || config[key] <= 0) {
    throw new Error(`${label}.${key} must be a positive finite number.`);
  }
}

function validateRequiredDate(config: Record<string, unknown>, key: string, label: string) {
  if (typeof config[key] !== "string" || !isValidDateString(config[key])) {
    throw new Error(`${label}.${key} must be a valid date string.`);
  }
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

function isValidCalendarDay(year: number, month: number, day: number) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function hasValidExplicitCalendarDate(value: string) {
  const ymd = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T\s])/u.exec(value);
  if (ymd) {
    return isValidCalendarDay(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));
  }

  const mdy = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:$|\s)/u.exec(value);
  if (mdy) {
    return isValidCalendarDay(Number(mdy[3]), Number(mdy[1]), Number(mdy[2]));
  }

  const monthFirst = /^([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?[,]?\s+(\d{4})(?:$|\s)/u.exec(value);
  if (monthFirst) {
    const month = monthNames.get(monthFirst[1].toLowerCase());
    return month ? isValidCalendarDay(Number(monthFirst[3]), month, Number(monthFirst[2])) : true;
  }

  const dayFirst = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)[,]?\s+(\d{4})(?:$|\s)/u.exec(value);
  if (dayFirst) {
    const month = monthNames.get(dayFirst[2].toLowerCase());
    return month ? isValidCalendarDay(Number(dayFirst[3]), month, Number(dayFirst[1])) : true;
  }

  return isValidCalendarDatePrefix(value);
}

function isValidDateString(value: string) {
  return hasValidExplicitCalendarDate(value) && !Number.isNaN(Date.parse(value));
}

function validateRequiredDay(config: Record<string, unknown>, key: string, label: string) {
  if (typeof config[key] !== "string" || !isValidDayString(config[key])) {
    throw new Error(`${label}.${key} must be a valid YYYY-MM-DD date string.`);
  }
}

function validateWatchlist(value: unknown, label: string) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    throw new Error(`${label}.watchlist must be an array.`);
  }

  value.forEach((row, index) => {
    if (!isPlainObject(row) || typeof row.goodId !== "string") {
      throw new Error(`${label}.watchlist[${index}] must contain a string goodId.`);
    }
    if ("name" in row && row.name !== undefined && typeof row.name !== "string") {
      throw new Error(`${label}.watchlist[${index}].name must be a string.`);
    }
  });
}

function validatePlatformMap(value: unknown, label: string) {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    throw new Error(`${label}.platformMap must be an object.`);
  }

  validateOptionalFiniteNumber(value, "buff", `${label}.platformMap`);
  validateOptionalFiniteNumber(value, "yyyp", `${label}.platformMap`);
  validateOptionalString(value, "updatedAt", `${label}.platformMap`);
}

function validateAutoRefresh(value: unknown, label: string) {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    throw new Error(`${label}.autoRefresh must be an object.`);
  }

  validateOptionalBoolean(value, "enabled", `${label}.autoRefresh`);
  validateOptionalIntegerRange(value, "intervalMinutes", `${label}.autoRefresh`, 5, 180);
  validateOptionalBoolean(value, "includeDeep", `${label}.autoRefresh`);
  validateOptionalIntegerRange(value, "maxDeepItems", `${label}.autoRefresh`, 1, 12);
}

function validateAlertPolicy(value: unknown, label: string) {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    throw new Error(`${label}.alertPolicy must be an object.`);
  }

  validateOptionalBoolean(value, "enabled", `${label}.alertPolicy`);
  validateOptionalNumberRange(value, "entryPushThreshold", `${label}.alertPolicy`, 0, 100);
  validateOptionalNumberRange(value, "exitPushThreshold", `${label}.alertPolicy`, 0, 100);
  validateOptionalNumberRange(value, "llmPushThreshold", `${label}.alertPolicy`, 0, 100);
  validateOptionalNumberRange(value, "watchThreshold", `${label}.alertPolicy`, 0, 100);
  validateOptionalBoolean(value, "cooldownBlockEntry", `${label}.alertPolicy`);
}

function validateScanner(value: unknown, label: string) {
  if (value === undefined) return;
  if (!isPlainObject(value)) {
    throw new Error(`${label}.scanner must be an object.`);
  }

  validateOptionalBoolean(value, "enabled", `${label}.scanner`);
  validateOptionalIntegerRange(value, "candidatePages", `${label}.scanner`, 1, 6);
  validateOptionalIntegerRange(value, "candidatePageSize", `${label}.scanner`, 12, 36);
  validateOptionalIntegerRange(value, "deepAnalyzeLimit", `${label}.scanner`, 3, 20);
  validateOptionalIntegerRange(value, "recommendationLimit", `${label}.scanner`, 6, 20);
  validateOptionalIntegerRange(value, "featuredLimit", `${label}.scanner`, 3, 6);
  validateOptionalIntegerRange(value, "hotWindowSize", `${label}.scanner`, 10, 60);
  validateOptionalIntegerRange(value, "randomSampleSize", `${label}.scanner`, 4, 20);
  validateOptionalIntegerRange(value, "maxRoundsPerCycle", `${label}.scanner`, 1, 30);
  validateOptionalArray(value, "analysisScopes", `${label}.scanner`);
  validateOptionalArray(value, "holoStickerSeries", `${label}.scanner`);
}

function validatePortfolio(value: unknown, label: string, options: { allowLegacyBuyDate?: boolean } = {}) {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    throw new Error(`${label}.portfolio must be an array.`);
  }

  value.forEach((row, index) => {
    if (!isPlainObject(row)) {
      throw new Error(`${label}.portfolio[${index}] must be an object.`);
    }

    const rowLabel = `${label}.portfolio[${index}]`;
    validateRequiredString(row, "id", rowLabel);
    validateRequiredString(row, "goodId", rowLabel);
    validateRequiredString(row, "name", rowLabel);
    validateRequiredPositiveNumber(row, "averageCost", rowLabel);
    validateRequiredPositiveNumber(row, "quantity", rowLabel);
    validateRequiredDate(row, "createdAt", rowLabel);
    validateRequiredDate(row, "updatedAt", rowLabel);
    if (options.allowLegacyBuyDate) {
      if ("buyDate" in row && row.buyDate !== undefined && typeof row.buyDate !== "string") {
        throw new Error(`${rowLabel}.buyDate must be a string when provided.`);
      }
    } else {
      validateRequiredDay(row, "buyDate", rowLabel);
    }
    if ("note" in row && row.note !== undefined && typeof row.note !== "string") {
      throw new Error(`${rowLabel}.note must be a string.`);
    }
  });
}

function validateRuntimeConfigShape(
  parsed: unknown,
  label: string,
  options: { allowLegacyPortfolioDates?: boolean } = {},
): RuntimeConfig {
  if (!isPlainObject(parsed)) {
    throw new Error(`${label} must contain a runtime config object.`);
  }

  validateOptionalString(parsed, "apiToken", label);
  validateOptionalString(parsed, "csfloatApiKey", label);
  validatePlatformMap(parsed.platformMap, label);
  validateAutoRefresh(parsed.autoRefresh, label);
  validateAlertPolicy(parsed.alertPolicy, label);
  validateScanner(parsed.scanner, label);
  validateWatchlist(parsed.watchlist, label);
  validatePortfolio(parsed.portfolio, label, { allowLegacyBuyDate: options.allowLegacyPortfolioDates });

  return parsed as unknown as RuntimeConfig;
}

function stripBom(raw: string) {
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

function parseConfigFile(raw: string, label: string) {
  const normalized = stripBom(raw).trim();
  if (!normalized) {
    throw new Error(`${label} is empty.`);
  }

  const parsed = validateRuntimeConfigShape(JSON.parse(normalized) as unknown, label, {
    allowLegacyPortfolioDates: true,
  });
  const normalizedConfig = mergeRuntimeConfig(parsed);
  validateRuntimeConfigShape(normalizedConfig, label);
  return normalizedConfig;
}

export function normalizeRuntimeConfig(config: RuntimeConfig): RuntimeConfig {
  return mergeRuntimeConfig(config);
}

export function createConfigStore(options: ConfigStoreOptions = {}) {
  const dataDir = options.dataDir ?? defaultDataDir;
  const configPath = path.join(dataDir, CONFIG_FILE_NAME);
  const backupPath = path.join(dataDir, BACKUP_FILE_NAME);
  const queueKey = path.resolve(configPath);

  async function ensureDataDir() {
    await mkdir(dataDir, { recursive: true });
  }

  async function readConfigFile(filePath: string) {
    const raw = await readFile(filePath, "utf8");
    return parseConfigFile(raw, path.basename(filePath));
  }

  async function loadBackupOrDefault(primaryError: unknown): Promise<RuntimeConfig> {
    try {
      return await readConfigFile(backupPath);
    } catch (backupError) {
      if (isMissingFile(primaryError) && isMissingFile(backupError)) {
        return mergeRuntimeConfig(defaultConfig);
      }

      if (isMissingFile(backupError)) {
        throw new Error("runtime-config.json is damaged or empty and no backup is available.");
      }

      throw new Error("runtime-config.json and runtime-config.backup.json cannot be parsed.");
    }
  }

  async function loadConfig(): Promise<RuntimeConfig> {
    await ensureDataDir();

    try {
      return await readConfigFile(configPath);
    } catch (error) {
      return loadBackupOrDefault(error);
    }
  }

  async function writeConfigAtomically(config: RuntimeConfig) {
    await ensureDataDir();
    validateRuntimeConfigShape(config, "new runtime config");
    const serialized = JSON.stringify(config, null, 2);
    const tempPath = path.join(dataDir, `.runtime-config.${randomUUID()}.tmp`);
    const backupTempPath = path.join(dataDir, `.runtime-config.backup.${randomUUID()}.tmp`);
    await writeFile(tempPath, serialized, "utf8");
    await rename(tempPath, configPath);
    await writeFile(backupTempPath, serialized, "utf8");
    await rename(backupTempPath, backupPath);
  }

  function enqueueWrite<T>(operation: () => Promise<T>) {
    const previous = configWriteChains.get(queueKey) ?? Promise.resolve();
    const task = previous.then(operation);
    configWriteChains.set(queueKey, task.then(
      () => undefined,
      () => undefined,
    ));
    return task;
  }

  async function saveConfig(config: RuntimeConfig) {
    await enqueueWrite(async () => {
      validateRuntimeConfigShape(config, "new runtime config");
      await writeConfigAtomically(mergeRuntimeConfig(config));
    });
  }

  async function updateConfig(updater: (current: RuntimeConfig) => RuntimeConfig) {
    return enqueueWrite(async () => {
      const current = await loadConfig();
      const updated = updater(current);
      validateRuntimeConfigShape(updated, "new runtime config");
      const next = mergeRuntimeConfig(updated);
      await writeConfigAtomically(next);
      return next;
    });
  }

  async function resetConfigToDefault() {
    return enqueueWrite(async () => {
      const next = mergeRuntimeConfig(defaultConfig);
      await writeConfigAtomically(next);
      return next;
    });
  }

  return {
    ensureDataDir,
    loadConfig,
    resetConfigToDefault,
    saveConfig,
    updateConfig,
  };
}

const defaultStore = createConfigStore();

export async function ensureDataDir() {
  return defaultStore.ensureDataDir();
}

export async function loadConfig(): Promise<RuntimeConfig> {
  return defaultStore.loadConfig();
}

export async function saveConfig(config: RuntimeConfig) {
  return defaultStore.saveConfig(config);
}

export async function updateConfig(updater: (current: RuntimeConfig) => RuntimeConfig) {
  return defaultStore.updateConfig(updater);
}

export async function resetConfigToDefault() {
  return defaultStore.resetConfigToDefault();
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
