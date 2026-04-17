import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { analyzeItem, applyPushSignal, buildRecommendationResponse } from "./analytics.js";
import { CsfloatClient } from "./csfloat-client.js";
import { CsqaqClient } from "./csqaq-client.js";
import { LocalMonitorLlmClient } from "./llm-client.js";
import { ensureDataDir, loadConfig, maskToken, updateConfig } from "./config-store.js";
import { listSnapshots } from "./history-store.js";
import type {
  AnalysisResponse,
  AutoRefreshConfig,
  RecommendationResponse,
  RefreshRuntimeStatus,
  RuntimeConfig,
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
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let deepRotationCursor = 0;

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

  if (!autoRefresh.enabled || !hasConfiguredToken(config) || watchlist.length === 0) {
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
          : "监控池为空",
    });
    return refreshState;
  }

  let summaryCount = 0;
  let deepCount = 0;

  try {
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
            title: "鏆傛棤棰勮",
            detail: "褰撳墠鏁版嵁鏈垚鍔熷埛鏂帮紝璇风◢鍚庡啀璇曘€?",
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
    if (!hasConfiguredToken(config)) {
      response.json(
        jsonOk({
          updatedAt: new Date().toISOString(),
          universeCount: 0,
          positive: [],
          watch: [],
          risk: [],
          boards: [],
        } satisfies RecommendationResponse),
      );
      return;
    }

    const force = String(request.query.force ?? "") === "1";
    const analyses: AnalysisResponse[] = [];

    for (const entry of config.watchlist) {
      try {
        const cached = !force ? getFreshCachedAnalysis(`deep:${entry.goodId}`) : undefined;
        analyses.push(cached ?? (await runAnalysis(entry.goodId, true, force)));
      } catch {
        continue;
      }
    }

    response.json(jsonOk(buildRecommendationResponse(analyses)));
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

app.get("/api/items/:goodId/analysis", async (request, response) => {
  try {
    const goodId = request.params.goodId;
    const force = String(request.query.force ?? "") === "1";
    const analysis = await runAnalysis(goodId, true, force);
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
