import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  analyzeItem,
  applyPushSignal,
  buildRecommendationResponse,
  isAutonomousRecommendationEligible,
} from "./analytics.js";
import {
  candidateMatchesScannerScopes,
  DEFAULT_HOLO_STICKER_SERIES,
  DEFAULT_RECOMMENDATION_SCOPES,
  normalizeHoloStickerSeries,
  normalizeRecommendationScopes,
  RECOMMENDATION_SCOPE_LABELS,
} from "./item-taxonomy.js";
import { CsfloatClient } from "./csfloat-client.js";
import { CsqaqClient } from "./csqaq-client.js";
import { LocalMonitorLlmClient } from "./llm-client.js";
import { ensureDataDir, loadConfig, maskToken, updateConfig } from "./config-store.js";
import { listSnapshots } from "./history-store.js";
import type {
  AnalysisResponse,
  AutoRefreshConfig,
  HolderDrilldownResponse,
  MarketAnalysisResponse,
  MarketIndex,
  MarketIndexCandle,
  MarketIndexDetail,
  MonitorInventoryItem,
  PortfolioAdvice,
  PortfolioHolding,
  RecommendationResponse,
  RecommendationScopeKey,
  RefreshRuntimeStatus,
  RuntimeConfig,
  ScannerConfig,
  StickerSeriesKey,
  WatchlistSummary,
} from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "../dist");
const port = Number(process.env.PORT ?? 8787);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

const apiTokenFromEnv = process.env.CSQAQ_API_TOKEN?.trim();
const client = new CsqaqClient(async () => {
  const config = await loadConfig();
  return config.apiToken?.trim() || apiTokenFromEnv;
});
const csfloatClient = new CsfloatClient(async () => {
  const config = await loadConfig();
  return config.csfloatApiKey?.trim();
});
const llmClient = new LocalMonitorLlmClient();

const cache = new Map<string, { expiresAt: number; value: unknown }>();
const inflight = new Map<string, Promise<unknown>>();
const llmHydrationTasks = new Map<string, Promise<void>>();
const DEFAULT_AUTO_REFRESH: AutoRefreshConfig = {
  enabled: true,
  intervalMinutes: 20,
  includeDeep: true,
  maxDeepItems: 3,
};
const DEFAULT_SCANNER: ScannerConfig = {
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
const MIN_AUTONOMOUS_RECOMMENDATION_COUNT = 3;
const HOLDER_INVENTORY_PAGE_SIZE = 500;
const HOLDER_INVENTORY_MAX_PAGES = 50;
const MARKET_ANALYSIS_KEYS = [
  "init",
  "main_weapon",
  "covert_weapon",
  "knives",
  "gloves",
] as const;
const refreshState: RefreshRuntimeStatus = {
  ...DEFAULT_AUTO_REFRESH,
  running: false,
  lastRunAt: null,
  nextRunAt: null,
  lastRunMs: null,
  lastRunSummaryCount: 0,
  lastRunDeepCount: 0,
  lastRunTriggeredBy: null,
  lastError: null,
};
type ScannerCandidate = {
  id: string;
  name: string;
  image: string | null;
  marketHashName?: string | null;
  sourceLabel?: string | null;
  scopeHint?: RecommendationScopeKey | null;
};

type ScannerRuntime = {
  generation: number;
  signature: string;
  currentWindowStart: number;
  currentWindowCompletedIds: Set<string>;
  seenCandidateIds: Set<string>;
  deepAnalyzedIds: Set<string>;
  pool: Map<string, AnalysisResponse>;
  roundsRemaining: number;
  totalRoundsCompleted: number;
  lastRoundAt: string | null;
  lastBatchCandidates: string[];
  paused: boolean;
  autofilling: boolean;
  lastSource: string;
  fallbackSource: string | null;
  lastError: string | null;
};

const scannerRuntime: ScannerRuntime = {
  generation: 0,
  signature: "",
  currentWindowStart: 0,
  currentWindowCompletedIds: new Set<string>(),
  seenCandidateIds: new Set<string>(),
  deepAnalyzedIds: new Set<string>(),
  pool: new Map<string, AnalysisResponse>(),
  roundsRemaining: DEFAULT_SCANNER.maxRoundsPerCycle,
  totalRoundsCompleted: 0,
  lastRoundAt: null,
  lastBatchCandidates: [],
  paused: false,
  autofilling: false,
  lastSource: "scanner",
  fallbackSource: null,
  lastError: null,
};
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let deepRotationCursor = 0;
let scannerAutofillTask: Promise<void> | null = null;

function jsonOk(data: unknown) {
  return { ok: true, data };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "未知错误";
}

function hasConfiguredToken(config: RuntimeConfig) {
  return Boolean(config.apiToken?.trim() || apiTokenFromEnv);
}

function normalizeAutoRefreshConfig(config?: Partial<AutoRefreshConfig>): AutoRefreshConfig {
  return {
    enabled: config?.enabled ?? DEFAULT_AUTO_REFRESH.enabled,
    intervalMinutes: Math.min(180, Math.max(5, Number(config?.intervalMinutes ?? DEFAULT_AUTO_REFRESH.intervalMinutes))),
    includeDeep: config?.includeDeep ?? DEFAULT_AUTO_REFRESH.includeDeep,
    maxDeepItems: Math.min(12, Math.max(1, Number(config?.maxDeepItems ?? DEFAULT_AUTO_REFRESH.maxDeepItems))),
  };
}

function normalizeScannerConfig(config?: Partial<ScannerConfig>): ScannerConfig {
  const hotWindowSize = Math.min(
    60,
    Math.max(10, Number(config?.hotWindowSize ?? DEFAULT_SCANNER.hotWindowSize)),
  );
  const randomSampleSize = Math.min(
    hotWindowSize,
    Math.min(20, Math.max(4, Number(config?.randomSampleSize ?? DEFAULT_SCANNER.randomSampleSize))),
  );
  return {
    enabled: config?.enabled ?? DEFAULT_SCANNER.enabled,
    candidatePages: Math.min(6, Math.max(1, Number(config?.candidatePages ?? DEFAULT_SCANNER.candidatePages))),
    candidatePageSize: Math.min(36, Math.max(12, Number(config?.candidatePageSize ?? DEFAULT_SCANNER.candidatePageSize))),
    deepAnalyzeLimit: Math.min(20, Math.max(3, Number(config?.deepAnalyzeLimit ?? DEFAULT_SCANNER.deepAnalyzeLimit))),
    recommendationLimit: Math.min(20, Math.max(6, Number(config?.recommendationLimit ?? DEFAULT_SCANNER.recommendationLimit))),
    featuredLimit: Math.min(6, Math.max(3, Number(config?.featuredLimit ?? DEFAULT_SCANNER.featuredLimit))),
    hotWindowSize,
    randomSampleSize,
    maxRoundsPerCycle: Math.min(
      30,
      Math.max(1, Number(config?.maxRoundsPerCycle ?? DEFAULT_SCANNER.maxRoundsPerCycle)),
    ),
    analysisScopes: normalizeRecommendationScopes(config?.analysisScopes),
    holoStickerSeries: normalizeHoloStickerSeries(config?.holoStickerSeries),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

function round(value: number | null, digits = 2) {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

function percentageChange(current: number | null, previous: number | null) {
  if (current == null || previous == null || previous <= 0) return null;
  return round(((current - previous) / previous) * 100, 2);
}

function formatSignedPercent(value: number | null, digits = 1) {
  if (value == null || !Number.isFinite(value)) return "--";
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function normalizeBuyDate(value: unknown, fallback?: string) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const source = typeof fallback === "string" && fallback ? fallback : new Date().toISOString();
  const parsed = new Date(source);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return parsed.toISOString().slice(0, 10);
}

function normalizePortfolioHolding(holding: PortfolioHolding): PortfolioHolding {
  return {
    ...holding,
    buyDate: normalizeBuyDate(holding.buyDate, holding.createdAt),
  };
}

function selectMarketRows(rows: MarketIndex[]) {
  const byKey = new Map(rows.map((row) => [row.nameKey, row]));
  return MARKET_ANALYSIS_KEYS.map((key) => byKey.get(key)).filter(
    (row): row is MarketIndex => Boolean(row),
  );
}

function movingAverage(values: number[], period: number) {
  if (values.length < period) return null;
  return average(values.slice(-period));
}

function countConsecutiveUpDays(candles: MarketIndexCandle[]) {
  let count = 0;
  for (let index = candles.length - 1; index > 0; index -= 1) {
    if (candles[index].c <= candles[index - 1].c) break;
    count += 1;
  }
  return count;
}

function buildVolumeState(candles: MarketIndexCandle[]): MarketAnalysisResponse["boards"][number]["volume"] {
  const recent = candles
    .slice(-3)
    .map((row) => row.v)
    .filter((value) => value > 0);
  const baseline = candles
    .slice(-23, -3)
    .map((row) => row.v)
    .filter((value) => value > 0);
  const recentAverage = average(recent);
  const baselineAverage = average(baseline);

  if (recentAverage == null || baselineAverage == null || baselineAverage <= 0) {
    return {
      available: false,
      ratio: null,
      recentAverage: round(recentAverage),
      baselineAverage: round(baselineAverage),
      summary: "成交量暂不可用，CSQAQ 指数 K 线当前未返回有效量能。",
    };
  }

  const ratio = round(recentAverage / baselineAverage, 2);
  return {
    available: true,
    ratio,
    recentAverage: round(recentAverage),
    baselineAverage: round(baselineAverage),
    summary:
      ratio != null && ratio >= 1.15
        ? `近 3 日量能约为前 20 日 ${ratio.toFixed(2)}x，资金活跃度抬升。`
        : ratio != null && ratio <= 0.75
          ? `近 3 日量能约为前 20 日 ${ratio.toFixed(2)}x，量能偏弱。`
          : `近 3 日量能约为前 20 日 ${ratio?.toFixed(2) ?? "--"}x，量能中性。`,
  };
}

function buildMarketIndexAnalysis(
  row: MarketIndex,
  detail: MarketIndexDetail | null,
  candles: MarketIndexCandle[],
): MarketAnalysisResponse["boards"][number] {
  const hasEnoughHistory = candles.length >= 20;
  const usableCandles = candles.length
    ? candles
    : [
        {
          t: Date.parse(row.updatedAt) || Date.now(),
          o: row.open || row.marketIndex,
          c: row.close || row.marketIndex,
          h: row.high || row.marketIndex,
          l: row.low || row.marketIndex,
          v: 0,
        },
      ];
  const closes = usableCandles.map((item) => item.c).filter((value) => value > 0);
  const latestClose = closes.at(-1) ?? row.close ?? row.marketIndex;
  const recent30 = usableCandles.slice(-30);
  const recent60 = usableCandles.slice(-60);
  const low30 = Math.min(...recent30.map((item) => item.l).filter((value) => value > 0));
  const low60 = Math.min(...recent60.map((item) => item.l).filter((value) => value > 0));
  const high30 = Math.max(...recent30.map((item) => item.h).filter((value) => value > 0));
  const ma7 = round(movingAverage(closes, 7));
  const ma20 = round(movingAverage(closes, 20));
  const change7d = closes.length >= 8 ? percentageChange(latestClose, closes.at(-8) ?? null) : null;
  const change30d = closes.length >= 31 ? percentageChange(latestClose, closes.at(-31) ?? null) : null;
  const lowDistance30d = Number.isFinite(low30) ? percentageChange(latestClose, low30) : null;
  const lowDistance60d = Number.isFinite(low60) ? percentageChange(latestClose, low60) : null;
  const highDistance30d = Number.isFinite(high30) ? percentageChange(latestClose, high30) : null;
  const consecutiveUpDays = countConsecutiveUpDays(usableCandles);
  const amplitude =
    detail?.amplitude ??
    (row.open > 0 ? round(((row.high - row.low) / row.open) * 100, 2) : null);
  const volume = buildVolumeState(usableCandles);

  let bottomScore = 18;
  if (lowDistance60d != null && lowDistance60d <= 3) bottomScore += 24;
  else if (lowDistance60d != null && lowDistance60d <= 8) bottomScore += 16;
  else if (lowDistance60d != null && lowDistance60d <= 14) bottomScore += 8;
  if (change30d != null && change30d <= -3) bottomScore += 14;
  else if (change30d != null && change30d <= 3) bottomScore += 8;
  if (change7d != null && change7d >= -1 && change7d <= 6) bottomScore += 12;
  if (ma7 != null && ma20 != null && ma7 <= ma20 * 1.015 && latestClose >= ma7 * 0.99) bottomScore += 12;
  if (amplitude != null && amplitude <= 6) bottomScore += 8;
  if (volume.ratio != null && volume.ratio >= 1.05) bottomScore += 8;
  if (row.chgRate > 0) bottomScore += 6;
  bottomScore = Math.round(clamp(bottomScore, 0, 100));

  let trendScore = 20;
  if (change7d != null && change7d > 0) trendScore += Math.min(22, change7d * 2.5);
  if (change30d != null && change30d > 0) trendScore += Math.min(22, change30d * 1.4);
  if (ma7 != null && ma20 != null && ma7 > ma20) trendScore += 18;
  else if (ma7 != null && ma20 != null && ma7 < ma20) trendScore -= 8;
  if (consecutiveUpDays >= 3) trendScore += 14;
  else if (consecutiveUpDays >= 2) trendScore += 8;
  if (highDistance30d != null && highDistance30d >= -3) trendScore += 10;
  if (volume.ratio != null && volume.ratio >= 1.1) trendScore += 8;
  else if (volume.ratio != null && volume.ratio <= 0.75) trendScore -= 6;
  if (row.chgRate > 0) trendScore += 4;
  else if (row.chgRate < -1) trendScore -= 5;
  trendScore = Math.round(clamp(trendScore, 0, 100));

  if (!hasEnoughHistory) {
    bottomScore = Math.min(bottomScore, 42);
    trendScore = Math.min(trendScore, 42);
  }

  const bottomState =
    bottomScore >= 65 ? "forming" : bottomScore >= 45 ? "watch" : "none";
  const trendState =
    trendScore >= 65
      ? "up"
      : trendScore <= 35 && (change7d ?? row.chgRate) < 0 && (ma7 == null || ma20 == null || ma7 < ma20)
        ? "down"
        : "neutral";
  const tone =
    trendState === "up"
      ? "positive"
      : trendState === "down"
        ? "negative"
        : bottomState === "forming" || bottomState === "watch"
          ? "warning"
          : "neutral";
  const bottomDetail = `距 60 日低点 ${formatSignedPercent(lowDistance60d)}，近 30 日 ${formatSignedPercent(change30d)}，MA7/MA20 ${ma7 ?? "--"}/${ma20 ?? "--"}。`;
  const trendDetail = `近 7 日 ${formatSignedPercent(change7d)}，近 30 日 ${formatSignedPercent(change30d)}，连涨 ${consecutiveUpDays} 天，距 30 日高点 ${formatSignedPercent(highDistance30d)}。`;
  let summary = `${row.name} 当前结构中性，等待趋势或底部信号进一步清晰。`;
  if (!hasEnoughHistory) {
    summary = `${row.name} 历史 K 线不足，当前仅展示快照参考，暂不确认底部或趋势。`;
  } else if (trendState === "up") {
    summary = `${row.name} 已出现持续向上结构，短中期均线和涨幅更偏多头。`;
  } else if (bottomState === "forming") {
    summary = `${row.name} 有底部修复特征，位置接近低位且短线不再继续破底。`;
  } else if (bottomState === "watch") {
    summary = `${row.name} 接近底部观察区，但仍需要后续量价确认。`;
  } else if (trendState === "down") {
    summary = `${row.name} 仍偏弱，暂未看到可靠的底部或上行延续。`;
  }

  return {
    id: row.id,
    name: row.name,
    nameKey: row.nameKey,
    marketIndex: row.marketIndex,
    chgRate: row.chgRate,
    updatedAt: row.updatedAt,
    bottomState,
    trendState,
    tone,
    bottomScore,
    trendScore,
    summary,
    bottomDetail,
    trendDetail,
    volume,
    metrics: {
      change7d,
      change30d,
      lowDistance30d: round(lowDistance30d),
      lowDistance60d: round(lowDistance60d),
      highDistance30d: round(highDistance30d),
      ma7,
      ma20,
      consecutiveUpDays,
      amplitude: round(amplitude),
    },
  };
}

function getInventoryStackKey(item: MonitorInventoryItem) {
  if (item.goodId) return `good:${item.goodId}`;
  return [
    "fallback",
    item.marketName,
    item.categoryName,
    item.iconUrl ?? "no-icon",
  ].join("|");
}

function stackInventoryItems(items: MonitorInventoryItem[]) {
  const stacks = new Map<string, MonitorInventoryItem>();

  for (const item of items) {
    const key = getInventoryStackKey(item);
    const existing = stacks.get(key);
    if (!existing) {
      stacks.set(key, { ...item });
      continue;
    }

    existing.count += item.count;
    existing.tradableCount += item.tradableCount;
    existing.cooldownCount += item.cooldownCount;
    existing.tradable = existing.tradableCount > 0;
    existing.price = existing.price ?? item.price;
    existing.iconUrl = existing.iconUrl ?? item.iconUrl;
    existing.goodId = existing.goodId ?? item.goodId;
    existing.createdAt = existing.createdAt ?? item.createdAt;
  }

  return [...stacks.values()];
}

async function loadAllMonitorTaskInventory(taskId: string | number) {
  const items: MonitorInventoryItem[] = [];

  for (let pageIndex = 1; pageIndex <= HOLDER_INVENTORY_MAX_PAGES; pageIndex += 1) {
    const pageItems = await client.getMonitorTaskInventory(
      taskId,
      pageIndex,
      HOLDER_INVENTORY_PAGE_SIZE,
    );
    items.push(...pageItems);

    if (pageItems.length < HOLDER_INVENTORY_PAGE_SIZE) {
      break;
    }
  }

  if (items.length >= HOLDER_INVENTORY_PAGE_SIZE * HOLDER_INVENTORY_MAX_PAGES) {
    throw new Error("公开库存数量过大，暂未完成完整堆叠，请稍后缩小查看范围。");
  }

  return items;
}

async function loadMarketAnalysisResponse(): Promise<MarketAnalysisResponse> {
  const config = await loadConfig();
  const rows = await withCache("market:overview", 60_000, () => client.getCurrentData());
  const selectedRows = selectMarketRows(rows);
  const warnings: string[] = [];
  const canLoadHistory = hasConfiguredToken(config);

  if (!canLoadHistory) {
    warnings.push("未配置 CSQAQ ApiToken，指数分析仅使用当前快照。");
  }

  const analyses: MarketAnalysisResponse["boards"] = [];
  for (const row of selectedRows) {
    let detail: MarketIndexDetail | null = null;
    let candles: MarketIndexCandle[] = [];

    if (canLoadHistory) {
      const [detailResult, klineResult] = await Promise.allSettled([
        client.getSubData(row.id),
        client.getSubKline(row.id),
      ]);

      if (detailResult.status === "fulfilled") {
        detail = detailResult.value;
      } else {
        warnings.push(`${row.name} 指数详情读取失败：${getErrorMessage(detailResult.reason)}`);
      }

      if (klineResult.status === "fulfilled") {
        candles = klineResult.value;
      } else {
        warnings.push(`${row.name} K 线读取失败：${getErrorMessage(klineResult.reason)}`);
      }
    }

    analyses.push(buildMarketIndexAnalysis(row, detail, candles));
  }

  return {
    updatedAt: new Date().toISOString(),
    source: "csqaq",
    overall: analyses.find((item) => item.nameKey === "init") ?? analyses[0] ?? null,
    boards: analyses.filter((item) => item.nameKey !== "init"),
    warnings: warnings.slice(0, 6),
  };
}

function createEmptyRecommendationResponse(scanner = DEFAULT_SCANNER): RecommendationResponse {
  const completedRoundsInCycle = Math.max(0, scanner.maxRoundsPerCycle - scannerRuntime.roundsRemaining);
  return {
    updatedAt: new Date().toISOString(),
    universeCount: 0,
    featured: [],
    positive: [],
    watch: [],
    risk: [],
    scanner: {
      source: "scanner",
      candidatePages: scanner.candidatePages,
      candidatePageSize: scanner.candidatePageSize,
      scannedCandidateCount: 0,
      deepAnalyzedCount: 0,
      recommendationLimit: scanner.recommendationLimit,
      featuredLimit: scanner.featuredLimit,
      sortBy: "建仓评分降序",
      hotWindowSize: scanner.hotWindowSize,
      randomSampleSize: scanner.randomSampleSize,
      analysisScopes: scanner.analysisScopes,
      holoStickerSeries: scanner.holoStickerSeries,
      windowRangeStart: scannerRuntime.currentWindowStart + 1,
      windowRangeEnd: scannerRuntime.currentWindowStart + scanner.hotWindowSize,
      poolSize: scannerRuntime.pool.size,
      completedRoundsInCycle,
      totalRoundsCompleted: scannerRuntime.totalRoundsCompleted,
      roundsRemaining: scannerRuntime.roundsRemaining,
      maxRoundsPerCycle: scanner.maxRoundsPerCycle,
      paused: scannerRuntime.paused,
      autofilling: scannerRuntime.autofilling,
      minimumTargetCount: MIN_AUTONOMOUS_RECOMMENDATION_COUNT,
      lastRoundAt: scannerRuntime.lastRoundAt,
      lastBatchCandidates: scannerRuntime.lastBatchCandidates,
      fallbackSource: scannerRuntime.fallbackSource,
    },
    boards: [],
  };
}

function createScannerSignature(scanner: ScannerConfig) {
  return JSON.stringify({
    enabled: scanner.enabled,
    candidatePages: scanner.candidatePages,
    candidatePageSize: scanner.candidatePageSize,
    deepAnalyzeLimit: scanner.deepAnalyzeLimit,
    recommendationLimit: scanner.recommendationLimit,
    featuredLimit: scanner.featuredLimit,
    hotWindowSize: scanner.hotWindowSize,
    randomSampleSize: scanner.randomSampleSize,
    maxRoundsPerCycle: scanner.maxRoundsPerCycle,
    analysisScopes: scanner.analysisScopes,
    holoStickerSeries: scanner.holoStickerSeries,
  });
}

function resetScannerRuntime(scanner: ScannerConfig) {
  scannerRuntime.generation += 1;
  scannerRuntime.signature = createScannerSignature(scanner);
  scannerRuntime.currentWindowStart = 0;
  scannerRuntime.currentWindowCompletedIds = new Set<string>();
  scannerRuntime.seenCandidateIds = new Set<string>();
  scannerRuntime.deepAnalyzedIds = new Set<string>();
  scannerRuntime.pool = new Map<string, AnalysisResponse>();
  scannerRuntime.roundsRemaining = scanner.maxRoundsPerCycle;
  scannerRuntime.totalRoundsCompleted = 0;
  scannerRuntime.lastRoundAt = null;
  scannerRuntime.lastBatchCandidates = [];
  scannerRuntime.paused = false;
  scannerRuntime.autofilling = false;
  scannerRuntime.lastSource = "scanner";
  scannerRuntime.fallbackSource = null;
  scannerRuntime.lastError = null;
  scannerAutofillTask = null;
  cache.delete("scanner:recommendations");
}

function syncScannerRuntime(scanner: ScannerConfig) {
  const nextSignature = createScannerSignature(scanner);
  if (scannerRuntime.signature !== nextSignature) {
    resetScannerRuntime(scanner);
  }
}

function mulberry32(seed: number) {
  let next = seed >>> 0;
  return () => {
    next += 0x6d2b79f5;
    let hashed = Math.imul(next ^ (next >>> 15), 1 | next);
    hashed ^= hashed + Math.imul(hashed ^ (hashed >>> 7), 61 | hashed);
    return ((hashed ^ (hashed >>> 14)) >>> 0) / 4294967296;
  };
}

function pickSeededBatch<T>(rows: T[], count: number, seed: number) {
  if (rows.length <= count) {
    return [...rows];
  }

  const random = mulberry32(seed);
  const copy = [...rows];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex]!, copy[index]!];
  }
  return copy.slice(0, count);
}

function dedupeScannerCandidates(items: ScannerCandidate[]) {
  const map = new Map<string, ScannerCandidate>();
  for (const item of items) {
    if (!item.id || !item.name) continue;
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
      continue;
    }
    map.set(item.id, {
      ...existing,
      image: existing.image ?? item.image,
      marketHashName: existing.marketHashName ?? item.marketHashName,
      sourceLabel: existing.sourceLabel ?? item.sourceLabel,
      scopeHint: existing.scopeHint ?? item.scopeHint,
    });
  }
  return [...map.values()];
}

function normalizeAutonomousCandidateName(name: string) {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

function isExcludedAutonomousCandidate(candidate: ScannerCandidate, scanner: ScannerConfig) {
  const normalized = normalizeAutonomousCandidateName(candidate.name);
  if (!normalized) {
    return false;
  }

  if (normalized.includes("stattrak")) {
    return true;
  }

  const isSticker = normalized.includes("sticker") || normalized.includes("印花");
  if (isSticker && !(normalized.includes("holo") || normalized.includes("全息"))) {
    return true;
  }

  if (
    candidate.scopeHint &&
    candidate.scopeHint !== "holo_team_sticker" &&
    scanner.analysisScopes.includes(candidate.scopeHint)
  ) {
    return false;
  }

  if (!candidateMatchesScannerScopes(candidate.name, scanner)) {
    return true;
  }

  const obviousNonTargets = [
    "武器箱",
    "胶囊",
    "钥匙",
    "音乐盒",
    "补丁",
    "涂鸦",
    "graffiti",
    "collectible",
    "收藏品",
    "pass",
    "通行证",
    "package",
    "礼包",
    "case",
    "capsule",
    "key",
  ];

  return obviousNonTargets.some((keyword) => normalized.includes(keyword));
}

function scannerCandidateMatchesScope(candidate: ScannerCandidate, scanner: ScannerConfig) {
  if (
    candidate.scopeHint &&
    candidate.scopeHint !== "holo_team_sticker" &&
    scanner.analysisScopes.includes(candidate.scopeHint)
  ) {
    return true;
  }
  return candidateMatchesScannerScopes(candidate.name, scanner);
}

function countActionableRecommendations(response: RecommendationResponse) {
  return response.positive.length + response.watch.length;
}

async function ensureScannerMinimumInBackground(
  force: boolean,
  trigger: "manual" | "scheduled" | "startup" | "continue" | "api" = "api",
  minimumCount = MIN_AUTONOMOUS_RECOMMENDATION_COUNT,
  minimumRounds = 0,
) {
  if (scannerAutofillTask) {
    return scannerAutofillTask;
  }

  scannerRuntime.autofilling = true;
  const generation = scannerRuntime.generation;
  scannerAutofillTask = (async () => {
    try {
      const config = await loadConfig();
      const scanner = normalizeScannerConfig(config.scanner);
      syncScannerRuntime(scanner);

      if (scannerRuntime.generation !== generation) {
        return;
      }

      if (!hasConfiguredToken(config) || !scanner.enabled) {
        return;
      }

      let snapshot = await buildScannerRecommendations(force);
      let loops = 0;
      const maxLoops = Math.max(1, scannerRuntime.roundsRemaining);

      while (
        loops < maxLoops &&
        !scannerRuntime.paused &&
        scannerRuntime.roundsRemaining > 0 &&
        scannerRuntime.generation === generation &&
        (loops < minimumRounds || countActionableRecommendations(snapshot) < minimumCount)
      ) {
        snapshot = await runScannerRound(force && loops === 0, trigger, generation);
        loops += 1;
      }
    } catch (error) {
      if (scannerRuntime.generation === generation) {
        scannerRuntime.lastError = getErrorMessage(error);
      }
    } finally {
      if (scannerRuntime.generation === generation) {
        scannerRuntime.autofilling = false;
        scannerAutofillTask = null;
      }
    }
  })();

  return scannerAutofillTask;
}

function buildScannerSnapshot(
  scanner: ScannerConfig,
  source: string,
  fallbackSource: string | null,
): RecommendationResponse {
  const response = buildRecommendationResponse([...scannerRuntime.pool.values()], {
    recommendationLimit: scanner.recommendationLimit,
    featuredLimit: scanner.featuredLimit,
    scanner: {
      source,
      candidatePages: scanner.candidatePages,
      candidatePageSize: scanner.candidatePageSize,
      scannedCandidateCount: scannerRuntime.seenCandidateIds.size,
      deepAnalyzedCount: scannerRuntime.deepAnalyzedIds.size,
      recommendationLimit: scanner.recommendationLimit,
      featuredLimit: scanner.featuredLimit,
      sortBy: "建仓推荐评分降序",
      hotWindowSize: scanner.hotWindowSize,
      randomSampleSize: scanner.randomSampleSize,
      analysisScopes: scanner.analysisScopes,
      holoStickerSeries: scanner.holoStickerSeries,
      windowRangeStart: scannerRuntime.currentWindowStart + 1,
      windowRangeEnd: scannerRuntime.currentWindowStart + scanner.hotWindowSize,
      poolSize: scannerRuntime.pool.size,
      completedRoundsInCycle: Math.max(0, scanner.maxRoundsPerCycle - scannerRuntime.roundsRemaining),
      totalRoundsCompleted: scannerRuntime.totalRoundsCompleted,
      roundsRemaining: scannerRuntime.roundsRemaining,
      maxRoundsPerCycle: scanner.maxRoundsPerCycle,
      paused: scannerRuntime.paused,
      autofilling: scannerRuntime.autofilling,
      minimumTargetCount: MIN_AUTONOMOUS_RECOMMENDATION_COUNT,
      lastRoundAt: scannerRuntime.lastRoundAt,
      lastBatchCandidates: scannerRuntime.lastBatchCandidates,
      fallbackSource,
    },
  });

  cache.set("scanner:recommendations", {
    expiresAt: Date.now() + 15 * 60_000,
    value: response,
  });
  return response;
}

type ScopedCandidateQuery = {
  cacheKey: string;
  sourceLabel: string;
  scopeHint: RecommendationScopeKey;
  search?: string;
  filter?: Record<string, string[]>;
};

const GUN_TYPE_FILTERS = ["不限_步枪", "不限_手枪", "不限_微型冲锋枪", "不限_霰弹枪", "不限_机枪"];
const TARGET_WEAR_FILTERS = ["崭新出厂", "略有磨损", "久经沙场"];
const STICKER_SERIES_SEARCH: Record<StickerSeriesKey, string[]> = {
  stockholm_2021: ["斯德哥尔摩", "Stockholm 2021"],
  antwerp_2022: ["安特卫普", "Antwerp 2022"],
  rio_2022: ["里约", "Rio 2022"],
  paris_2023: ["巴黎", "Paris 2023"],
  copenhagen_2024: ["哥本哈根", "Copenhagen 2024"],
  shanghai_2024: ["上海", "Shanghai 2024"],
  other: ["全息", "Holo"],
};

function rotateRows<T>(rows: T[], offset: number) {
  if (!rows.length) return rows;
  const normalizedOffset = ((offset % rows.length) + rows.length) % rows.length;
  return [...rows.slice(normalizedOffset), ...rows.slice(0, normalizedOffset)];
}

function buildScopedCandidateQueries(scanner: ScannerConfig): ScopedCandidateQuery[] {
  const queries: ScopedCandidateQuery[] = [];
  if (scanner.analysisScopes.includes("agent")) {
    queries.push({
      cacheKey: "agent",
      sourceLabel: "探员板块",
      scopeHint: "agent",
      filter: { 类型: ["不限_探员"] },
    });
  }
  if (scanner.analysisScopes.includes("holo_team_sticker")) {
    scanner.holoStickerSeries.forEach((series) => {
      STICKER_SERIES_SEARCH[series].forEach((search, index) => {
        queries.push({
          cacheKey: `holo:${series}:${index}`,
          sourceLabel: `全息战队贴纸 ${search}`,
          scopeHint: "holo_team_sticker",
          search,
          filter: { 类型: ["不限_印花"] },
        });
      });
    });
  }
  if (scanner.analysisScopes.includes("gun_skin")) {
    queries.push({
      cacheKey: "gun_skin",
      sourceLabel: "普通枪皮",
      scopeHint: "gun_skin",
      filter: {
        类型: GUN_TYPE_FILTERS,
        磨损: TARGET_WEAR_FILTERS,
      },
    });
  }
  return queries;
}

async function loadScopedPageListCandidates(
  scanner: ScannerConfig,
  force: boolean,
  targetCount: number,
) {
  const queries = buildScopedCandidateQueries(scanner);
  const pageSize = scanner.candidatePageSize;
  const queryBudget = Math.max(1, Math.min(scanner.candidatePages, 3));
  const activeQueries = rotateRows(queries, scannerRuntime.totalRoundsCompleted).slice(0, queryBudget);
  const items: ScannerCandidate[] = [];

  for (const query of activeQueries) {
    const page = await withCache(
      `scanner:scoped:${query.cacheKey}:1:${pageSize}`,
      10 * 60_000,
      () =>
        client.getPageList(1, pageSize, {
          search: query.search,
          filter: query.filter,
        }),
      force,
    );

    page.items.forEach((item) => {
      items.push({
        id: item.id,
        name: item.name,
        image: item.image,
        marketHashName: item.marketHashName,
        sourceLabel: query.sourceLabel,
        scopeHint: query.scopeHint,
      });
    });

    if (items.length >= targetCount) {
      return dedupeScannerCandidates(items);
    }
  }

  return dedupeScannerCandidates(items);
}

function isDiscontinuedContainerCandidate(container: { name: string; comment: string | null }) {
  const text = `${container.name} ${container.comment ?? ""}`.toLowerCase();
  return [
    "稀有掉落",
    "大行动",
    "绝版",
    "operation",
    "rare drop",
    "exclusive",
    "古堡",
    "cobblestone",
    "死城之谜",
    "cache",
    "神魔",
    "gods and monsters",
    "旭日",
    "rising sun",
    "解体厂",
    "chop shop",
    "挪威人",
    "norse",
    "运河水城",
    "canals",
    "圣马克镇",
    "st. marc",
    "st marc",
    "控制收藏品",
    "control collection",
    "浩劫收藏品",
    "havoc collection",
    "远古收藏品",
    "ancient collection",
    "列车停放站 2021",
    "train collection",
    "荒漠迷城 2021",
    "mirage collection",
    "炙热沙城 2021",
    "dust 2 collection",
    "殒命大厦 2021",
    "vertigo collection",
    "shattered web",
    "broken fang",
    "riptide",
    "bloodhound",
    "hydra",
    "wildfire",
  ].some((token) => text.includes(token));
}

async function loadDiscontinuedContainerCandidates(
  scanner: ScannerConfig,
  _force: boolean,
  targetCount: number,
) {
  if (!scanner.analysisScopes.includes("discontinued_collection_skin")) {
    return [];
  }

  const containers = await withCache(
    "scanner:container:list",
    30 * 60_000,
    () => client.getContainerDataInfo(),
    false,
  );
  const containerBudget =
    scanner.analysisScopes.length === 1
      ? Math.max(1, Math.min(2, scanner.candidatePages))
      : 1;
  const selectedContainers = rotateRows(
    containers.filter((container) => container.id && isDiscontinuedContainerCandidate(container)),
    scannerRuntime.totalRoundsCompleted,
  ).slice(0, containerBudget);
  const items: ScannerCandidate[] = [];

  for (const container of selectedContainers) {
    const rows = await withCache(
      `scanner:container:detail:${container.id}`,
      30 * 60_000,
      () => client.getContainerDetail(container.id),
      false,
    );
    rows.forEach((row) => {
      if (!row.id || !row.name) return;
      items.push({
        id: row.id,
        name: row.name,
        image: row.image,
        sourceLabel: `${container.name}${container.comment ? ` / ${container.comment}` : ""}`,
        scopeHint: "discontinued_collection_skin",
      });
    });
    if (items.length >= targetCount) {
      break;
    }
  }

  return dedupeScannerCandidates(items).filter((item) =>
    scannerCandidateMatchesScope(item, scanner),
  );
}

async function loadScopedScannerCandidates(
  scanner: ScannerConfig,
  force: boolean,
  targetCount: number,
) {
  const pageItems = await loadScopedPageListCandidates(scanner, force, targetCount);
  let discontinuedItems: ScannerCandidate[] = [];
  const shouldBackfillDiscontinued =
    scanner.analysisScopes.includes("discontinued_collection_skin") &&
    (scanner.analysisScopes.length === 1 || pageItems.length < scanner.hotWindowSize);

  if (shouldBackfillDiscontinued) {
    try {
      discontinuedItems = await loadDiscontinuedContainerCandidates(scanner, force, targetCount);
    } catch {
      discontinuedItems = [];
    }
  }
  return dedupeScannerCandidates([...discontinuedItems, ...pageItems]).filter((item) =>
    scannerCandidateMatchesScope(item, scanner),
  );
}

async function loadFallbackPageCandidates(
  scanner: ScannerConfig,
  force: boolean,
  targetCount: number,
) {
  const pageSize = scanner.candidatePageSize;
  const pagesNeeded = Math.max(1, Math.ceil(targetCount / pageSize));
  const items: ScannerCandidate[] = [];

  for (let pageIndex = 1; pageIndex <= pagesNeeded; pageIndex += 1) {
    const page = await withCache(
      `scanner:page:${pageIndex}:${pageSize}`,
      10 * 60_000,
      () => client.getPageList(pageIndex, pageSize),
      force,
    );

    page.items.forEach((item) => {
      items.push({
        id: item.id,
        name: item.name,
        image: item.image,
        marketHashName: item.marketHashName,
      });
    });

    if (items.length >= targetCount) {
      break;
    }
  }

  const scopedItems = dedupeScannerCandidates(items).filter((item) =>
    scannerCandidateMatchesScope(item, scanner),
  );
  return scopedItems;
}

async function loadScannerCandidates(
  scanner: ScannerConfig,
  force: boolean,
): Promise<{ source: string; fallbackSource: string | null; items: ScannerCandidate[] }> {
  const targetCount = Math.max(
    scanner.candidatePages * scanner.candidatePageSize,
    scanner.hotWindowSize * scanner.maxRoundsPerCycle,
    120,
  );
  const scopeLabels = scanner.analysisScopes.map((scope) => RECOMMENDATION_SCOPE_LABELS[scope]).join(" / ");

  try {
    const scopedItems = await loadScopedScannerCandidates(scanner, force, targetCount);
    if (scopedItems.length) {
      return {
        source: `scope:${scopeLabels || "自定义范围"}`,
        fallbackSource: null,
        items: scopedItems,
      };
    }
  } catch (error) {
    const scopedMessage = getErrorMessage(error);
    try {
      const items = await withCache(
        "scanner:popular:list",
        10 * 60_000,
        () => client.getPopularGoods(),
        force,
      );
      const scopedPopular = dedupeScannerCandidates(
        items
          .map((item) => ({
            id: item.id,
            name: item.name,
            image: item.image,
            marketHashName: item.marketHashName,
          }))
          .filter((item) => candidateMatchesScannerScopes(item.name, scanner)),
      );
      return {
        source: "info/get_popular_goods",
        fallbackSource: scopedPopular.length
          ? `定向候选池暂不可用，已回退热门榜：${scopedMessage}`
          : `定向候选池暂不可用，热门榜按当前范围过滤后为空：${scopedMessage}`,
        items: scopedPopular,
      };
    } catch (popularError) {
      const popularMessage = getErrorMessage(popularError);
      const pageItems = await loadFallbackPageCandidates(scanner, force, targetCount);
      return {
        source: "info/get_page_list",
        fallbackSource: `定向候选池和热门榜暂不可用，已回退公开饰品列表：${scopedMessage} / ${popularMessage}`,
        items: pageItems,
      };
    }
  }

  try {
    const items = await withCache(
      "scanner:popular:list",
      10 * 60_000,
      () => client.getPopularGoods(),
      force,
    );
    const popularCandidates = dedupeScannerCandidates(
      items.map((item) => ({
        id: item.id,
        name: item.name,
        image: item.image,
        marketHashName: item.marketHashName,
      })),
    );
    const scopedPopular = popularCandidates.filter((item) =>
      candidateMatchesScannerScopes(item.name, scanner),
    );
    return {
      source: "info/get_popular_goods",
      fallbackSource: scopedPopular.length
        ? "定向候选池暂未命中，已临时回退热门榜。"
        : "定向候选池和热门榜按当前范围过滤后均为空。",
      items: scopedPopular,
    };
  } catch (error) {
    const message = getErrorMessage(error);
    return {
      source: "info/get_page_list",
      fallbackSource: `热门榜接口当前不可用，已退回公开饰品列表：${message}`,
      items: await loadFallbackPageCandidates(scanner, force, targetCount),
    };
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFreshCachedAnalysis(cacheKey: string) {
  const current = cache.get(cacheKey);
  if (!current || current.expiresAt <= Date.now()) {
    return undefined;
  }

  return current.value as AnalysisResponse;
}

function pickRotatedEntries<T>(rows: T[], count: number) {
  if (!rows.length || count <= 0) {
    return [] as T[];
  }

  const safeCount = Math.min(rows.length, count);
  const start = deepRotationCursor % rows.length;
  const picked = Array.from({ length: safeCount }, (_, index) => rows[(start + index) % rows.length]);
  deepRotationCursor = (start + safeCount) % rows.length;
  return picked;
}

function shouldHydrateLlm(insight?: AnalysisResponse["llm"]) {
  return Boolean(
    llmClient.isEnabled() &&
      insight &&
      insight.status === "degraded" &&
      insight.generatedAt == null &&
      !insight.error,
  );
}

function buildPendingLlmInsight(previous?: AnalysisResponse["llm"]): AnalysisResponse["llm"] {
  if (
    previous &&
    (previous.status === "ok" || previous.pushReason !== "AI 正在后台刷新中")
  ) {
    return previous;
  }

  return {
    enabled: llmClient.isEnabled(),
    status: llmClient.isEnabled() ? "degraded" : "disabled",
    provider: previous?.provider ?? "Local OpenAI-Compatible",
    model: previous?.model ?? (process.env.LOCAL_LLM_MODEL ?? "gpt-5.4"),
    generatedAt: previous?.generatedAt ?? null,
    summary: llmClient.isEnabled()
      ? "AI 正在后台更新，本轮先展示规则引擎结果。"
      : "本地 LLM 未启用，当前仅使用规则引擎。",
    regime: previous?.regime ?? "neutral",
    confidence: previous?.confidence ?? null,
    buildSignalStrength: previous?.buildSignalStrength ?? null,
    dumpSignalStrength: previous?.dumpSignalStrength ?? null,
    cooldownAssessment: previous?.cooldownAssessment ?? "unknown",
    alertDecision: previous?.alertDecision ?? "unavailable",
    expected7dRange: previous?.expected7dRange ?? {
      lowPct: null,
      basePct: null,
      highPct: null,
    },
    evidence: previous?.evidence ?? [],
    counterSignals: previous?.counterSignals ?? [],
    actionPlan: previous?.actionPlan ?? [],
    nextCheckMinutes: previous?.nextCheckMinutes ?? null,
    shouldPushAlert: previous?.shouldPushAlert ?? false,
    pushReason: llmClient.isEnabled() ? "AI 正在后台刷新中" : "本地 LLM 未启用。",
  };
}

function updateCachedAnalysis(
  cacheKey: string,
  ttlMs: number,
  analysis: AnalysisResponse,
) {
  const current = cache.get(cacheKey);
  cache.set(cacheKey, {
    expiresAt: current?.expiresAt ?? Date.now() + ttlMs,
    value: analysis,
  });
}

function buildLlmFeaturePayload(analysis: AnalysisResponse) {
  const closes = analysis.charts.blendClose;
  const latest = closes.at(-1) ?? null;
  const prev = closes.length > 1 ? closes.at(-2) ?? null : null;
  const prev7 = closes.length > 7 ? closes.at(-8) ?? null : null;
  const prev30 = closes.length > 30 ? closes.at(-31) ?? null : null;
  const macd = analysis.indicators.macd;
  const kdj = analysis.indicators.kdj;
  const latestMacdIndex = Math.max(0, macd.dif.length - 1);
  const previousMacdIndex = Math.max(0, latestMacdIndex - 1);
  const latestKdjIndex = Math.max(0, kdj.k.length - 1);
  const change1d =
    latest != null && prev != null && prev !== 0 ? ((latest - prev) / prev) * 100 : null;
  const change7d =
    latest != null && prev7 != null && prev7 !== 0 ? ((latest - prev7) / prev7) * 100 : null;
  const change30d =
    latest != null && prev30 != null && prev30 !== 0 ? ((latest - prev30) / prev30) * 100 : null;

  const returns = closes
    .map((value, index) => (index === 0 ? null : ((value - closes[index - 1]) / closes[index - 1]) * 100))
    .filter((value): value is number => value != null && Number.isFinite(value));
  const recent = returns.slice(-20);
  const mean = recent.length
    ? recent.reduce((sum, value) => sum + value, 0) / recent.length
    : 0;
  const volatility = recent.length
    ? Math.sqrt(recent.reduce((sum, value) => sum + (value - mean) ** 2, 0) / recent.length)
    : 0;

  return {
    item: analysis.item,
    priceTier: analysis.marketContext.priceTier,
    market: {
      latestBlend: latest,
      latestBuff: analysis.market.buffClose,
      latestYyyp: analysis.market.yyypClose,
      spreadPct: analysis.market.spreadPct,
      sellPressure:
        ((analysis.market.buffSell ?? 0) + (analysis.market.yyypSell ?? 0)) /
        Math.max(1, (analysis.market.buffBuy ?? 0) + (analysis.market.yyypBuy ?? 0)),
    },
    trends: {
      change1d,
      change7d,
      change30d,
      volumeSpike: analysis.summary.volumeSpike,
      volatility: Number(volatility.toFixed(2)),
    },
    indicators: {
      macd: {
        signal: macd.signal,
        summary: macd.summary,
        dif: macd.dif[latestMacdIndex] ?? null,
        dea: macd.dea[latestMacdIndex] ?? null,
        hist: macd.hist[latestMacdIndex] ?? null,
        prevHist: macd.hist[previousMacdIndex] ?? null,
      },
      kdj: {
        signal: kdj.signal,
        summary: kdj.summary,
        k: kdj.k[latestKdjIndex] ?? null,
        d: kdj.d[latestKdjIndex] ?? null,
        j: kdj.j[latestKdjIndex] ?? null,
      },
    },
    statistic: analysis.statistic,
    holders: {
      top1: analysis.holders.top1,
      top5: analysis.holders.top5,
      top10: analysis.holders.top10,
      top5SharePct: analysis.holders.top5SharePct,
      top10SharePct: analysis.holders.top10SharePct,
      delta24h: analysis.holders.delta24h,
      delta7d: analysis.holders.delta7d,
    },
    scores: {
      entryScore: analysis.scores.entryScore,
      dumpRiskScore: analysis.scores.dumpRiskScore,
      entryReasons: analysis.scores.entryReasons.slice(0, 3),
      dumpReasons: analysis.scores.dumpReasons.slice(0, 3),
    },
    prediction: {
      direction: analysis.prediction.direction,
      confidence: analysis.prediction.confidence,
      expected7dPct: analysis.prediction.expected7dPct,
      cooldownRiskPct: analysis.prediction.cooldownRiskPct,
      lowBand: analysis.prediction.lowBand,
      baseBand: analysis.prediction.baseBand,
      highBand: analysis.prediction.highBand,
    },
    teamSignal: {
      status: analysis.marketContext.teamSignal.status,
      buildScore: analysis.marketContext.teamSignal.buildScore,
      exitScore: analysis.marketContext.teamSignal.exitScore,
      buildReasons: analysis.marketContext.teamSignal.buildReasons.slice(0, 3),
      exitReasons: analysis.marketContext.teamSignal.exitReasons.slice(0, 3),
    },
    strategy: {
      tone: analysis.strategy.tone,
      action: analysis.strategy.action,
      actionSummary: analysis.strategy.actionSummary,
      positionMinPct: analysis.strategy.positionMinPct,
      positionMaxPct: analysis.strategy.positionMaxPct,
      targetPrice: analysis.strategy.targetPrice,
      defensePrice: analysis.strategy.defensePrice,
      lockDays: analysis.strategy.lockDays,
      cooldownSummary: analysis.strategy.cooldownSummary,
    },
    alerts: analysis.alerts.slice(0, 4).map((alert) => ({
      level: alert.level,
      title: alert.title,
      detail: alert.detail,
    })),
  };
}

function scheduleLlmHydration(goodId: string, analysis: AnalysisResponse) {
  if (!llmClient.isEnabled() || llmHydrationTasks.has(goodId)) {
    return;
  }

  const task = (async () => {
    // eslint-disable-next-line no-console
    console.log(`[llm] hydration start ${goodId}`);
    const recentSnapshots = await listSnapshots(goodId);
    const llm = await llmClient.analyzeItem(buildLlmFeaturePayload(analysis), {
      snapshotCount: recentSnapshots.length,
      recentSnapshots: recentSnapshots.slice(-6),
      recentStatisticSeries: [],
    });

    const cacheKey = `deep:${goodId}`;
    const current = cache.get(cacheKey)?.value as AnalysisResponse | undefined;
    const nextAnalysis =
      current != null
        ? {
            ...current,
            llm:
              current.llm.status === "ok" && llm.status !== "ok"
                ? current.llm
                : llm,
          }
        : {
            ...analysis,
            llm,
          };
    const hydratedAnalysis = applyPushSignal(nextAnalysis);
    updateCachedAnalysis(cacheKey, 120_000, hydratedAnalysis);
    // eslint-disable-next-line no-console
    console.log(`[llm] hydration finish ${goodId} ${llm.status}`);
  })()
    .catch((error) => {
      // eslint-disable-next-line no-console
      console.error(`[llm] hydration error ${goodId}`, error);
      return undefined;
    })
    .finally(() => {
      llmHydrationTasks.delete(goodId);
    });

  llmHydrationTasks.set(goodId, task);
}

async function withCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  force = false,
) {
  const current = cache.get(key);
  if (!force && current && current.expiresAt > Date.now()) {
    return current.value as T;
  }

  const pending = inflight.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  const task = loader()
    .then((value) => {
      cache.set(key, { expiresAt: Date.now() + ttlMs, value });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, task as Promise<unknown>);
  return task;
}

async function scheduleNextRefresh(delayMs?: number, nextTrigger: RefreshRuntimeStatus["lastRunTriggeredBy"] = "scheduled") {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }

  const config = await loadConfig();
  const autoRefresh = normalizeAutoRefreshConfig(config.autoRefresh);
  Object.assign(refreshState, autoRefresh);

  if (!autoRefresh.enabled) {
    refreshState.nextRunAt = null;
    return;
  }

  const waitMs = delayMs ?? autoRefresh.intervalMinutes * 60_000;
  refreshState.nextRunAt = new Date(Date.now() + waitMs).toISOString();
  refreshTimer = setTimeout(async () => {
    await runAutoRefresh(nextTrigger);
    await scheduleNextRefresh(undefined, "scheduled");
  }, waitMs);
}

async function runAutoRefresh(
  trigger: RefreshRuntimeStatus["lastRunTriggeredBy"] = "manual",
) {
  if (refreshState.running) {
    return refreshState;
  }

  const config = await loadConfig();
  const autoRefresh = normalizeAutoRefreshConfig(config.autoRefresh);
  Object.assign(refreshState, autoRefresh, {
    running: true,
    lastRunTriggeredBy: trigger,
    lastError: null,
  });

  const startedAt = Date.now();
  const watchlist = config.watchlist;
  const scannerEnabled = normalizeScannerConfig(config.scanner).enabled;

  if (!autoRefresh.enabled || !hasConfiguredToken(config) || (watchlist.length === 0 && !scannerEnabled)) {
    Object.assign(refreshState, {
      running: false,
      lastRunAt: new Date().toISOString(),
      lastRunMs: 0,
      lastRunSummaryCount: 0,
      lastRunDeepCount: 0,
      lastError: !autoRefresh.enabled
        ? "自动刷新已关闭"
        : !hasConfiguredToken(config)
          ? "未配置 CSQAQ ApiToken"
          : "监控池为空，且自主推荐扫描未启用",
    });
    return refreshState;
  }

  let summaryCount = 0;
  let deepCount = 0;

  try {
    if (watchlist.length > 0) {
      for (const entry of watchlist) {
        await runAnalysis(entry.goodId, false, true);
        summaryCount += 1;
        await sleep(1200);
      }

      if (autoRefresh.includeDeep) {
        const deepEntries = pickRotatedEntries(watchlist, autoRefresh.maxDeepItems);
        for (const entry of deepEntries) {
          await runAnalysis(entry.goodId, true, true);
          deepCount += 1;
          await sleep(1200);
        }
      }
    }

    if (normalizeScannerConfig(config.scanner).enabled) {
      void ensureScannerMinimumInBackground(true, trigger ?? "manual").catch(() => undefined);
    }

    Object.assign(refreshState, {
      running: false,
      lastRunAt: new Date().toISOString(),
      lastRunMs: Date.now() - startedAt,
      lastRunSummaryCount: summaryCount,
      lastRunDeepCount: deepCount,
      lastError: null,
    });
  } catch (error) {
    Object.assign(refreshState, {
      running: false,
      lastRunAt: new Date().toISOString(),
      lastRunMs: Date.now() - startedAt,
      lastRunSummaryCount: summaryCount,
      lastRunDeepCount: deepCount,
      lastError: getErrorMessage(error),
    });
  }

  return refreshState;
}

app.get("/api/health", async (_request, response) => {
  const config = await loadConfig();
  const autoRefresh = normalizeAutoRefreshConfig(config.autoRefresh);
  response.json(
    jsonOk({
      configured: hasConfiguredToken(config),
      watchlistCount: config.watchlist.length,
      llmEnabled: llmClient.isEnabled(),
      autoRefreshEnabled: autoRefresh.enabled,
    }),
  );
});

app.get("/api/ai/health", async (_request, response) => {
  const payload = await llmClient.health();
  response.json(jsonOk(payload));
});

app.get("/api/config", async (_request, response) => {
  const config = await loadConfig();
  response.json(
    jsonOk({
      configured: hasConfiguredToken(config),
      maskedToken: maskToken(config.apiToken ?? apiTokenFromEnv),
      maskedCsfloatApiKey: maskToken(config.csfloatApiKey),
      watchlist: config.watchlist,
      platformMap: config.platformMap ?? null,
      autoRefresh: normalizeAutoRefreshConfig(config.autoRefresh),
      scanner: normalizeScannerConfig(config.scanner),
    }),
  );
});

app.get("/api/refresh/status", async (_request, response) => {
  const config = await loadConfig();
  const autoRefresh = normalizeAutoRefreshConfig(config.autoRefresh);
  response.json(
    jsonOk({
      ...refreshState,
      ...autoRefresh,
    } satisfies RefreshRuntimeStatus),
  );
});

app.post("/api/refresh/run", async (_request, response) => {
  void runAutoRefresh("manual");
  void scheduleNextRefresh();
  response.json(
    jsonOk({
      started: !refreshState.running,
      running: true,
    }),
  );
});

app.post("/api/config/auto-refresh", async (request, response) => {
  try {
    const body = z
      .object({
        enabled: z.boolean().optional(),
        intervalMinutes: z.number().int().min(5).max(180).optional(),
        includeDeep: z.boolean().optional(),
        maxDeepItems: z.number().int().min(1).max(12).optional(),
      })
      .parse(request.body);

    const nextConfig = await updateConfig((current) => ({
      ...current,
      autoRefresh: normalizeAutoRefreshConfig({
        ...current.autoRefresh,
        ...body,
      }),
    }));

    void scheduleNextRefresh(nextConfig.autoRefresh?.enabled ? 10_000 : undefined, "scheduled");
    response.json(jsonOk(nextConfig.autoRefresh ?? DEFAULT_AUTO_REFRESH));
  } catch (error) {
    response.status(400).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.post("/api/config/scanner", async (request, response) => {
  try {
    const body = z
      .object({
        enabled: z.boolean().optional(),
        candidatePages: z.number().int().min(1).max(6).optional(),
        candidatePageSize: z.number().int().min(12).max(36).optional(),
        deepAnalyzeLimit: z.number().int().min(3).max(20).optional(),
        recommendationLimit: z.number().int().min(6).max(20).optional(),
        featuredLimit: z.number().int().min(3).max(6).optional(),
        hotWindowSize: z.number().int().min(10).max(60).optional(),
        randomSampleSize: z.number().int().min(4).max(20).optional(),
        maxRoundsPerCycle: z.number().int().min(1).max(30).optional(),
        analysisScopes: z
          .array(z.enum(["agent", "holo_team_sticker", "gun_skin", "discontinued_collection_skin"]))
          .optional(),
        holoStickerSeries: z
          .array(
            z.enum([
              "stockholm_2021",
              "antwerp_2022",
              "rio_2022",
              "paris_2023",
              "copenhagen_2024",
              "shanghai_2024",
              "other",
            ]),
          )
          .optional(),
      })
      .parse(request.body);

    const nextConfig = await updateConfig((current) => ({
      ...current,
      scanner: normalizeScannerConfig({
        ...current.scanner,
        ...body,
      }),
    }));

    resetScannerRuntime(normalizeScannerConfig(nextConfig.scanner));
    response.json(jsonOk(normalizeScannerConfig(nextConfig.scanner)));
  } catch (error) {
    response.status(400).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.post("/api/config/token", async (request, response) => {
  try {
    const body = z
      .object({
        apiToken: z.string().min(8),
        bindIp: z.boolean().optional(),
      })
      .parse(request.body);

    const nextConfig = await updateConfig((current) => ({
      ...current,
      apiToken: body.apiToken.trim(),
    }));

    let bindResult: string | null = null;
    if (body.bindIp) {
      bindResult = await client.bindLocalIp();
    }

    resetScannerRuntime(normalizeScannerConfig(nextConfig.scanner));
    cache.delete("market:analysis");
    void scheduleNextRefresh(10_000, "scheduled");
    response.json(
      jsonOk({
        configured: true,
        maskedToken: maskToken(nextConfig.apiToken),
        bindResult,
      }),
    );
  } catch (error) {
    response.status(400).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.post("/api/config/csfloat-key", async (request, response) => {
  try {
    const body = z
      .object({
        apiKey: z.string().trim().min(8),
      })
      .parse(request.body);

    const nextConfig = await updateConfig((current) => ({
      ...current,
      csfloatApiKey: body.apiKey.trim(),
    }));

    cache.delete("scanner:recommendations");
    response.json(
      jsonOk({
        maskedCsfloatApiKey: maskToken(nextConfig.csfloatApiKey),
      }),
    );
  } catch (error) {
    response.status(400).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.post("/api/config/bind-ip", async (_request, response) => {
  try {
    const result = await client.bindLocalIp();
    response.json(jsonOk({ message: result }));
  } catch (error) {
    response.status(400).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.post("/api/config/watchlist", async (request, response) => {
  try {
    const body = z
      .object({
        goodId: z.string().min(1),
        name: z.string().optional(),
      })
      .parse(request.body);

    const config = await updateConfig((current) => {
      const exists = current.watchlist.some((row) => row.goodId === body.goodId);
      if (exists) {
        return current;
      }

      return {
        ...current,
        watchlist: [...current.watchlist, { goodId: body.goodId, name: body.name }],
      };
    });

    void scheduleNextRefresh(10_000, "scheduled");
    response.json(jsonOk(config.watchlist));
    warmDeepAnalysis(body.goodId);
  } catch (error) {
    response.status(400).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.delete("/api/config/watchlist/:goodId", async (request, response) => {
  try {
    const goodId = request.params.goodId;
    const config = await updateConfig((current) => ({
      ...current,
      watchlist: current.watchlist.filter((row) => row.goodId !== goodId),
    }));

    cache.delete(`summary:${goodId}`);
    cache.delete(`deep:${goodId}`);
    void scheduleNextRefresh(10_000, "scheduled");
    response.json(jsonOk(config.watchlist));
  } catch (error) {
    response.status(400).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.get("/api/portfolio", async (_request, response) => {
  const config = await loadConfig();
  response.json(
    jsonOk(
      (config.portfolio ?? [])
        .map((holding) => normalizePortfolioHolding(holding))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    ),
  );
});

app.post("/api/portfolio", async (request, response) => {
  try {
    const body = z
      .object({
        id: z.string().optional(),
        goodId: z.string().min(1),
        name: z.string().min(1),
        averageCost: z.coerce.number().positive(),
        quantity: z.coerce.number().positive(),
        buyDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        note: z.string().max(300).optional(),
      })
      .parse(request.body);

    const timestamp = new Date().toISOString();
    const config = await updateConfig((current) => {
      const portfolio = current.portfolio ?? [];
      const existing = portfolio.find((item) => item.id === body.id || item.goodId === body.goodId);
      const targetId =
        body.id ??
        existing?.id ??
        `holding_${Date.now()}_${body.goodId}`;
      const nextRow: PortfolioHolding = {
        id: targetId,
        goodId: body.goodId,
        name: body.name.trim(),
        averageCost: Number(body.averageCost.toFixed(2)),
        quantity: Number(body.quantity.toFixed(4)),
        buyDate: normalizeBuyDate(body.buyDate, existing?.buyDate ?? existing?.createdAt ?? timestamp),
        note: body.note?.trim() || undefined,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };

      return {
        ...current,
        portfolio: [
          ...portfolio.filter((item) => item.id !== targetId && item.goodId !== body.goodId),
          nextRow,
        ],
      };
    });

    response.json(jsonOk(config.portfolio ?? []));
  } catch (error) {
    response.status(400).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.delete("/api/portfolio/:holdingId", async (request, response) => {
  try {
    const holdingId = request.params.holdingId;
    const config = await updateConfig((current) => ({
      ...current,
      portfolio: (current.portfolio ?? []).filter((item) => item.id !== holdingId),
    }));
    response.json(jsonOk(config.portfolio ?? []));
  } catch (error) {
    response.status(400).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.get("/api/portfolio/advice", async (_request, response) => {
  try {
    const config = await loadConfig();
    if (!hasConfiguredToken(config)) {
      response.json(jsonOk([] satisfies PortfolioAdvice[]));
      return;
    }

    const holdings = config.portfolio ?? [];
    const rows: PortfolioAdvice[] = [];

    for (const holding of holdings) {
      try {
        const analysis =
          getFreshCachedAnalysis(`deep:${holding.goodId}`) ??
          (await runAnalysis(holding.goodId, true, false));
        rows.push(buildPortfolioAdviceForHolding(holding, analysis));
      } catch {
        continue;
      }
    }

    response.json(
      jsonOk(
        rows.sort(
          (left, right) =>
            Math.max(right.addScore, right.sellScore) - Math.max(left.addScore, left.sellScore),
        ),
      ),
    );
  } catch (error) {
    response.status(400).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.get("/api/search", async (request, response) => {
  try {
    const config = await loadConfig();
    if (!hasConfiguredToken(config)) {
      response.status(400).json({ ok: false, error: "请先配置 ApiToken。" });
      return;
    }

    const query = String(request.query.q ?? "").trim();
    if (query.length < 2) {
      response.json(jsonOk([]));
      return;
    }

    const rows = await client.searchSuggest(query);
    response.json(jsonOk(rows.slice(0, 12)));
  } catch (error) {
    response.status(400).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.get("/api/market/overview", async (_request, response) => {
  try {
    const rows = await withCache("market:overview", 60_000, () => client.getCurrentData());
    response.json(jsonOk(rows));
  } catch (error) {
    response.status(400).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.get("/api/market/analysis", async (_request, response) => {
  try {
    const analysis = await withCache("market:analysis", 5 * 60_000, () =>
      loadMarketAnalysisResponse(),
    );
    response.json(jsonOk(analysis));
  } catch (error) {
    response.status(400).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.get("/api/watchlist", async (_request, response) => {
  const config = await loadConfig();
  response.json(jsonOk(config.watchlist));
});

async function runAnalysis(
  goodId: string,
  includeHolders: boolean,
  force: boolean,
): Promise<AnalysisResponse> {
  const config = await loadConfig();

  if (!hasConfiguredToken(config)) {
    throw new Error("请先配置 CSQAQ ApiToken。");
  }

  const cacheKey = `${includeHolders ? "deep" : "summary"}:${goodId}`;
  const previousCached = cache.get(cacheKey)?.value as AnalysisResponse | undefined;
  const ttlMs = includeHolders ? 120_000 : 180_000;
  let analysis = await withCache(
    cacheKey,
    ttlMs,
    () =>
      analyzeItem(client, goodId, {
        includeHolders,
        platformMap: config.platformMap,
        persistPlatformMap: async (platformMap) => {
          await updateConfig((current) => ({
            ...current,
            platformMap,
          }));
        },
        llmClient: undefined,
        getCsfloatListingSummary: (marketHashName) => csfloatClient.getListingSummary(marketHashName),
      }),
    force,
  );

  if (includeHolders) {
    analysis.llm = buildPendingLlmInsight(previousCached?.llm);
    analysis = applyPushSignal(analysis);
    updateCachedAnalysis(cacheKey, ttlMs, analysis);
    if (shouldHydrateLlm(analysis.llm)) {
      scheduleLlmHydration(goodId, analysis);
    }
  }

  return analysis;
}

function warmDeepAnalysis(goodId: string) {
  void runAnalysis(goodId, true, false).catch(() => undefined);
}

function recommendationRankScore(analysis: AnalysisResponse) {
  return (
    analysis.scores.entryScore -
    Math.max(0, analysis.scores.dumpRiskScore) * 0.42 +
    analysis.marketContext.teamSignal.buildScore * 0.32 +
    analysis.earlyAccumulation.score * 0.18 +
    analysis.prediction.expected7dPct * 1.8 +
    analysis.tagProfile.hypeFitScore * 0.45 +
    (analysis.bottomReversal.triggered ? 24 : 0)
  );
}

async function runScannerRound(
  force: boolean,
  trigger: "manual" | "scheduled" | "startup" | "continue" | "api" = "manual",
  generation = scannerRuntime.generation,
): Promise<RecommendationResponse> {
  const config = await loadConfig();
  const scanner = normalizeScannerConfig(config.scanner);
  syncScannerRuntime(scanner);
  const isStale = () => scannerRuntime.generation !== generation;

  if (isStale()) {
    return buildScannerSnapshot(scanner, scannerRuntime.lastSource, scannerRuntime.fallbackSource);
  }

  if (!hasConfiguredToken(config) || !scanner.enabled) {
    return createEmptyRecommendationResponse(scanner);
  }

  if (scannerRuntime.paused || scannerRuntime.roundsRemaining <= 0) {
    scannerRuntime.paused = true;
    return buildScannerSnapshot(scanner, scannerRuntime.lastSource, scannerRuntime.fallbackSource);
  }

  const { source, fallbackSource, items } = await loadScannerCandidates(scanner, force);
  if (isStale()) {
    return buildScannerSnapshot(scanner, scannerRuntime.lastSource, scannerRuntime.fallbackSource);
  }

  if (!items.length) {
    scannerRuntime.lastSource = source;
    scannerRuntime.fallbackSource = fallbackSource;
    scannerRuntime.lastError = "当前候选池为空";
    return buildScannerSnapshot(scanner, source, fallbackSource);
  }

  if (scannerRuntime.currentWindowStart >= items.length) {
    scannerRuntime.currentWindowStart = 0;
    scannerRuntime.currentWindowCompletedIds.clear();
  }

  const getWindow = () => {
    let window = items.slice(
      scannerRuntime.currentWindowStart,
      scannerRuntime.currentWindowStart + scanner.hotWindowSize,
    );
    if (!window.length) {
      scannerRuntime.currentWindowStart = 0;
      window = items.slice(0, scanner.hotWindowSize);
    }
    return window;
  };

  let window = getWindow();
  let pending = window.filter((item) => !scannerRuntime.currentWindowCompletedIds.has(item.id));
  if (!pending.length) {
    scannerRuntime.currentWindowStart =
      (scannerRuntime.currentWindowStart + scanner.hotWindowSize) % Math.max(items.length, 1);
    scannerRuntime.currentWindowCompletedIds.clear();
    window = getWindow();
    pending = window;
  }

  const filteredPending = pending.filter((item) => !isExcludedAutonomousCandidate(item, scanner));
  const samplePool =
    filteredPending.length >= Math.min(scanner.randomSampleSize, pending.length)
      ? filteredPending
      : pending;

  const sample = pickSeededBatch(
    samplePool,
    scanner.randomSampleSize,
    scannerRuntime.currentWindowStart + scannerRuntime.totalRoundsCompleted * 97 + window.length,
  );

  const summaryAnalyses: AnalysisResponse[] = [];
  for (const candidate of sample) {
    if (isStale()) {
      return buildScannerSnapshot(scanner, scannerRuntime.lastSource, scannerRuntime.fallbackSource);
    }

    scannerRuntime.seenCandidateIds.add(candidate.id);
    try {
      const analysis = await runAnalysis(candidate.id, false, force);
      if (isStale()) {
        return buildScannerSnapshot(scanner, scannerRuntime.lastSource, scannerRuntime.fallbackSource);
      }

      summaryAnalyses.push({
        ...analysis,
        item: {
          ...analysis.item,
          name: analysis.item.name || candidate.name,
          image: analysis.item.image ?? candidate.image,
        },
      });
    } catch {
      continue;
    }
  }

  const summaryEligible = summaryAnalyses
    .filter((analysis) => isAutonomousRecommendationEligible(analysis, scanner))
    .sort(
      (left, right) =>
        recommendationRankScore(right) - recommendationRankScore(left) ||
        right.tagProfile.hypeFitScore - left.tagProfile.hypeFitScore ||
        right.scores.entryScore - left.scores.entryScore ||
        left.scores.dumpRiskScore - right.scores.dumpRiskScore,
    );

  const deepLimit = Math.min(scanner.deepAnalyzeLimit, summaryEligible.length);
  const deepAnalyses: AnalysisResponse[] = [];
  for (const summary of summaryEligible.slice(0, deepLimit)) {
    try {
      const deep = await runAnalysis(summary.item.goodId, true, force);
      if (isStale()) {
        return buildScannerSnapshot(scanner, scannerRuntime.lastSource, scannerRuntime.fallbackSource);
      }

      deepAnalyses.push(deep);
      scannerRuntime.deepAnalyzedIds.add(summary.item.goodId);
    } catch {
      if (isStale()) {
        return buildScannerSnapshot(scanner, scannerRuntime.lastSource, scannerRuntime.fallbackSource);
      }

      deepAnalyses.push(summary);
    }
  }

  if (isStale()) {
    return buildScannerSnapshot(scanner, scannerRuntime.lastSource, scannerRuntime.fallbackSource);
  }

  const deepMap = new Map(deepAnalyses.map((item) => [item.item.goodId, item]));
  const finalAnalyses = summaryAnalyses.map((item) => deepMap.get(item.item.goodId) ?? item);
  for (const analysis of finalAnalyses) {
    if (isAutonomousRecommendationEligible(analysis, scanner)) {
      scannerRuntime.pool.set(analysis.item.goodId, analysis);
    } else {
      scannerRuntime.pool.delete(analysis.item.goodId);
    }
  }

  sample.forEach((candidate) => {
    scannerRuntime.currentWindowCompletedIds.add(candidate.id);
  });

  if (window.every((item) => scannerRuntime.currentWindowCompletedIds.has(item.id))) {
    scannerRuntime.currentWindowStart =
      (scannerRuntime.currentWindowStart + scanner.hotWindowSize) % Math.max(items.length, 1);
    scannerRuntime.currentWindowCompletedIds.clear();
  }

  scannerRuntime.roundsRemaining = Math.max(0, scannerRuntime.roundsRemaining - 1);
  scannerRuntime.totalRoundsCompleted += 1;
  scannerRuntime.paused = scannerRuntime.roundsRemaining <= 0;
  scannerRuntime.lastRoundAt = new Date().toISOString();
  scannerRuntime.lastBatchCandidates = sample.map((item) => item.name);
  scannerRuntime.lastSource = source;
  scannerRuntime.fallbackSource = fallbackSource;
  scannerRuntime.lastError = null;

  return buildScannerSnapshot(scanner, source, fallbackSource);
}

async function buildScannerRecommendations(force: boolean): Promise<RecommendationResponse> {
  const config = await loadConfig();
  const scanner = normalizeScannerConfig(config.scanner);
  syncScannerRuntime(scanner);

  if (!hasConfiguredToken(config) || !scanner.enabled) {
    return createEmptyRecommendationResponse(scanner);
  }

  const cached = cache.get("scanner:recommendations");
  if (!force && cached && cached.expiresAt > Date.now()) {
    return cached.value as RecommendationResponse;
  }

  return buildScannerSnapshot(scanner, scannerRuntime.lastSource, scannerRuntime.fallbackSource);
}

function buildPortfolioAdviceForHolding(
  holding: PortfolioHolding,
  analysis: AnalysisResponse,
): PortfolioAdvice {
  const currentPrice = analysis.market.buffClose ?? analysis.market.yyypClose ?? null;
  const costDeviationPct =
    currentPrice != null && holding.averageCost > 0
      ? Number((((currentPrice - holding.averageCost) / holding.averageCost) * 100).toFixed(2))
      : null;
  const unrealizedPnL =
    currentPrice != null
      ? Number(((currentPrice - holding.averageCost) * holding.quantity).toFixed(2))
      : null;
  const averagingEdge =
    costDeviationPct == null
      ? 0
      : costDeviationPct < 0
        ? Math.min(28, Math.abs(costDeviationPct) * 1.4)
        : -Math.min(34, costDeviationPct * 1.2);
  const addScore = Number(
    Math.max(
      -200,
      Math.min(
        200,
        analysis.scores.entryScore -
          analysis.prediction.cooldownRiskPct * 0.55 +
          averagingEdge +
          (analysis.marketContext.teamSignal.buildScore - analysis.marketContext.teamSignal.exitScore) *
            0.5,
      ),
    ).toFixed(1),
  );
  const sellScore = Number(
    Math.max(
      -200,
      Math.min(
        200,
        analysis.scores.dumpRiskScore +
          (costDeviationPct != null && costDeviationPct > 0
            ? Math.min(36, costDeviationPct * 1.3)
            : costDeviationPct != null && costDeviationPct < -10
              ? Math.min(18, Math.abs(costDeviationPct) * 0.5)
              : 0) +
          Math.max(0, analysis.prediction.cooldownRiskPct - 45) * 0.9,
      ),
    ).toFixed(1),
  );
  const holdScore = Number(
    Math.max(
      -200,
      Math.min(
        200,
        70 -
          Math.abs(addScore - sellScore) * 0.45 +
          (analysis.scores.entryScore > 35 && analysis.scores.dumpRiskScore < 40 ? 24 : 0),
      ),
    ).toFixed(1),
  );

  let action: PortfolioAdvice["action"] = "hold";
  if (sellScore >= 120) {
    action = "exit";
  } else if (sellScore >= 70) {
    action = "reduce";
  } else if (addScore >= 110) {
    action = "add";
  }

  const reasons = [
    ...analysis.scores.entryDrivers.slice(0, 2).map((item) => `加仓侧: ${item.detail}`),
    ...analysis.scores.dumpDrivers.slice(0, 2).map((item) => `卖出侧: ${item.detail}`),
  ].slice(0, 4);
  const riskNotes = [
    `当前持仓 ${holding.quantity} 件，成本 ${holding.averageCost.toFixed(2)}`,
    `买入日期 ${normalizeBuyDate(holding.buyDate, holding.createdAt)}`,
    currentPrice != null ? `现价 ${currentPrice.toFixed(2)}，浮动 ${costDeviationPct ?? "--"}%` : "现价暂未返回",
    `7 天锁仓风险 ${analysis.prediction.cooldownRiskPct}%`,
    analysis.llm.status === "ok" ? `AI: ${analysis.llm.summary}` : "AI 暂未给出本轮额外摘要",
  ];

  let summary = "当前更适合继续持有并等待下一轮信号确认。";
  if (action === "add") {
    summary = "加仓分领先，且成本位置没有明显过热，适合继续小步加仓。";
  } else if (action === "reduce") {
    summary = "卖出侧信号开始抬升，建议先减部分仓位，把回撤风险压下来。";
  } else if (action === "exit") {
    summary = "卖出分已经明显高于加仓分，建议优先考虑退出或大幅降仓。";
  }

  return {
    holdingId: holding.id,
    goodId: holding.goodId,
    name: holding.name,
    quantity: holding.quantity,
    averageCost: holding.averageCost,
    currentPrice,
    costDeviationPct,
    unrealizedPnL,
    addScore,
    sellScore,
    holdScore,
    action,
    summary,
    reasons,
    riskNotes,
    analysis,
  };
}

app.get("/api/watchlist/analysis", async (request, response) => {
  try {
    const config = await loadConfig();
    if (!hasConfiguredToken(config)) {
      response.json(
        jsonOk({
          configured: false,
          items: [] satisfies WatchlistSummary[],
        }),
      );
      return;
    }

    const force = String(request.query.force ?? "") === "1";
    const rows: WatchlistSummary[] = [];

    for (const entry of config.watchlist) {
      try {
        const analysis = await runAnalysis(entry.goodId, false, force);
        const deepAnalysis = getFreshCachedAnalysis(`deep:${entry.goodId}`);
        const preferredSummary = deepAnalysis?.summary ?? analysis.summary;
        analysis.summary.name = preferredSummary.name || analysis.summary.name;
        rows.push({
          ...preferredSummary,
          name: analysis.summary.name || entry.name || `饰品 ${entry.goodId}`,
        });
      } catch {
        rows.push({
          goodId: entry.goodId,
          name: entry.name || `饰品 ${entry.goodId}`,
          image: null,
          buffClose: null,
          yyypClose: null,
          spreadPct: null,
          change7d: null,
          volumeSpike: 1,
          entryScore: 0,
          dumpRiskScore: 0,
          signal: "获取失败",
          alertSignal: {
            level: "silent",
            shouldNotify: false,
            score: 0,
            title: "暂无预警",
            detail: "当前数据未成功刷新，请稍后再试。",
            sources: [],
            matchedRules: [],
            updatedAt: new Date().toISOString(),
          },
          taxonomy: {
            categoryKey: "other",
            categoryLabel: "其他板块",
            segmentKey: "other_generic",
            segmentLabel: "未归类",
            spotlight: "当前摘要拉取失败，板块信息待下一轮刷新补齐。",
          },
          updatedAt: new Date().toISOString(),
          snapshotsAvailable: 0,
        });
      }
    }

    response.json(
      jsonOk({
        configured: true,
        items: rows.sort((left, right) => {
          const levelWeight = {
            silent: 0,
            watch: 1,
            push_entry: 2,
            push_risk: 3,
          };

          const bySignal = levelWeight[right.alertSignal.level] - levelWeight[left.alertSignal.level];
          if (bySignal !== 0) {
            return bySignal;
          }

          return (
            right.alertSignal.score -
            left.alertSignal.score ||
            right.dumpRiskScore - left.dumpRiskScore ||
            right.entryScore - left.entryScore
          );
        }),
      }),
    );
  } catch (error) {
    response.status(400).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.get("/api/recommendations", async (request, response) => {
  try {
    const config = await loadConfig();
    const scanner = normalizeScannerConfig(config.scanner);
    syncScannerRuntime(scanner);
    if (!hasConfiguredToken(config)) {
      response.json(jsonOk(createEmptyRecommendationResponse(scanner)));
      return;
    }

    const force = String(request.query.force ?? "") === "1";
    const sync = String(request.query.sync ?? "") === "1";
    const advance = String(request.query.advance ?? "") === "1";
    const cached = cache.get("scanner:recommendations");
    const snapshot =
      (cached?.value as RecommendationResponse | undefined) ?? (await buildScannerRecommendations(force));
    const shouldAutofill =
      (advance || countActionableRecommendations(snapshot) < MIN_AUTONOMOUS_RECOMMENDATION_COUNT) &&
      !scannerRuntime.paused;

    if (sync) {
      if (shouldAutofill) {
        void ensureScannerMinimumInBackground(
          force,
          advance ? "api" : "scheduled",
          MIN_AUTONOMOUS_RECOMMENDATION_COUNT,
          advance ? 1 : 0,
        ).catch(() => undefined);
        response.json(jsonOk(buildScannerSnapshot(scanner, scannerRuntime.lastSource, scannerRuntime.fallbackSource)));
        return;
      }
      response.json(jsonOk(snapshot));
      return;
    }
    if (shouldAutofill) {
      void ensureScannerMinimumInBackground(force, "api").catch(() => undefined);
      response.json(jsonOk(buildScannerSnapshot(scanner, scannerRuntime.lastSource, scannerRuntime.fallbackSource)));
      return;
    } else if (force) {
      void buildScannerRecommendations(true).catch(() => undefined);
    }
    response.json(jsonOk(snapshot));
  } catch (error) {
    response.status(400).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.post("/api/recommendations/reset", async (_request, response) => {
  try {
    const config = await loadConfig();
    const scanner = normalizeScannerConfig(config.scanner);
    const hadRunningTask = Boolean(scannerAutofillTask) || scannerRuntime.autofilling;
    resetScannerRuntime(scanner);

    if (!hasConfiguredToken(config) || !scanner.enabled) {
      const empty = createEmptyRecommendationResponse(scanner);
      empty.scanner.resetNotice = hadRunningTask
        ? "已清空推荐池，旧请求正在收尾，新扫描会排队开始。"
        : null;
      response.json(jsonOk(empty));
      return;
    }

    void ensureScannerMinimumInBackground(
      true,
      "manual",
      MIN_AUTONOMOUS_RECOMMENDATION_COUNT,
      1,
    ).catch(() => undefined);
    const snapshot = buildScannerSnapshot(scanner, "scanner", null);
    snapshot.scanner.resetNotice = hadRunningTask
      ? "已清空推荐池，旧请求正在收尾，新扫描会排队开始。"
      : null;
    response.json(jsonOk(snapshot));
  } catch (error) {
    response.status(400).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.post("/api/recommendations/continue", async (_request, response) => {
  try {
    const config = await loadConfig();
    const scanner = normalizeScannerConfig(config.scanner);
    syncScannerRuntime(scanner);

    if (!hasConfiguredToken(config) || !scanner.enabled) {
      response.json(jsonOk(createEmptyRecommendationResponse(scanner)));
      return;
    }

    scannerRuntime.paused = false;
    scannerRuntime.roundsRemaining = scanner.maxRoundsPerCycle;
    scannerRuntime.lastError = null;
    const next = await buildScannerRecommendations(true);
    void ensureScannerMinimumInBackground(
      true,
      "continue",
      MIN_AUTONOMOUS_RECOMMENDATION_COUNT,
      1,
    ).catch(() => undefined);
    response.json(jsonOk(buildScannerSnapshot(scanner, next.scanner.source, next.scanner.fallbackSource)));
  } catch (error) {
    response.status(400).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.get("/api/items/:goodId/history", async (request, response) => {
  try {
    const goodId = request.params.goodId;
    const snapshots = await listSnapshots(goodId);
    response.json(
      jsonOk({
        goodId,
        snapshotsAvailable: snapshots.length,
        latestAt: snapshots.at(-1)?.at ?? null,
        points: snapshots.map((snapshot) => ({
          ...snapshot,
          sellPressure:
            ((snapshot.buffSell ?? 0) + (snapshot.yyypSell ?? 0)) /
            Math.max(1, (snapshot.buffBuy ?? 0) + (snapshot.yyypBuy ?? 0)),
        })),
      }),
    );
  } catch (error) {
    response.status(400).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.get("/api/items/:goodId/holders/:taskId", async (request, response) => {
  try {
    const goodId = request.params.goodId;
    const taskId = z.coerce.number().int().positive().parse(request.params.taskId);
    const pageIndex = z.coerce.number().int().min(1).parse(request.query.page ?? 1);
    const pageSize = z.coerce.number().int().min(12).max(48).parse(request.query.pageSize ?? 24);

    const analysis =
      getFreshCachedAnalysis(`deep:${goodId}`) ?? (await runAnalysis(goodId, true, false));
    const holder =
      analysis.holderInsights.find((row) => row.taskId === taskId) ??
      analysis.holderInsights.find((row) => row.steamId && row.steamId === request.query.steamId) ??
      null;

    const profile = await client.getMonitorTaskInfo(taskId);
    const inventoryRows = await loadAllMonitorTaskInventory(taskId);
    const latestActivities = await client.getMonitorTaskBusiness(taskId, 1, 24, "", "ALL");
    const focusedActivitiesRaw = await client.getMonitorTaskBusiness(
      taskId,
      1,
      24,
      analysis.item.name,
      "ALL",
    );
    const snapshots = await client.getMonitorTaskSnapshots(taskId);

    const focusedActivities = [...focusedActivitiesRaw, ...latestActivities]
      .filter((row) => row.goodId === goodId || row.marketName.includes(analysis.item.name))
      .filter(
        (row, index, rows) =>
          rows.findIndex(
            (candidate) =>
              candidate.goodId === row.goodId &&
              candidate.marketName === row.marketName &&
              candidate.count === row.count &&
              candidate.createdAt === row.createdAt,
          ) === index,
      );
    const stackedInventoryRows = stackInventoryItems(inventoryRows);
    const inventoryStart = (pageIndex - 1) * pageSize;
    const inventoryItems = stackedInventoryRows.slice(inventoryStart, inventoryStart + pageSize);

    response.json(
      jsonOk({
        goodId,
        holder: {
          taskId,
          steamName: holder?.steamName ?? profile.steamName,
          steamId: holder?.steamId ?? profile.steamId,
          avatar: holder?.avatar ?? profile.avatar,
          currentNum: holder?.currentNum ?? null,
          role: holder?.role ?? "watch",
          note: holder?.note ?? "当前缺少席位历史快照，先结合基础资料观察。",
          sharePct: holder?.sharePct ?? null,
          change24hAbs: holder?.change24hAbs ?? null,
          change7dAbs: holder?.change7dAbs ?? null,
        },
        profile,
        inventory: {
          pageIndex,
          pageSize,
          hasMore: stackedInventoryRows.length > inventoryStart + inventoryItems.length,
          items: inventoryItems,
        },
        focusActivities: focusedActivities.slice(0, 12),
        latestActivities: latestActivities.slice(0, 12),
        snapshots: snapshots.slice(0, 20),
      } satisfies HolderDrilldownResponse),
    );
  } catch (error) {
    response.status(400).json({ ok: false, error: getErrorMessage(error) });
  }
});

app.get("/api/items/:goodId/analysis", async (request, response) => {
  try {
    const goodId = request.params.goodId;
    const force = String(request.query.force ?? "") === "1";
    const mode = String(request.query.mode ?? "deep");
    const analysis = await runAnalysis(goodId, mode !== "summary", force);
    response.json(jsonOk(analysis));
  } catch (error) {
    response.status(400).json({ ok: false, error: getErrorMessage(error) });
  }
});

if (existsSync(distDir)) {
  app.use(express.static(distDir));
  app.use((request, response, next) => {
    if (request.path.startsWith("/api")) {
      next();
      return;
    }

    response.sendFile(path.join(distDir, "index.html"));
  });
}

ensureDataDir()
  .then(async () => {
    app.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`CS2 monitor server listening on http://localhost:${port}`);
      void scheduleNextRefresh(20_000, "startup");
    });
  })
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error("Failed to prepare runtime data directory:", error);
    process.exit(1);
  });
