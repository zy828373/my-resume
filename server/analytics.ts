import { appendSnapshot, listSnapshots } from "./history-store.js";
import type { CsqaqClient } from "./csqaq-client.js";
import type { LocalMonitorLlmClient } from "./llm-client.js";
import type {
  AlertSignal,
  AnalysisResponse,
  BoardTaxonomy,
  ChartCandle,
  CsfloatListingSummary,
  EarlyAccumulationSignal,
  HolderBehaviorInsight,
  HolderLeaderSnapshot,
  HolderRow,
  ItemAlert,
  LlmInsight,
  NormalizedDetail,
  PlatformMap,
  PriceTierProfile,
  ReasoningFactor,
  RecommendationCard,
  RecommendationResponse,
  Snapshot,
  StatisticSnapshot,
  StrategyPlan,
  TeamSignal,
  TrendDelta,
  WatchlistSummary,
} from "./types.js";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function averageLast(values: number[], count: number) {
  return average(values.slice(-count));
}

function percentageChange(current: number | null, previous: number | null) {
  if (current == null || previous == null || previous === 0) {
    return null;
  }

  return ((current - previous) / previous) * 100;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) {
    return 0;
  }

  const mean = average(values);
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function formatCount(value: number | null, digits = 0) {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }

  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatSignedPercent(value: number | null, digits = 2) {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function uniq(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
}

function includesAny(text: string, tokens: string[]) {
  return tokens.some((token) => text.includes(token));
}

function sharePct(part: number | null, total: number | null) {
  if (part == null || total == null || total === 0) {
    return null;
  }

  return Number(((part / total) * 100).toFixed(2));
}

function movingAverage(values: number[], period: number) {
  return values.map((_, index) => {
    if (index < period - 1) {
      return null;
    }

    const slice = values.slice(index - period + 1, index + 1);
    return Number(average(slice).toFixed(2));
  });
}

function ema(values: number[], period: number) {
  if (!values.length) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  const result = [values[0]];

  for (let index = 1; index < values.length; index += 1) {
    result.push((values[index] - result[index - 1]) * multiplier + result[index - 1]);
  }

  return result;
}

function calcMacd(values: number[]) {
  const ema12 = ema(values, 12);
  const ema26 = ema(values, 26);
  const dif = values.map((_, index) => Number((ema12[index] - ema26[index]).toFixed(4)));
  const dea = ema(dif, 9).map((value) => Number(value.toFixed(4)));
  const hist = dif.map((value, index) => Number(((value - dea[index]) * 2).toFixed(4)));
  return { dif, dea, hist };
}

function calcKdj(candles: ChartCandle[]) {
  const k: number[] = [];
  const d: number[] = [];
  const j: number[] = [];
  let currentK = 50;
  let currentD = 50;

  candles.forEach((candle, index) => {
    const start = Math.max(0, index - 8);
    const window = candles.slice(start, index + 1);
    const highest = Math.max(...window.map((row) => row.h));
    const lowest = Math.min(...window.map((row) => row.l));
    const rsv = highest === lowest ? 50 : ((candle.c - lowest) / (highest - lowest)) * 100;
    currentK = (2 * currentK + rsv) / 3;
    currentD = (2 * currentD + currentK) / 3;
    const currentJ = 3 * currentK - 2 * currentD;
    k.push(Number(currentK.toFixed(2)));
    d.push(Number(currentD.toFixed(2)));
    j.push(Number(currentJ.toFixed(2)));
  });

  return { k, d, j };
}

function formatDateLabel(timestamp: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp));
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function flattenObject(
  value: Record<string, unknown>,
  prefix = "",
  bucket: Array<[string, unknown]> = [],
) {
  Object.entries(value).forEach(([key, entry]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    bucket.push([nextKey, entry]);

    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      flattenObject(entry as Record<string, unknown>, nextKey, bucket);
    }
  });

  return bucket;
}

function pickString(
  raw: Record<string, unknown>,
  exactKeys: string[],
  tokenGroups: string[][] = [],
) {
  const flattened = flattenObject(raw);

  for (const key of exactKeys) {
    const match = flattened.find(([entryKey, value]) => entryKey === key && typeof value === "string");
    if (match) {
      return match[1] as string;
    }
  }

  for (const tokens of tokenGroups) {
    const match = flattened.find(([entryKey, value]) => {
      if (typeof value !== "string") {
        return false;
      }

      const key = entryKey.toLowerCase();
      return tokens.every((token) => key.includes(token));
    });

    if (match) {
      return match[1] as string;
    }
  }

  return null;
}

function coerceNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, ""));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function pickNumber(
  raw: Record<string, unknown>,
  exactKeys: string[],
  tokenGroups: string[][] = [],
) {
  const flattened = flattenObject(raw);

  for (const key of exactKeys) {
    const match = flattened.find(([entryKey]) => entryKey === key);
    if (match) {
      const value = coerceNumber(match[1]);
      if (value != null) {
        return value;
      }
    }
  }

  for (const tokens of tokenGroups) {
    const match = flattened.find(([entryKey, value]) => {
      const key = entryKey.toLowerCase();
      return tokens.every((token) => key.includes(token)) && coerceNumber(value) != null;
    });

    if (match) {
      return coerceNumber(match[1]);
    }
  }

  return null;
}

type StatisticPoint = {
  at: string;
  t: number;
  value: number;
};

function normalizeStatisticSeries(raw: unknown) {
  if (!Array.isArray(raw)) {
    return [] as StatisticPoint[];
  }

  return raw
    .map<StatisticPoint | null>((row) => {
      if (!row || typeof row !== "object") {
        return null;
      }

      const typedRow = row as Record<string, unknown>;
      const value = coerceNumber(typedRow.statistic);
      const at = typeof typedRow.created_at === "string" ? typedRow.created_at : null;
      if (at == null) {
        return null;
      }
      const timestamp = at ? Date.parse(at) : NaN;

      if (value == null || !Number.isFinite(timestamp)) {
        return null;
      }

      return {
        at,
        t: timestamp,
        value,
      };
    })
    .filter((row): row is StatisticPoint => row != null)
    .sort((left, right) => left.t - right.t);
}

function findStatisticValueDaysAgo(points: StatisticPoint[], days: number) {
  if (!points.length) {
    return null;
  }

  const target = points.at(-1)!.t - days * 24 * 60 * 60 * 1000;
  const matched = [...points].reverse().find((point) => point.t <= target);
  return matched?.value ?? null;
}

export function normalizeDetail(raw: Record<string, unknown>, goodId: string): NormalizedDetail {
  const marketHashName =
    pickString(raw, ["market_hash_name"], [["market", "hash", "name"]]) ??
    pickString(raw, ["goods_market_hash_name"], [["goods", "market", "hash", "name"]]);
  const name =
    pickString(raw, ["name", "goods_name"], []) ?? marketHashName ??
    `饰品 ${goodId}`;

  return {
    goodId,
    name,
    marketHashName,
    image: pickString(raw, ["img", "icon", "image"], [["icon"], ["image"]]),
    rarity: pickString(raw, ["rare_name", "rarity", "quality_name"], [["rare"], ["quality"]]),
    weapon: pickString(raw, ["weapon_name", "category_name"], [["weapon"], ["category"]]),
    exterior: pickString(raw, ["exterior_name", "wear_name"], [["wear"], ["exterior"]]),
    statistic: pickNumber(raw, ["goods_info.statistic", "statistic"], [["goods", "info", "statistic"]]),
    buffPrice: pickNumber(
      raw,
      ["buff_sell_price", "buff_price"],
      [["buff", "sell", "price"], ["buff", "price"]],
    ),
    yyypPrice: pickNumber(
      raw,
      ["yyyp_sell_price", "yyyp_price"],
      [["yyyp", "sell", "price"], ["yyyp", "price"]],
    ),
    buffSell: pickNumber(
      raw,
      ["buff_sell_num"],
      [["buff", "sell", "num"], ["buff", "sell", "count"]],
    ),
    yyypSell: pickNumber(
      raw,
      ["yyyp_sell_num"],
      [["yyyp", "sell", "num"], ["yyyp", "sell", "count"]],
    ),
    buffBuy: pickNumber(
      raw,
      ["buff_buy_num"],
      [["buff", "buy", "num"], ["buff", "buy", "count"]],
    ),
    yyypBuy: pickNumber(
      raw,
      ["yyyp_buy_num"],
      [["yyyp", "buy", "num"], ["yyyp", "buy", "count"]],
    ),
    raw,
  };
}

function buildSignalLabel(entryScore: number, dumpRiskScore: number) {
  if (dumpRiskScore >= 72) {
    return "高危跑路";
  }

  if (entryScore >= 78) {
    return "强势建仓";
  }

  if (entryScore >= 62) {
    return "观察低吸";
  }

  if (dumpRiskScore >= 58) {
    return "筹码松动";
  }

  return "中性观察";
}

const ENTRY_PUSH_THRESHOLD = 72;
const EXIT_PUSH_THRESHOLD = 72;
const WATCH_THRESHOLD = 60;
const LLM_PUSH_THRESHOLD = 65;

function createIdleAlertSignal(
  updatedAt: string,
  entryScore: number,
  dumpRiskScore: number,
): AlertSignal {
  return {
    level: "silent",
    shouldNotify: false,
    score: Math.max(entryScore, dumpRiskScore),
    title: "未触发自动推送",
    detail: "当前仍以常规观察为主，后台会继续滚动刷新并等待更强共振。",
    sources: [],
    matchedRules: [],
    updatedAt,
  };
}

function pushSignalSummaryLabel(pushSignal: AlertSignal, fallback: string) {
  if (pushSignal.level === "push_risk") {
    return "AI 跑路推送";
  }

  if (pushSignal.level === "push_entry") {
    return "AI 建仓推送";
  }

  if (pushSignal.level === "watch") {
    return "重点观察";
  }

  return fallback;
}

function buildPushSignal(analysis: AnalysisResponse): AlertSignal {
  const { item, llm, marketContext, prediction, scores } = analysis;
  const sources = new Set<string>();
  const buildRules: string[] = [];
  const exitRules: string[] = [];
  const watchRules: string[] = [];

  const entryByTeam =
    marketContext.teamSignal.buildScore >= ENTRY_PUSH_THRESHOLD && scores.entryScore >= 68;
  if (entryByTeam) {
    sources.add("team");
    buildRules.push(
      `团队建仓 ${marketContext.teamSignal.buildScore}/100 与建仓分 ${scores.entryScore}/100 同步过线`,
    );
  }

  const entryByLlm =
    llm.status === "ok" &&
    llm.alertDecision === "push_alert" &&
    (llm.buildSignalStrength ?? 0) >= LLM_PUSH_THRESHOLD &&
    (llm.regime === "accumulation" || llm.regime === "breakout_watch");
  if (entryByLlm) {
    sources.add("llm");
    buildRules.push(
      `LLM 给出 ${llm.regime} 判断，建仓强度 ${(llm.buildSignalStrength ?? 0)}/100`,
    );
  }

  const exitByTeam =
    marketContext.teamSignal.exitScore >= EXIT_PUSH_THRESHOLD && scores.dumpRiskScore >= 68;
  if (exitByTeam) {
    sources.add("team");
    exitRules.push(
      `团队撤退 ${marketContext.teamSignal.exitScore}/100 与风险分 ${scores.dumpRiskScore}/100 同步过线`,
    );
  }

  const exitByLlm =
    llm.status === "ok" &&
    (llm.alertDecision === "push_alert" || llm.shouldPushAlert) &&
    ((llm.dumpSignalStrength ?? 0) >= LLM_PUSH_THRESHOLD ||
      llm.regime === "panic" ||
      llm.regime === "distribution");
  if (exitByLlm) {
    sources.add("llm");
    exitRules.push(
      `LLM 给出 ${llm.regime} 判断，撤退强度 ${(llm.dumpSignalStrength ?? 0)}/100`,
    );
  }

  const entryWatch =
    !entryByTeam &&
    !entryByLlm &&
    (marketContext.teamSignal.buildScore >= WATCH_THRESHOLD ||
      scores.entryScore >= 64 ||
      (llm.status === "ok" &&
        ((llm.buildSignalStrength ?? 0) >= WATCH_THRESHOLD ||
          llm.alertDecision === "watch_closely")));
  if (entryWatch) {
    watchRules.push("建仓侧达到重点观察阈值，但还没满足直接推送");
  }

  const exitWatch =
    !exitByTeam &&
    !exitByLlm &&
    (marketContext.teamSignal.exitScore >= WATCH_THRESHOLD ||
      scores.dumpRiskScore >= 62 ||
      (llm.status === "ok" &&
        ((llm.dumpSignalStrength ?? 0) >= WATCH_THRESHOLD ||
          llm.alertDecision === "watch_closely")));
  if (exitWatch) {
    watchRules.push("风险侧达到重点观察阈值，但还没满足直接推送");
  }

  const entryBlockedByCooldown =
    prediction.cooldownRiskPct >= 68 ||
    (llm.status === "ok" && llm.cooldownAssessment === "unfavorable");

  if (
    (exitByTeam || exitByLlm) &&
    (scores.dumpRiskScore >= scores.entryScore ||
      marketContext.teamSignal.exitScore >= marketContext.teamSignal.buildScore)
  ) {
    return {
      level: "push_risk",
      shouldNotify: true,
      score: Math.max(
        scores.dumpRiskScore,
        marketContext.teamSignal.exitScore,
        llm.dumpSignalStrength ?? 0,
      ),
      title: `${item.name} 跑路风险推送`,
      detail: "撤退侧信号已经形成共振，优先检查卖压、头部持仓与防守位。",
      sources: [...sources],
      matchedRules: exitRules.slice(0, 4),
      updatedAt: analysis.market.updatedAt,
    };
  }

  if (entryByTeam || entryByLlm) {
    if (entryBlockedByCooldown) {
      return {
        level: "watch",
        shouldNotify: false,
        score: Math.max(
          scores.entryScore,
          marketContext.teamSignal.buildScore,
          llm.buildSignalStrength ?? 0,
        ),
        title: `${item.name} 建仓观察`,
        detail: `建仓侧已接近推送，但 7 天锁仓风险 ${prediction.cooldownRiskPct}% 仍偏高，先观察。`,
        sources: [...sources],
        matchedRules: [...buildRules, "冷却期风险抑制了直接建仓推送"].slice(0, 4),
        updatedAt: analysis.market.updatedAt,
      };
    }

    return {
      level: "push_entry",
      shouldNotify: true,
      score: Math.max(
        scores.entryScore,
        marketContext.teamSignal.buildScore,
        llm.buildSignalStrength ?? 0,
      ),
      title: `${item.name} 建仓信号推送`,
      detail: "建仓侧的规则分、团队行为或 AI 判断已经形成共振，可以提高跟踪优先级。",
      sources: [...sources],
      matchedRules: buildRules.slice(0, 4),
      updatedAt: analysis.market.updatedAt,
    };
  }

  if (entryWatch || exitWatch) {
    return {
      level: "watch",
      shouldNotify: false,
      score: Math.max(
        scores.entryScore,
        scores.dumpRiskScore,
        marketContext.teamSignal.buildScore,
        marketContext.teamSignal.exitScore,
        llm.buildSignalStrength ?? 0,
        llm.dumpSignalStrength ?? 0,
      ),
      title: exitWatch ? `${item.name} 风险观察` : `${item.name} 建仓观察`,
      detail: exitWatch
        ? "风险侧已达到重点观察阈值，建议关注持仓、卖压和平台价差是否继续恶化。"
        : "建仓侧已达到重点观察阈值，继续等待量能、价格和冷却期信号确认。",
      sources: [...sources],
      matchedRules: watchRules.slice(0, 4),
      updatedAt: analysis.market.updatedAt,
    };
  }

  return createIdleAlertSignal(
    analysis.market.updatedAt,
    scores.entryScore,
    scores.dumpRiskScore,
  );
}

export function applyPushSignal(analysis: AnalysisResponse): AnalysisResponse {
  const pushSignal = buildPushSignal(analysis);
  return {
    ...analysis,
    pushSignal,
    summary: {
      ...analysis.summary,
      alertSignal: pushSignal,
      signal: pushSignalSummaryLabel(
        pushSignal,
        buildSignalLabel(analysis.scores.entryScore, analysis.scores.dumpRiskScore),
      ),
    },
  };
}

function buildTrendDelta(
  history: Snapshot[],
  current: Snapshot,
  hoursAgo: number,
): TrendDelta | null {
  const target = Date.parse(current.at) - hoursAgo * 60 * 60 * 1000;
  const previous = [...history].reverse().find((row) => Date.parse(row.at) <= target);

  if (!previous) {
    return null;
  }

  return {
    changePct: percentageChange(current.top10, previous.top10),
    volumePct: percentageChange(current.volume, previous.volume),
  };
}

function resolveMacdSignal(macd: ReturnType<typeof calcMacd>) {
  const last = macd.dif.length - 1;
  const prev = Math.max(0, last - 1);
  const crossUp = macd.dif[last] > macd.dea[last] && macd.dif[prev] <= macd.dea[prev];
  const crossDown = macd.dif[last] < macd.dea[last] && macd.dif[prev] >= macd.dea[prev];

  if (crossUp) {
    return { signal: "buy", summary: "MACD 金叉，短线动能转强" };
  }

  if (crossDown) {
    return { signal: "sell", summary: "MACD 死叉，注意趋势转弱" };
  }

  if (macd.dif[last] > macd.dea[last]) {
    return { signal: "buy", summary: "DIF 位于 DEA 上方，多头仍在" };
  }

  return { signal: "sell", summary: "DIF 位于 DEA 下方，空头占优" };
}

function resolveKdjSignal(kdj: ReturnType<typeof calcKdj>) {
  const last = kdj.k.length - 1;
  const prev = Math.max(0, last - 1);
  const goldenCross = kdj.k[last] > kdj.d[last] && kdj.k[prev] <= kdj.d[prev];
  const deathCross = kdj.k[last] < kdj.d[last] && kdj.k[prev] >= kdj.d[prev];

  if (goldenCross && kdj.j[last] < 35) {
    return { signal: "buy", summary: "KDJ 低位金叉，存在反弹窗口" };
  }

  if (deathCross && kdj.j[last] > 65) {
    return { signal: "sell", summary: "KDJ 高位死叉，回撤风险上升" };
  }

  if (kdj.j[last] < 18) {
    return { signal: "buy", summary: "J 值超卖，留意资金回补" };
  }

  if (kdj.j[last] > 82) {
    return { signal: "sell", summary: "J 值超买，追高风险较高" };
  }

  return { signal: "neutral", summary: "KDJ 中性震荡，等待方向确认" };
}

function resolvePriceTier(latestBlend: number | null): PriceTierProfile {
  if (latestBlend == null) {
    return {
      key: "mid",
      label: "中价观察区",
      latestPrice: null,
      description: "价格暂未解析成功，先按中价饰品的默认阈值处理。",
      buildVolumeThreshold: 1.25,
      dangerDropThresholdPct: 3.2,
      spreadRiskThresholdPct: 2.6,
      cooldownWeight: 1,
    };
  }

  if (latestBlend <= 300) {
    return {
      key: "low",
      label: "低价高波动",
      latestPrice: latestBlend,
      description: "低价饰品更容易被短线资金放量拉扯，需要更高的量能确认才能当成有效建仓。",
      buildVolumeThreshold: 1.45,
      dangerDropThresholdPct: 4.2,
      spreadRiskThresholdPct: 4.5,
      cooldownWeight: 1.18,
    };
  }

  if (latestBlend <= 2_000) {
    return {
      key: "mid",
      label: "中价主战区",
      latestPrice: latestBlend,
      description: "中价饰品流动性与趋势质量相对均衡，量价、持仓和存世量信号最适合联动判断。",
      buildVolumeThreshold: 1.25,
      dangerDropThresholdPct: 3.2,
      spreadRiskThresholdPct: 2.6,
      cooldownWeight: 1,
    };
  }

  return {
    key: "high",
    label: "高价低流速",
    latestPrice: latestBlend,
    description: "高价饰品成交更稀疏，小幅价格与价差变化就值得重视，但 7 天锁仓的资金占用更重。",
    buildVolumeThreshold: 1.08,
    dangerDropThresholdPct: 2.2,
    spreadRiskThresholdPct: 1.5,
    cooldownWeight: 1.12,
  };
}

function resolveStickerSegment(text: string) {
  const series = [
    {
      key: "stockholm_2021",
      label: "21 斯德哥尔摩系列",
      tokens: ["2021", "斯德哥尔摩"],
      englishTokens: ["2021", "stockholm"],
    },
    {
      key: "antwerp_2022",
      label: "22 安特卫普系列",
      tokens: ["2022", "安特卫普"],
      englishTokens: ["2022", "antwerp"],
    },
    {
      key: "rio_2022",
      label: "22 里约系列",
      tokens: ["2022", "里约"],
      englishTokens: ["2022", "rio"],
    },
    {
      key: "paris_2023",
      label: "23 巴黎系列",
      tokens: ["2023", "巴黎"],
      englishTokens: ["2023", "paris"],
    },
    {
      key: "copenhagen_2024",
      label: "24 哥本哈根系列",
      tokens: ["2024", "哥本哈根"],
      englishTokens: ["2024", "copenhagen"],
    },
    {
      key: "shanghai_2024",
      label: "24 上海系列",
      tokens: ["2024", "上海"],
      englishTokens: ["2024", "shanghai"],
    },
  ];

  const normalizedText = text.toLowerCase();
  const matched = series.find(
    (entry) =>
      entry.tokens.every((token) => text.includes(token)) ||
      entry.englishTokens.every((token) => normalizedText.includes(token)),
  );
  if (matched) {
    return {
      segmentKey: matched.key,
      segmentLabel: matched.label,
      spotlight: "赛事贴纸通常更依赖题材轮动、仓位锁定和供给收缩信号。",
    };
  }

  return {
    segmentKey: "sticker_generic",
    segmentLabel: "普通贴纸系列",
    spotlight: "贴纸板块更看重赛事题材、囤货集中度和存世量变化。",
  };
}

function resolveGloveSegment(text: string) {
  if (includesAny(text, ["bloodhound", "猎血", "血猎"])) {
    return { segmentKey: "glove_gen_1", segmentLabel: "一代手套" };
  }

  if (includesAny(text, ["hydra", "九头蛇"])) {
    return { segmentKey: "glove_gen_3", segmentLabel: "三代手套" };
  }

  if (includesAny(text, ["broken fang", "狂牙"])) {
    return { segmentKey: "glove_gen_4", segmentLabel: "四代手套" };
  }

  return { segmentKey: "glove_gen_2", segmentLabel: "二代手套" };
}

function resolveGunSegment(latestPrice: number | null) {
  if (latestPrice == null || latestPrice < 10) {
    return { segmentKey: "gun_under_10", segmentLabel: "10 元以下" };
  }

  if (latestPrice < 100) {
    return { segmentKey: "gun_10_100", segmentLabel: "10 元到 100 元" };
  }

  if (latestPrice < 1_000) {
    return { segmentKey: "gun_100_1000", segmentLabel: "100 元到 1000 元" };
  }

  if (latestPrice < 10_000) {
    return { segmentKey: "gun_1000_10000", segmentLabel: "1000 元到 10000 元" };
  }

  return { segmentKey: "gun_over_10000", segmentLabel: "10000 元以上" };
}

function buildTaxonomy(detail: NormalizedDetail, latestPrice: number | null): BoardTaxonomy {
  const text = `${detail.marketHashName ?? detail.name} ${detail.weapon ?? ""}`.toLowerCase();

  if (includesAny(text, ["sticker", "印花"])) {
    const sticker = resolveStickerSegment(`${detail.marketHashName ?? detail.name} ${detail.name}`);
    return {
      categoryKey: "sticker",
      categoryLabel: "贴纸板块",
      segmentKey: sticker.segmentKey,
      segmentLabel: sticker.segmentLabel,
      spotlight: sticker.spotlight,
    };
  }

  if (includesAny(text, ["glove", "手套", "hand wraps", "bloodhound", "hydra", "broken fang"])) {
    const glove = resolveGloveSegment(text);
    return {
      categoryKey: "glove",
      categoryLabel: "手套板块",
      segmentKey: glove.segmentKey,
      segmentLabel: glove.segmentLabel,
      spotlight: "手套板块成交稀疏，通常更看重锁仓能力、价差和大户集中度。",
    };
  }

  if (
    includesAny(text, [
      "knife",
      "bayonet",
      "karambit",
      "刀",
      "刺刀",
      "蝴蝶",
      "爪子刀",
      "折刀",
      "匕首",
    ])
  ) {
    return {
      categoryKey: "knife",
      categoryLabel: "刀皮板块",
      segmentKey: detail.weapon ? `knife_${detail.weapon}` : "knife_generic",
      segmentLabel: detail.weapon ?? "主流刀型",
      spotlight: "刀皮更偏低流通高单价，适合看冷却期风险、跨平台价差和稀缺度。",
    };
  }

  if (includesAny(text, ["agent", "探员", "特工"])) {
    return {
      categoryKey: "agent",
      categoryLabel: "探员板块",
      segmentKey: "agent_generic",
      segmentLabel: "探员饰品",
      spotlight: "探员更像题材轮动品种，仓位集中和行情热度会更关键。",
    };
  }

  if (detail.weapon || includesAny(text, ["ak-47", "m4a", "awp", "glock", "usp", "desert eagle"])) {
    const gun = resolveGunSegment(latestPrice);
    return {
      categoryKey: "gun",
      categoryLabel: "枪皮板块",
      segmentKey: gun.segmentKey,
      segmentLabel: gun.segmentLabel,
      spotlight: "枪皮板块更适合看量价、卖压、持仓集中度和价格分层。",
    };
  }

  return {
    categoryKey: "other",
    categoryLabel: "其他板块",
    segmentKey: "other_generic",
    segmentLabel: "未归类",
    spotlight: "当前样本未能稳定归类，推荐先以量价和持仓信号为主。",
  };
}

function buildTeamSignal({
  priceTier,
  top5SharePct,
  top10SharePct,
  delta24h,
  delta7d,
  volumeSpike,
  change1d,
  change7d,
  statisticChange14d,
  sellPressure,
  spreadPct,
}: {
  priceTier: PriceTierProfile;
  top5SharePct: number | null;
  top10SharePct: number | null;
  delta24h: TrendDelta | null;
  delta7d: TrendDelta | null;
  volumeSpike: number;
  change1d: number | null;
  change7d: number | null;
  statisticChange14d: number | null;
  sellPressure: number;
  spreadPct: number | null;
}): TeamSignal {
  let buildScore = 24;
  let exitScore = 24;
  const buildReasons: string[] = [];
  const exitReasons: string[] = [];

  if ((delta24h?.changePct ?? 0) >= 4) {
    buildScore += 18;
    buildReasons.push(`Top10 持仓 24h 增加 ${formatSignedPercent(delta24h?.changePct ?? null, 1)}`);
  }

  if ((delta24h?.changePct ?? 0) >= 8) {
    buildScore += 10;
    buildReasons.push("短周期头部持仓抬升明显，疑似在主动收集筹码。");
  }

  if ((delta7d?.changePct ?? 0) >= 10) {
    buildScore += 12;
    buildReasons.push(`Top10 持仓 7d 累计增加 ${formatSignedPercent(delta7d?.changePct ?? null, 1)}`);
  }

  if ((top10SharePct ?? 0) >= 0.8) {
    buildScore += 8;
    buildReasons.push(`Top10 占存世量 ${formatSignedPercent(top10SharePct, 2)}，集中度开始抬升。`);
  }

  if ((top5SharePct ?? 0) >= 0.45) {
    buildScore += 6;
    buildReasons.push(`Top5 占存世量 ${formatSignedPercent(top5SharePct, 2)}，筹码向头部集中。`);
  }

  if (volumeSpike >= priceTier.buildVolumeThreshold && (change1d ?? 0) > 0) {
    buildScore += 10;
    buildReasons.push(`量能放大到 ${volumeSpike.toFixed(2)}x，且价格同步上行。`);
  }

  if ((statisticChange14d ?? 0) <= -0.8) {
    buildScore += 7;
    buildReasons.push(`近 14 天存世量收缩 ${formatSignedPercent(statisticChange14d, 2)}。`);
  }

  if (sellPressure <= 1.1) {
    buildScore += 5;
    buildReasons.push("卖压与求购盘相对均衡，更适合吸筹而非砸盘。");
  }

  if ((spreadPct ?? 0) <= -(priceTier.spreadRiskThresholdPct * 0.55)) {
    buildScore += 4;
    buildReasons.push("跨平台价差仍有缓冲，建仓一侧的安全垫更厚。");
  }

  if ((delta24h?.changePct ?? 0) <= -4) {
    exitScore += 18;
    exitReasons.push(`Top10 持仓 24h 下降 ${formatSignedPercent(delta24h?.changePct ?? null, 1)}`);
  }

  if ((delta24h?.changePct ?? 0) <= -8) {
    exitScore += 10;
    exitReasons.push("头部持仓短周期回落偏快，需警惕集中撤退。");
  }

  if ((delta7d?.changePct ?? 0) <= -10) {
    exitScore += 12;
    exitReasons.push(`Top10 持仓 7d 累计下降 ${formatSignedPercent(delta7d?.changePct ?? null, 1)}`);
  }

  if (
    (change1d ?? 0) <= -priceTier.dangerDropThresholdPct * 0.7 &&
    volumeSpike >= priceTier.buildVolumeThreshold
  ) {
    exitScore += 12;
    exitReasons.push(`单日放量下跌 ${formatSignedPercent(change1d, 2)}，疑似派发加速。`);
  }

  if ((change7d ?? 0) <= -priceTier.dangerDropThresholdPct * 1.4) {
    exitScore += 8;
    exitReasons.push(`近 7 天跌幅 ${formatSignedPercent(change7d, 1)}，趋势已偏弱。`);
  }

  if ((statisticChange14d ?? 0) >= 2.5) {
    exitScore += 8;
    exitReasons.push(`近 14 天存世量扩张 ${formatSignedPercent(statisticChange14d, 2)}。`);
  }

  if (sellPressure >= 2.15) {
    exitScore += 8;
    exitReasons.push(`在售/求购比 ${sellPressure.toFixed(2)}，卖压明显偏大。`);
  }

  if ((spreadPct ?? 0) >= priceTier.spreadRiskThresholdPct) {
    exitScore += 7;
    exitReasons.push("平台价差扩张到高风险区，说明分歧与出货压力都在抬升。");
  }

  buildScore = Math.round(clamp(buildScore, 0, 100));
  exitScore = Math.round(clamp(exitScore, 0, 100));

  let status: TeamSignal["status"] = "neutral";
  let summary = "头部持仓与存世量没有形成明确的团队行为信号，先按常规量价观察。";

  if (buildScore >= 68 && buildScore - exitScore >= 8) {
    status = "building";
    summary = "头部持仓、量能和筹码集中度更偏向建仓阶段，可提高跟踪频率。";
  } else if (exitScore >= 68 && exitScore - buildScore >= 8) {
    status = "exiting";
    summary = "头部持仓回落、卖压与价差扩张更像撤退阶段，应优先防守。";
  }

  return {
    buildScore,
    exitScore,
    status,
    summary,
    buildReasons: buildReasons.slice(0, 4),
    exitReasons: exitReasons.slice(0, 4),
  };
}

function holderKey(row: { steamId?: string; steamName: string }) {
  return (row.steamId?.trim() || row.steamName.trim()).toLowerCase();
}

function findSnapshotHoursAgo(history: Snapshot[], currentAt: string, hoursAgo: number) {
  const target = Date.parse(currentAt) - hoursAgo * 60 * 60 * 1000;
  return [...history].reverse().find((row) => Date.parse(row.at) <= target && row.leaders?.length);
}

function buildHolderLeaderInsights({
  holders,
  history,
  snapshotAt,
  currentStatistic,
}: {
  holders: HolderRow[];
  history: Snapshot[];
  snapshotAt: string;
  currentStatistic: number | null;
}): HolderBehaviorInsight[] {
  const previous24h = findSnapshotHoursAgo(history, snapshotAt, 24);
  const previous7d = findSnapshotHoursAgo(history, snapshotAt, 24 * 7);
  const previous24Map = new Map((previous24h?.leaders ?? []).map((row) => [holderKey(row), row]));
  const previous7dMap = new Map((previous7d?.leaders ?? []).map((row) => [holderKey(row), row]));
  const absoluteThreshold =
    currentStatistic != null ? Math.max(2, Math.round(currentStatistic * 0.0025)) : 2;

  return holders.slice(0, 8).map((row) => {
    const key = holderKey(row);
    const prev24 = previous24Map.get(key)?.num ?? null;
    const prev7 = previous7dMap.get(key)?.num ?? null;
    const change24hAbs = prev24 == null ? null : row.num - prev24;
    const change7dAbs = prev7 == null ? null : row.num - prev7;
    const change24h = percentageChange(row.num, prev24);
    const change7d = percentageChange(row.num, prev7);
    const share = sharePct(row.num, currentStatistic);

    let role: HolderBehaviorInsight["role"] = "watch";
    let note = "当前更多是静态持仓观察，建议继续跟踪后续快照。";

    if ((change24hAbs ?? 0) >= absoluteThreshold || (change7dAbs ?? 0) >= absoluteThreshold * 2) {
      role = "builder";
      note =
        share != null && share >= 0.3
          ? "仓位持续抬升且已经进入大仓位区，疑似在提前吸筹。"
          : "仓位在最近快照里持续增加，疑似在试探性建仓。";
    } else if ((change24hAbs ?? 0) <= -absoluteThreshold || (change7dAbs ?? 0) <= -absoluteThreshold * 2) {
      role = "exiting";
      note = "仓位在最近快照里下降，需留意是否处于减仓或出货阶段。";
    } else if (share != null && share >= 0.35) {
      note = "当前绝对仓位已经不低，即使未继续加仓，也值得列入重点席位。";
    }

    return {
      steamId: row.steamId,
      steamName: row.steamName,
      avatar: row.avatar,
      currentNum: row.num,
      sharePct: share,
      change24h,
      change7d,
      change24hAbs,
      change7dAbs,
      role,
      note,
    };
  });
}

function buildLikelyMotives({
  taxonomy,
  spreadPct,
  statisticChange14d,
  sellPressure,
  volumeSpike,
  change7d,
  teamSignal,
  holderInsights,
}: {
  taxonomy: BoardTaxonomy;
  spreadPct: number | null;
  statisticChange14d: number | null;
  sellPressure: number;
  volumeSpike: number;
  change7d: number | null;
  teamSignal: TeamSignal;
  holderInsights: HolderBehaviorInsight[];
}) {
  const motives: string[] = [];

  if (holderInsights.filter((row) => row.role === "builder").length >= 2) {
    motives.push("头部席位同步加仓，存在提前锁筹和集中吸筹特征");
  }

  if ((spreadPct ?? 0) <= -1) {
    motives.push("跨平台价差仍有缓冲，可能在等价差修复后的溢价兑现");
  }

  if ((statisticChange14d ?? 0) <= -0.8) {
    motives.push("存世量收缩，可能在博弈供给变紧后的价格弹性");
  }

  if (sellPressure <= 1.15) {
    motives.push("盘口承接更健康，适合边吸边控卖压");
  }

  if ((change7d ?? 0) >= -2 && (change7d ?? 0) <= 6 && volumeSpike >= 0.9 && volumeSpike <= 1.5) {
    motives.push("价格只是在缓慢抬头，节奏更像提前试仓而不是情绪化拉升");
  }

  if (taxonomy.categoryKey === "sticker") {
    motives.push("贴纸更偏赛事题材轮动，资金可能在做系列切换或赛季预埋");
  }

  if (taxonomy.categoryKey === "glove" || taxonomy.categoryKey === "knife") {
    motives.push("高客单价板块更依赖稀缺度和锁仓能力，资金可能在卡低流通窗口");
  }

  if (teamSignal.buildScore - teamSignal.exitScore >= 10) {
    motives.push("团队建仓评分明显领先撤退评分，偏向中短线进攻仓位");
  }

  return uniq(motives).slice(0, 4);
}

function buildEarlyAccumulationSignal({
  itemName,
  taxonomy,
  change1d,
  change7d,
  volumeSpike,
  entryScore,
  dumpRiskScore,
  teamSignal,
  statisticChange14d,
  spreadPct,
  sellPressure,
  holderInsights,
}: {
  itemName: string;
  taxonomy: BoardTaxonomy;
  change1d: number | null;
  change7d: number | null;
  volumeSpike: number;
  entryScore: number;
  dumpRiskScore: number;
  teamSignal: TeamSignal;
  statisticChange14d: number | null;
  spreadPct: number | null;
  sellPressure: number;
  holderInsights: HolderBehaviorInsight[];
}): EarlyAccumulationSignal {
  const builders = holderInsights.filter((row) => row.role === "builder");
  const builderShare = builders.reduce((sum, row) => sum + (row.sharePct ?? 0), 0);
  const mildTrend = (change7d ?? 0) >= -3 && (change7d ?? 0) <= 7;
  const notExploded = Math.abs(change1d ?? 0) <= 2.8;
  const score = Math.round(
    clamp(
      24 +
        builders.length * 12 +
        Math.min(20, builderShare * 0.8) +
        Math.max(0, teamSignal.buildScore - teamSignal.exitScore) * 0.45 +
        (mildTrend ? 10 : -8) +
        (notExploded ? 8 : -10) +
        (volumeSpike >= 0.95 && volumeSpike <= 1.6 ? 8 : 0) +
        ((statisticChange14d ?? 0) <= -0.8 ? 6 : 0) +
        ((spreadPct ?? 0) <= -1 ? 4 : 0) +
        (sellPressure <= 1.15 ? 4 : 0),
      0,
      100,
    ),
  );

  const likelyMotives = buildLikelyMotives({
    taxonomy,
    spreadPct,
    statisticChange14d,
    sellPressure,
    volumeSpike,
    change7d,
    teamSignal,
    holderInsights,
  });

  if (builders.length >= 2 && mildTrend && notExploded && score >= 72) {
    return {
      state: "early_build",
      score,
      title: `${itemName} 疑似提前建仓`,
      detail:
        "目前主要是少数席位在抬升仓位，价格还只是轻微上拱，尚未进入暴力拉升阶段，适合列入优先观察清单。",
      detectedBuilders: builders.length,
      totalTrackedSharePct: Number(builderShare.toFixed(2)),
      likelyMotives,
    };
  }

  if (builders.length >= 2 && (change7d ?? 0) > 7) {
    return {
      state: "crowded_breakout",
      score,
      title: `${itemName} 资金已被市场看见`,
      detail:
        "持仓席位仍在集中，但价格已经明显抬升，后续更像突破跟随而不是提前潜伏，追价风险会更高。",
      detectedBuilders: builders.length,
      totalTrackedSharePct: Number(builderShare.toFixed(2)),
      likelyMotives,
    };
  }

  if (builders.length >= 1 || score >= 58 || (entryScore >= 65 && dumpRiskScore <= 55)) {
    return {
      state: "watch",
      score,
      title: `${itemName} 建仓观察中`,
      detail: "已经能看到部分席位试探性加仓，但强度还不够，建议继续等 1 至 2 轮快照确认。",
      detectedBuilders: builders.length,
      totalTrackedSharePct: Number(builderShare.toFixed(2)),
      likelyMotives,
    };
  }

  return {
    state: "none",
    score,
    title: `${itemName} 暂无提前建仓特征`,
    detail: "当前还没看到足够明确的少数席位集中吸筹行为，先以常规量价观察为主。",
    detectedBuilders: builders.length,
    totalTrackedSharePct: Number(builderShare.toFixed(2)),
    likelyMotives,
  };
}

function buildStrategyPlan({
  latestBlend,
  entryScore,
  dumpRiskScore,
  expected7dPct,
  cooldownRiskPct,
  volatility,
  priceTier,
  teamSignal,
}: {
  latestBlend: number | null;
  entryScore: number;
  dumpRiskScore: number;
  expected7dPct: number;
  cooldownRiskPct: number;
  volatility: number;
  priceTier: PriceTierProfile;
  teamSignal: TeamSignal;
}): StrategyPlan {
  const scoreGap = entryScore - dumpRiskScore;
  const defensePct = clamp(
    2.8 +
      volatility * 1.2 * priceTier.cooldownWeight +
      Math.max(0, dumpRiskScore - entryScore) * 0.045 +
      Math.max(0, teamSignal.exitScore - 60) * 0.035,
    2.8,
    12,
  );
  const targetPct = clamp(
    Math.max(expected7dPct, 1.2) +
      volatility * 0.55 +
      Math.max(0, scoreGap) * 0.05 +
      Math.max(0, teamSignal.buildScore - teamSignal.exitScore) * 0.03,
    1,
    18,
  );

  const defensePrice =
    latestBlend == null
      ? null
      : Number((latestBlend * (1 - defensePct / 100)).toFixed(2));
  const targetPrice =
    latestBlend == null
      ? null
      : Number((latestBlend * (1 + targetPct / 100)).toFixed(2));

  let tone: StrategyPlan["tone"] = "neutral";
  let action = "观望等待";
  let actionSummary = "当前多空因子没有形成强共振，先等趋势和量能进一步确认。";
  let positionMinPct = 0;
  let positionMaxPct = 10;
  const tierCap = priceTier.key === "mid" ? 28 : priceTier.key === "low" ? 20 : 18;

  if (dumpRiskScore >= 78) {
    tone = "risk";
    action = "减仓避险";
    actionSummary = "价格、盘口和筹码同时偏弱，7 天锁仓期内容易承受被动回撤。";
    positionMinPct = 0;
    positionMaxPct = Math.min(8, tierCap);
  } else if (entryScore >= 78 && cooldownRiskPct <= 45) {
    tone = "entry";
    action = "分批建仓";
    actionSummary = "量价、指标与筹码偏多共振，适合分两到三笔逐步建立仓位。";
    positionMinPct = 12;
    positionMaxPct = tierCap;
  } else if (entryScore >= 62 && scoreGap >= 6) {
    tone = "entry";
    action = "低位试仓";
    actionSummary = "信号开始转强，但还没到全力推进阶段，适合轻仓试错。";
    positionMinPct = 6;
    positionMaxPct = Math.min(18, tierCap);
  } else if (dumpRiskScore >= 60) {
    tone = "risk";
    action = "控制仓位";
    actionSummary = "风险侧信号偏多，建议降低仓位，等待卖压和筹码稳定后再看。";
    positionMinPct = 0;
    positionMaxPct = Math.min(12, tierCap);
  }

  let cooldownSummary = "7 天锁仓窗口相对可接受，可以用小步加仓方式控制节奏。";
  if (cooldownRiskPct >= 65) {
    cooldownSummary = "7 天锁仓风险偏高，优先考虑降仓或仅放入观察名单。";
  } else if (expected7dPct < 0) {
    cooldownSummary = "锁仓期内收益预期偏弱，除非有更强建仓信号，否则不建议重仓。";
  } else if (volatility >= 4) {
    cooldownSummary = "波动偏大，锁仓期间回撤容忍度要放宽，尽量分批进出。";
  }

  if (teamSignal.status === "building") {
    actionSummary = `${actionSummary} 头部持仓侧也更偏向收集筹码。`;
  } else if (teamSignal.status === "exiting") {
    actionSummary = `${actionSummary} 头部持仓侧出现撤退特征，建议优先考虑风控。`;
  }

  return {
    tone,
    action,
    actionSummary,
    positionMinPct,
    positionMaxPct,
    targetPrice,
    defensePrice,
    lockDays: 7,
    cooldownSummary,
  };
}

function buildReasoningFactors({
  change7d,
  change30d,
  volumeSpike,
  currentStatistic,
  statisticChange14d,
  top5,
  top5SharePct,
  top10SharePct,
  spreadPct,
  latestBuff,
  latestYyyp,
  sellPressure,
  delta24h,
  priceTier,
  teamSignal,
}: {
  change7d: number | null;
  change30d: number | null;
  volumeSpike: number;
  currentStatistic: number | null;
  statisticChange14d: number | null;
  top5: number | null;
  top5SharePct: number | null;
  top10SharePct: number | null;
  spreadPct: number | null;
  latestBuff: number | null;
  latestYyyp: number | null;
  sellPressure: number;
  delta24h: TrendDelta | null;
  priceTier: PriceTierProfile;
  teamSignal: TeamSignal;
}): ReasoningFactor[] {
  const priceSlopeDaily = change7d == null ? null : Number((change7d / 7).toFixed(2));

  return [
    {
      title: "价格斜率",
      value: priceSlopeDaily == null ? "--" : `${priceSlopeDaily.toFixed(2)}%/日`,
      detail: `近 7 天 ${formatSignedPercent(change7d, 1)}，近 30 天 ${formatSignedPercent(change30d, 1)}`,
      tone:
        priceSlopeDaily == null
          ? "neutral"
          : priceSlopeDaily >= 0.35
            ? "positive"
            : priceSlopeDaily <= -0.35
              ? "negative"
              : "neutral",
    },
    {
      title: "量能强度",
      value: `${volumeSpike.toFixed(2)}x`,
      detail:
        volumeSpike >= 1.2
          ? "最近 3 根成交量高于过去两周均值，资金正在变活跃。"
          : volumeSpike <= 0.85
            ? "量能偏弱，当前走势更像存量博弈。"
            : "量能中性，暂未看到极端放量或缩量。",
      tone: volumeSpike >= 1.2 ? "positive" : volumeSpike <= 0.85 ? "negative" : "neutral",
    },
    {
      title: "存世量",
      value: formatCount(currentStatistic),
      detail: `近 14 天变化 ${formatSignedPercent(statisticChange14d, 2)}`,
      tone:
        statisticChange14d == null
          ? "neutral"
          : statisticChange14d <= -0.5
            ? "positive"
            : statisticChange14d >= 2.5
              ? "negative"
              : "neutral",
    },
    {
      title: "头部持仓",
      value: top5 == null ? "--" : `${formatCount(top5)} 件`,
      detail:
        top5 == null
          ? "当前未拿到头部持仓数据。"
          : `Top5 占存世量 ${formatSignedPercent(top5SharePct, 2)}，Top10 占比 ${formatSignedPercent(top10SharePct, 2)}`,
      tone:
        (delta24h?.changePct ?? 0) >= 4
          ? "positive"
          : (delta24h?.changePct ?? 0) <= -4
            ? "negative"
            : "neutral",
    },
    {
      title: "平台价差",
      value: formatSignedPercent(spreadPct, 2),
      detail: `BUFF ${formatCount(latestBuff, latestBuff != null && latestBuff < 100 ? 2 : 0)}，悠悠 ${formatCount(latestYyyp, latestYyyp != null && latestYyyp < 100 ? 2 : 0)}`,
      tone:
        spreadPct == null
          ? "neutral"
          : spreadPct <= -1.2
            ? "positive"
            : spreadPct >= 1.8
              ? "negative"
              : "neutral",
    },
    {
      title: "盘口压力",
      value: `${sellPressure.toFixed(2)}`,
      detail:
        sellPressure >= 2.2
          ? "在售明显高于求购，说明抛压偏大。"
          : sellPressure <= 1.1
            ? "买卖盘更平衡，承接相对健康。"
            : "盘口压力中性，尚未出现极端堆单。",
      tone: sellPressure <= 1.1 ? "positive" : sellPressure >= 2.2 ? "negative" : "neutral",
    },
    {
      title: "价格分层",
      value: priceTier.label,
      detail: `${priceTier.description} 量能阈值 ${priceTier.buildVolumeThreshold.toFixed(2)}x，风险跌幅阈值 ${priceTier.dangerDropThresholdPct.toFixed(1)}%。`,
      tone: priceTier.key === "mid" ? "positive" : "neutral",
    },
    {
      title: "团队行为",
      value: `${teamSignal.buildScore}/${teamSignal.exitScore}`,
      detail: teamSignal.summary,
      tone:
        teamSignal.status === "building"
          ? "positive"
          : teamSignal.status === "exiting"
            ? "negative"
            : "neutral",
    },
  ];
}

function buildItemAlerts({
  change1d,
  volumeSpike,
  entryScore,
  dumpRiskScore,
  spreadPct,
  latestBuff,
  latestYyyp,
  delta24h,
  statisticChange14d,
  cooldownRiskPct,
  priceTier,
  teamSignal,
  earlyAccumulation,
}: {
  change1d: number | null;
  volumeSpike: number;
  entryScore: number;
  dumpRiskScore: number;
  spreadPct: number | null;
  latestBuff: number | null;
  latestYyyp: number | null;
  delta24h: TrendDelta | null;
  statisticChange14d: number | null;
  cooldownRiskPct: number;
  priceTier: PriceTierProfile;
  teamSignal: TeamSignal;
  earlyAccumulation: EarlyAccumulationSignal;
}): ItemAlert[] {
  const alerts: ItemAlert[] = [];

  if (
    (change1d ?? 0) <= -priceTier.dangerDropThresholdPct * 0.7 &&
    volumeSpike >= priceTier.buildVolumeThreshold
  ) {
    alerts.push({
      level: "risk",
      title: "放量下跌预警",
      detail: `单日跌幅 ${formatSignedPercent(change1d, 2)}，量能放大到 ${volumeSpike.toFixed(2)}x，疑似加速出货。`,
    });
  }

  if ((delta24h?.changePct ?? 0) <= -4) {
    alerts.push({
      level: "risk",
      title: "头部持仓下降",
      detail: `Top10 持仓 24h 变化 ${formatSignedPercent(delta24h?.changePct ?? null, 1)}，要警惕大户撤退。`,
    });
  }

  if ((delta24h?.changePct ?? 0) >= 4 && volumeSpike >= priceTier.buildVolumeThreshold) {
    alerts.push({
      level: "entry",
      title: "疑似建仓信号",
      detail: `Top10 持仓 24h 增加 ${formatSignedPercent(delta24h?.changePct ?? null, 1)}，同时量能活跃。`,
    });
  }

  if ((spreadPct ?? 0) <= -(priceTier.spreadRiskThresholdPct * 0.55)) {
    alerts.push({
      level: "entry",
      title: "平台价差缓冲",
      detail: `BUFF ${formatCount(latestBuff, latestBuff != null && latestBuff < 100 ? 2 : 0)}，悠悠 ${formatCount(latestYyyp, latestYyyp != null && latestYyyp < 100 ? 2 : 0)}，存在跨平台缓冲。`,
    });
  }

  if ((statisticChange14d ?? 0) >= 2.5) {
    alerts.push({
      level: "warning",
      title: "存世量扩张",
      detail: `近 14 天存世量增加 ${formatSignedPercent(statisticChange14d, 2)}，供给扩张会压制价格弹性。`,
    });
  }

  if (cooldownRiskPct >= 65 || dumpRiskScore >= 72) {
    alerts.push({
      level: "warning",
      title: "锁仓期风险偏高",
      detail: `当前 7 天锁仓风险 ${cooldownRiskPct}% ，不适合重仓追高。`,
    });
  }

  if (teamSignal.buildScore >= 72) {
    alerts.push({
      level: "entry",
      title: "团队建仓评分抬升",
      detail: `${teamSignal.summary} 建仓分 ${teamSignal.buildScore}/100，建议提高刷新频率。`,
    });
  }

  if (earlyAccumulation.state === "early_build") {
    alerts.push({
      level: "entry",
      title: "少数席位提前建仓",
      detail: `${earlyAccumulation.detail} 已识别 ${earlyAccumulation.detectedBuilders} 个重点席位。`,
    });
  } else if (earlyAccumulation.state === "watch") {
    alerts.push({
      level: "warning",
      title: "建仓前兆观察",
      detail: earlyAccumulation.detail,
    });
  }

  if (teamSignal.exitScore >= 72) {
    alerts.push({
      level: "risk",
      title: "团队撤退评分抬升",
      detail: `${teamSignal.summary} 撤退分 ${teamSignal.exitScore}/100，需优先检查卖压与价差。`,
    });
  }

  if (!alerts.length && entryScore < 70 && dumpRiskScore < 70) {
    alerts.push({
      level: "warning",
      title: "当前无强触发",
      detail: "多空信号都不够极端，更适合继续观察量价和持仓变化。",
    });
  }

  return alerts.slice(0, 4);
}

function createSummary({
  goodId,
  name,
  image,
  buffClose,
  yyypClose,
  spreadPct,
  change7d,
  volumeSpike,
  entryScore,
  dumpRiskScore,
  alertSignal,
  taxonomy,
  updatedAt,
  snapshotsAvailable,
}: Omit<WatchlistSummary, "signal">): WatchlistSummary {
  return {
    goodId,
    name,
    image,
    buffClose,
    yyypClose,
    spreadPct,
    change7d,
    volumeSpike,
    entryScore,
    dumpRiskScore,
    alertSignal,
    taxonomy,
    signal: buildSignalLabel(entryScore, dumpRiskScore),
    updatedAt,
    snapshotsAvailable,
  };
}

export function buildRecommendationCard(analysis: AnalysisResponse): RecommendationCard {
  let recommendationType: RecommendationCard["recommendationType"] = "trend_follow";
  let score = Math.max(
    analysis.earlyAccumulation.score,
    analysis.scores.entryScore,
    analysis.marketContext.teamSignal.buildScore,
  );
  let reason = analysis.strategy.actionSummary;

  if (analysis.earlyAccumulation.state === "early_build") {
    recommendationType = "early_build";
    score = Math.max(score, analysis.earlyAccumulation.score + 6);
    reason = analysis.earlyAccumulation.detail;
  } else if (
    analysis.taxonomy.categoryKey === "sticker" &&
    analysis.scores.entryScore >= 62 &&
    analysis.scores.dumpRiskScore <= 58
  ) {
    recommendationType = "rotation";
    reason = "贴纸题材轮动和仓位集中度正在改善，适合纳入轮动推荐池。";
  } else if (analysis.scores.dumpRiskScore >= 72) {
    recommendationType = "risk_avoid";
    score = analysis.scores.dumpRiskScore;
    reason = "风险侧更强，建议优先放进规避清单而不是推荐清单。";
  }

  const likelyMotives =
    analysis.earlyAccumulation.likelyMotives.length > 0
      ? analysis.earlyAccumulation.likelyMotives
      : buildLikelyMotives({
          taxonomy: analysis.taxonomy,
          spreadPct: analysis.market.spreadPct,
          statisticChange14d: analysis.statistic.change14d,
          sellPressure:
            ((analysis.market.buffSell ?? 0) + (analysis.market.yyypSell ?? 0)) /
            Math.max(1, (analysis.market.buffBuy ?? 0) + (analysis.market.yyypBuy ?? 0)),
          volumeSpike: analysis.summary.volumeSpike,
          change7d: analysis.summary.change7d,
          teamSignal: analysis.marketContext.teamSignal,
          holderInsights: analysis.holderInsights,
        });

  return {
    goodId: analysis.item.goodId,
    name: analysis.item.name,
    image: analysis.item.image,
    taxonomy: analysis.taxonomy,
    recommendationType,
    score: Math.round(clamp(score, 0, 100)),
    reason,
    expected7dPct: analysis.prediction.expected7dPct,
    entryScore: analysis.scores.entryScore,
    dumpRiskScore: analysis.scores.dumpRiskScore,
    teamBuildScore: analysis.marketContext.teamSignal.buildScore,
    teamExitScore: analysis.marketContext.teamSignal.exitScore,
    alertLevel: analysis.pushSignal.level,
    likelyMotives,
    topHolders: analysis.holderInsights.slice(0, 4),
    dataPoints: uniq([
      `${analysis.taxonomy.categoryLabel} / ${analysis.taxonomy.segmentLabel}`,
      `建仓 ${analysis.scores.entryScore}，风险 ${analysis.scores.dumpRiskScore}`,
      `7 天预期 ${formatSignedPercent(analysis.prediction.expected7dPct, 1)}`,
      `团队建仓 ${analysis.marketContext.teamSignal.buildScore} / 撤退 ${analysis.marketContext.teamSignal.exitScore}`,
      analysis.csfloat.listingCount > 0
        ? `CSFloat 在售 ${analysis.csfloat.listingCount} 条`
        : null,
    ]),
  };
}

export function buildRecommendationResponse(analyses: AnalysisResponse[]): RecommendationResponse {
  const cards = analyses.map((analysis) => buildRecommendationCard(analysis));
  const boardMap = new Map<
    string,
    {
      key: string;
      label: string;
      count: number;
      segments: Map<string, { key: string; label: string; count: number }>;
    }
  >();

  analyses.forEach((analysis) => {
    const categoryKey = analysis.taxonomy.categoryKey;
    const segmentKey = analysis.taxonomy.segmentKey;
    const current =
      boardMap.get(categoryKey) ??
      {
        key: categoryKey,
        label: analysis.taxonomy.categoryLabel,
        count: 0,
        segments: new Map<string, { key: string; label: string; count: number }>(),
      };
    current.count += 1;
    const segment =
      current.segments.get(segmentKey) ??
      {
        key: segmentKey,
        label: analysis.taxonomy.segmentLabel,
        count: 0,
      };
    segment.count += 1;
    current.segments.set(segmentKey, segment);
    boardMap.set(categoryKey, current);
  });

  const positive = cards
    .filter((card) => card.recommendationType !== "risk_avoid" && card.score >= 68)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);
  const watch = cards
    .filter((card) => card.recommendationType !== "risk_avoid" && card.score >= 55 && card.score < 68)
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);
  const risk = cards
    .filter((card) => card.recommendationType === "risk_avoid" || card.dumpRiskScore >= 68)
    .sort((left, right) => right.dumpRiskScore - left.dumpRiskScore)
    .slice(0, 8);

  return {
    updatedAt: new Date().toISOString(),
    universeCount: analyses.length,
    positive,
    watch,
    risk,
    boards: [...boardMap.values()]
      .sort((left, right) => right.count - left.count)
      .map((entry) => ({
        key: entry.key,
        label: entry.label,
        count: entry.count,
        segments: [...entry.segments.values()].sort((left, right) => right.count - left.count),
      })),
  };
}

function fillCloseFromMap(
  timeline: ChartCandle[],
  platformMap: Map<number, ChartCandle>,
) {
  let lastValue: number | null = null;

  return timeline.map((candle) => {
    const matched = platformMap.get(candle.t);
    if (matched) {
      lastValue = matched.c;
      return matched.c;
    }

    return lastValue;
  });
}

function closestPlatformByPrice(
  samples: Array<{ platform: number; candles: ChartCandle[] }>,
  refPrice: number | null,
) {
  if (samples.length === 0) {
    return null;
  }

  if (refPrice == null) {
    return samples[0];
  }

  return [...samples].sort((left, right) => {
    const leftDiff = Math.abs((left.candles.at(-1)?.c ?? 0) - refPrice);
    const rightDiff = Math.abs((right.candles.at(-1)?.c ?? 0) - refPrice);
    return leftDiff - rightDiff;
  })[0];
}

async function fetchPlatformSeries(
  client: CsqaqClient,
  goodId: string,
  platform: number,
) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const chart = await client.getChart(goodId, platform);
      if (chart.length > 10) {
        return chart;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === 0 && message.includes("频率限制")) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        continue;
      }
      break;
    }
  }

  throw new Error(`饰品 ${goodId} 平台 ${platform} 的价格图表暂时不可用`);
}

async function fetchPlatformSeriesSafely(
  client: CsqaqClient,
  goodId: string,
  platform: number,
) {
  try {
    return await fetchPlatformSeries(client, goodId, platform);
  } catch {
    return [] as ChartCandle[];
  }
}

async function fetchHoldersSafely(client: CsqaqClient, goodId: string) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await client.getMonitorRank(goodId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === 0 && (message.includes("频率限制") || message.includes("HTML"))) {
        await new Promise((resolve) => setTimeout(resolve, 2500));
        continue;
      }

      return [] as HolderRow[];
    }
  }

  return [] as HolderRow[];
}

async function resolvePlatforms(
  client: CsqaqClient,
  goodId: string,
  _detail: NormalizedDetail,
  currentMap: PlatformMap | undefined,
  persistPlatformMap?: (map: PlatformMap) => Promise<void>,
) {
  const resolvedMap: PlatformMap = {
    buff: 1,
    yyyp: 2,
    updatedAt: new Date().toISOString(),
  };

  const shouldPersist =
    !currentMap || currentMap.buff !== resolvedMap.buff || currentMap.yyyp !== resolvedMap.yyyp;

  if (persistPlatformMap && shouldPersist) {
    await persistPlatformMap(resolvedMap);
  }

  const buffCandles = await fetchPlatformSeries(client, goodId, resolvedMap.buff!);
  const yyypCandles = await fetchPlatformSeriesSafely(client, goodId, resolvedMap.yyyp!);

  return {
    map: resolvedMap,
    buffCandles,
    yyypCandles,
  };
}

type AnalyzeOptions = {
  includeHolders: boolean;
  platformMap?: PlatformMap;
  persistPlatformMap?: (map: PlatformMap) => Promise<void>;
  llmClient?: LocalMonitorLlmClient;
  getCsfloatListingSummary?: (marketHashName: string | null) => Promise<CsfloatListingSummary>;
};

function buildEmptyCsfloatSummary(marketHashName: string | null): CsfloatListingSummary {
  return {
    enabled: false,
    source: "CSFloat Market",
    marketHashName,
    listingCount: 0,
    lowestPrice: null,
    highestPrice: null,
    bestFloat: null,
    limitation: "尚未接入 CSFloat 补充数据。",
    samples: [],
  };
}

function buildFallbackLlmInsight(llmClient?: LocalMonitorLlmClient, includeHolders = true): LlmInsight {
  if (!includeHolders) {
    return {
      enabled: Boolean(llmClient),
      status: "disabled",
      provider: llmClient?.provider ?? "Local OpenAI-Compatible",
      model: llmClient?.model ?? (process.env.LOCAL_LLM_MODEL ?? "gpt-5.4"),
      generatedAt: null,
      summary: "监控池摘要默认不调用 LLM，以保证刷新速度。",
      regime: "neutral",
      confidence: null,
      buildSignalStrength: null,
      dumpSignalStrength: null,
      cooldownAssessment: "unknown",
      alertDecision: "unavailable",
      expected7dRange: {
        lowPct: null,
        basePct: null,
        highPct: null,
      },
      evidence: [],
      counterSignals: [],
      actionPlan: [],
      nextCheckMinutes: null,
      shouldPushAlert: false,
      pushReason: "仅在单标的深度分析时调用 AI。",
    };
  }

  if (!llmClient) {
    return {
      enabled: false,
      status: "disabled",
      provider: "Local OpenAI-Compatible",
      model: process.env.LOCAL_LLM_MODEL ?? "gpt-5.4",
      generatedAt: null,
      summary: includeHolders
        ? "本地 LLM 未接入，当前仅使用规则引擎。"
        : "监控池摘要默认不调用 LLM，以保证刷新速度。",
      regime: "neutral",
      confidence: null,
      buildSignalStrength: null,
      dumpSignalStrength: null,
      cooldownAssessment: "unknown",
      alertDecision: "unavailable",
      expected7dRange: {
        lowPct: null,
        basePct: null,
        highPct: null,
      },
      evidence: [],
      counterSignals: [],
      actionPlan: [],
      nextCheckMinutes: null,
      shouldPushAlert: false,
      pushReason: "当前未启用 LLM 辅助判断。",
    };
  }

  return {
    enabled: true,
    status: "degraded",
    provider: llmClient.provider,
    model: llmClient.model,
    generatedAt: null,
    summary: "AI 辅助判断暂未生成，本轮先使用规则引擎结果。",
    regime: "neutral",
    confidence: null,
    buildSignalStrength: null,
    dumpSignalStrength: null,
    cooldownAssessment: "unknown",
    alertDecision: "unavailable",
    expected7dRange: {
      lowPct: null,
      basePct: null,
      highPct: null,
    },
    evidence: [],
    counterSignals: [],
    actionPlan: [],
    nextCheckMinutes: null,
    shouldPushAlert: false,
    pushReason: "本轮未获取到 AI 结论。",
  };
}

export async function analyzeItem(
  client: CsqaqClient,
  goodId: string,
  options: AnalyzeOptions,
): Promise<AnalysisResponse> {
  const detailRaw = await client.getGoodById(goodId);
  const detail = normalizeDetail(detailRaw, goodId);
  const platformInfo = await resolvePlatforms(
    client,
    goodId,
    detail,
    options.platformMap,
    options.persistPlatformMap,
  );

  const buffCandles = platformInfo.buffCandles;
  const yyypCandles = platformInfo.yyypCandles;
  const primary = buffCandles.length >= yyypCandles.length ? buffCandles : yyypCandles;
  const secondary = primary === buffCandles ? yyypCandles : buffCandles;
  const secondaryMap = new Map(secondary.map((row) => [row.t, row]));

  const buffMap = new Map(buffCandles.map((row) => [row.t, row]));
  const yyypMap = new Map(yyypCandles.map((row) => [row.t, row]));
  const buffClose = fillCloseFromMap(primary, buffMap);
  const yyypClose = fillCloseFromMap(primary, yyypMap);
  const blendClose = primary.map((row, index) => {
    const values = [buffClose[index], yyypClose[index]].filter(
      (value): value is number => value != null,
    );
    return Number(average(values).toFixed(2));
  });
  const blendVolume = primary.map((row) => {
    const counterpart = secondaryMap.get(row.t);
    return row.v + (counterpart?.v ?? 0);
  });

  const ma7 = movingAverage(blendClose, 7);
  const ma20 = movingAverage(blendClose, 20);
  const macd = calcMacd(blendClose);
  const kdj = calcKdj(primary);
  const macdSignal = resolveMacdSignal(macd);
  const kdjSignal = resolveKdjSignal(kdj);

  const latestIndex = blendClose.length - 1;
  const latestBlend = blendClose[latestIndex] ?? null;
  const priceTier = resolvePriceTier(latestBlend);
  const taxonomy = buildTaxonomy(detail, latestBlend);
  const latestBuff = buffClose[latestIndex] ?? detail.buffPrice;
  const latestYyyp = yyypClose[latestIndex] ?? detail.yyypPrice;
  const change7d =
    latestIndex >= 7 ? percentageChange(latestBlend, blendClose[latestIndex - 7]) : null;
  const change30d =
    latestIndex >= 30 ? percentageChange(latestBlend, blendClose[latestIndex - 30]) : null;
  const change1d =
    latestIndex >= 1 ? percentageChange(latestBlend, blendClose[latestIndex - 1]) : null;
  const volumeSpike = Number(
    (
      averageLast(blendVolume, 3) /
      Math.max(1, average(blendVolume.slice(Math.max(0, blendVolume.length - 21), -3)))
    ).toFixed(2),
  );
  const statisticSeries = options.includeHolders
    ? normalizeStatisticSeries(await client.getGoodStatistic(goodId))
    : [];
  const currentStatistic = statisticSeries.at(-1)?.value ?? detail.statistic;
  const statisticChange7d = percentageChange(currentStatistic, findStatisticValueDaysAgo(statisticSeries, 7));
  const statisticChange14d = percentageChange(
    currentStatistic,
    findStatisticValueDaysAgo(statisticSeries, 14),
  );
  const statisticChange30d = percentageChange(
    currentStatistic,
    findStatisticValueDaysAgo(statisticSeries, 30),
  );

  let holders: HolderRow[] = [];
  if (options.includeHolders) {
    holders = await fetchHoldersSafely(client, goodId);
  }

  const top1 = holders[0]?.num ?? null;
  const top5 = holders.slice(0, 5).reduce((sum, row) => sum + row.num, 0) || null;
  const top10 = holders.slice(0, 10).reduce((sum, row) => sum + row.num, 0) || null;
  const top5SharePct = sharePct(top5, currentStatistic);
  const top10SharePct = sharePct(top10, currentStatistic);
  const spreadPct = percentageChange(latestBuff, latestYyyp);

  const snapshot: Snapshot = {
    at: new Date().toISOString(),
    goodId,
    buffClose: latestBuff,
    yyypClose: latestYyyp,
    spreadPct,
    volume: blendVolume.at(-1) ?? 0,
    top1,
    top10,
    buffSell: detail.buffSell,
    yyypSell: detail.yyypSell,
    buffBuy: detail.buffBuy,
    yyypBuy: detail.yyypBuy,
    leaders: holders.slice(0, 12).map<HolderLeaderSnapshot>((row) => ({
      steamId: row.steamId,
      steamName: row.steamName,
      avatar: row.avatar,
      num: row.num,
    })),
  };

  const previousSnapshots = await listSnapshots(goodId);
  const delta24h = buildTrendDelta(previousSnapshots, snapshot, 24);
  const delta7d = buildTrendDelta(previousSnapshots, snapshot, 24 * 7);
  const holderInsights = buildHolderLeaderInsights({
    holders,
    history: previousSnapshots,
    snapshotAt: snapshot.at,
    currentStatistic,
  });
  const persistedSnapshots = await appendSnapshot(snapshot);

  const sellPressure = (() => {
    const sells = (detail.buffSell ?? 0) + (detail.yyypSell ?? 0);
    const buys = (detail.buffBuy ?? 0) + (detail.yyypBuy ?? 0);
    if (sells === 0 || buys === 0) {
      return 1;
    }
    return sells / buys;
  })();
  const teamSignal = buildTeamSignal({
    priceTier,
    top5SharePct,
    top10SharePct,
    delta24h,
    delta7d,
    volumeSpike,
    change1d,
    change7d,
    statisticChange14d,
    sellPressure,
    spreadPct,
  });
  let earlyAccumulation: EarlyAccumulationSignal;
  const csfloat =
    options.includeHolders && options.getCsfloatListingSummary
      ? await options.getCsfloatListingSummary(detail.marketHashName)
      : buildEmptyCsfloatSummary(detail.marketHashName);

  let entryScore = 42;
  let dumpRiskScore = 26;
  const entryReasons: string[] = [];
  const dumpReasons: string[] = [];

  if (macdSignal.signal === "buy") {
    entryScore += 14;
    entryReasons.push(macdSignal.summary);
  } else {
    dumpRiskScore += 12;
    dumpReasons.push(macdSignal.summary);
  }

  if (kdjSignal.signal === "buy") {
    entryScore += 10;
    entryReasons.push(kdjSignal.summary);
  } else if (kdjSignal.signal === "sell") {
    dumpRiskScore += 8;
    dumpReasons.push(kdjSignal.summary);
  }

  if ((change7d ?? 0) > 3 && (change30d ?? 0) < 18) {
    entryScore += 11;
    entryReasons.push(`近 7 天涨幅 ${(change7d ?? 0).toFixed(1)}%，趋势正在抬升`);
  }

  if ((change7d ?? 0) < -(priceTier.dangerDropThresholdPct * 1.6)) {
    dumpRiskScore += 16;
    dumpReasons.push(`近 7 天跌幅 ${(change7d ?? 0).toFixed(1)}%，短线承压明显`);
  }

  if (
    (change1d ?? 0) <= -priceTier.dangerDropThresholdPct * 0.7 &&
    volumeSpike >= priceTier.buildVolumeThreshold
  ) {
    dumpRiskScore += 14;
    dumpReasons.push(`放量下跌 ${volumeSpike}x，疑似加速出货`);
  }

  if (
    (change1d ?? 0) >= Math.max(1.2, priceTier.dangerDropThresholdPct * 0.45) &&
    volumeSpike >= priceTier.buildVolumeThreshold
  ) {
    entryScore += 9;
    entryReasons.push(`放量上攻 ${volumeSpike}x，可能出现主动建仓`);
  }

  if ((spreadPct ?? 0) <= -(priceTier.spreadRiskThresholdPct * 0.55)) {
    entryScore += 6;
    entryReasons.push("悠悠有品价格低于 BUFF，存在跨平台价差缓冲");
  }

  if ((spreadPct ?? 0) >= priceTier.spreadRiskThresholdPct) {
    dumpRiskScore += 5;
    dumpReasons.push("BUFF 溢价明显扩张，跨平台价格开始分化");
  }

  if (sellPressure > 2.2) {
    dumpRiskScore += 12;
    dumpReasons.push(`在售/求购比 ${sellPressure.toFixed(2)}，卖压明显偏大`);
  } else if (sellPressure < 1.1) {
    entryScore += 6;
    entryReasons.push(`在售/求购比 ${sellPressure.toFixed(2)}，承接相对健康`);
  }

  if ((delta24h?.changePct ?? 0) > 4) {
    entryScore += 10;
    entryReasons.push(`Top10 持仓 24h 增加 ${(delta24h?.changePct ?? 0).toFixed(1)}%`);
  }

  if ((delta24h?.changePct ?? 0) < -4) {
    dumpRiskScore += 12;
    dumpReasons.push(`Top10 持仓 24h 减少 ${(delta24h?.changePct ?? 0).toFixed(1)}%`);
  }

  if ((delta7d?.changePct ?? 0) > 7) {
    entryScore += 8;
    entryReasons.push(`Top10 持仓 7d 累积增加 ${(delta7d?.changePct ?? 0).toFixed(1)}%`);
  }

  if ((delta7d?.changePct ?? 0) < -8) {
    dumpRiskScore += 9;
    dumpReasons.push(`Top10 持仓 7d 累积下降 ${(delta7d?.changePct ?? 0).toFixed(1)}%`);
  }

  if ((statisticChange14d ?? 0) <= -0.8) {
    entryScore += 4;
    entryReasons.push(`近 14 天存世量收缩 ${(statisticChange14d ?? 0).toFixed(2)}%，供给压力在下降`);
  }

  if ((statisticChange14d ?? 0) >= 2.5) {
    dumpRiskScore += 6;
    dumpReasons.push(`近 14 天存世量扩张 ${(statisticChange14d ?? 0).toFixed(2)}%，供给上升会压制弹性`);
  }

  if ((top10SharePct ?? 0) >= 1 && (delta24h?.changePct ?? 0) > 4) {
    entryScore += 4;
    entryReasons.push(`Top10 占存世量 ${top10SharePct?.toFixed(2)}%，并且 24h 仍在增持`);
  }

  if (teamSignal.buildScore >= 60) {
    entryScore += Math.round((teamSignal.buildScore - 55) * 0.28);
    entryReasons.push(`团队建仓分 ${teamSignal.buildScore}/100：${teamSignal.summary}`);
  }

  if (teamSignal.exitScore >= 60) {
    dumpRiskScore += Math.round((teamSignal.exitScore - 55) * 0.3);
    dumpReasons.push(`团队撤退分 ${teamSignal.exitScore}/100：${teamSignal.summary}`);
  }

  entryScore = Math.round(clamp(entryScore, 0, 100));
  dumpRiskScore = Math.round(clamp(dumpRiskScore, 0, 100));

  if (!entryReasons.length) {
    entryReasons.push("量价与持仓没有形成明确共振，先以观察为主");
  }

  if (!dumpReasons.length) {
    dumpReasons.push("暂未出现明显砸盘信号，但仍需盯住挂单和成交量");
  }

  earlyAccumulation = buildEarlyAccumulationSignal({
    itemName: detail.name,
    taxonomy,
    change1d,
    change7d,
    volumeSpike,
    entryScore,
    dumpRiskScore,
    teamSignal,
    statisticChange14d,
    spreadPct,
    sellPressure,
    holderInsights,
  });

  const recentReturns = blendClose
    .map((value, index) =>
      index === 0 ? null : percentageChange(value, blendClose[index - 1]),
    )
    .filter((value): value is number => value != null);
  const volatility = standardDeviation(recentReturns.slice(-20));
  const bias = (entryScore - dumpRiskScore) / 7;
  const expected7dPct = Number(
    clamp(
      bias +
        (change7d ?? 0) * 0.22 +
        (teamSignal.buildScore - teamSignal.exitScore) * 0.04,
      -18,
      18,
    ).toFixed(2),
  );
  const confidence = Math.round(
    clamp(52 + Math.abs(entryScore - dumpRiskScore) * 0.35 + volumeSpike * 4, 45, 89),
  );
  const cooldownRiskPct = Math.round(
    clamp(
      Math.max(
        10,
        dumpRiskScore -
          entryScore * 0.25 +
          volatility * 2 +
          (priceTier.cooldownWeight - 1) * 18,
      ),
      10,
      90,
    ),
  );
  const lowBand =
    latestBlend == null
      ? null
      : Number((latestBlend * (1 + (expected7dPct - volatility * 1.6) / 100)).toFixed(2));
  const baseBand =
    latestBlend == null
      ? null
      : Number((latestBlend * (1 + expected7dPct / 100)).toFixed(2));
  const highBand =
    latestBlend == null
      ? null
      : Number((latestBlend * (1 + (expected7dPct + volatility * 1.6) / 100)).toFixed(2));

  let direction = "震荡";
  if (expected7dPct >= 4) {
    direction = "偏强";
  } else if (expected7dPct <= -4) {
    direction = "偏弱";
  } else if (entryScore > dumpRiskScore) {
    direction = "缓慢抬升";
  } else if (dumpRiskScore > entryScore) {
    direction = "弱势回撤";
  }

  const strategy = buildStrategyPlan({
    latestBlend,
    entryScore,
    dumpRiskScore,
    expected7dPct,
    cooldownRiskPct,
    volatility,
    priceTier,
    teamSignal,
  });
  const reasoning = buildReasoningFactors({
    change7d,
    change30d,
    volumeSpike,
    currentStatistic,
    statisticChange14d,
    top5,
    top5SharePct,
    top10SharePct,
    spreadPct,
    latestBuff,
    latestYyyp,
    sellPressure,
    delta24h,
    priceTier,
    teamSignal,
  });
  const alerts = buildItemAlerts({
    change1d,
    volumeSpike,
    entryScore,
    dumpRiskScore,
    spreadPct,
    latestBuff,
    latestYyyp,
    delta24h,
    statisticChange14d,
    cooldownRiskPct,
    priceTier,
    teamSignal,
    earlyAccumulation,
  });
  const statistic: StatisticSnapshot = {
    current: currentStatistic,
    change7d: statisticChange7d,
    change14d: statisticChange14d,
    change30d: statisticChange30d,
  };

  const updatedAt = new Date().toISOString();
  const llm =
    options.includeHolders && options.llmClient
      ? await options.llmClient.analyzeItem(
          {
            item: {
              goodId,
              name: detail.name,
              marketHashName: detail.marketHashName,
              rarity: detail.rarity,
              weapon: detail.weapon,
              exterior: detail.exterior,
            },
            taxonomy,
            priceTier,
            market: {
              latestBlend,
              latestBuff,
              latestYyyp,
              spreadPct,
              sellPressure,
            },
            trends: {
              change1d,
              change7d,
              change30d,
              volumeSpike,
              volatility,
            },
            indicators: {
              macd: {
                signal: macdSignal.signal,
                summary: macdSignal.summary,
              },
              kdj: {
                signal: kdjSignal.signal,
                summary: kdjSignal.summary,
              },
            },
            statistic: {
              current: currentStatistic,
              change7d: statisticChange7d,
              change14d: statisticChange14d,
              change30d: statisticChange30d,
            },
            holders: {
              top1,
              top5,
              top10,
              top5SharePct,
              top10SharePct,
              delta24h,
              delta7d,
            },
            holderInsights: holderInsights.slice(0, 5),
            scores: {
              entryScore,
              dumpRiskScore,
              entryReasons,
              dumpReasons,
            },
            prediction: {
              direction,
              confidence,
              expected7dPct,
              cooldownRiskPct,
              lowBand,
              baseBand,
              highBand,
            },
            teamSignal,
            earlyAccumulation,
            strategy,
            alerts,
            csfloat,
          },
          {
            snapshotCount: persistedSnapshots.length,
            recentSnapshots: persistedSnapshots.slice(-10),
            recentStatisticSeries: statisticSeries.slice(-12),
          },
        )
      : buildFallbackLlmInsight(options.llmClient, options.includeHolders);
  const idleAlertSignal = createIdleAlertSignal(updatedAt, entryScore, dumpRiskScore);
  const summary = createSummary({
    goodId,
    name: detail.name,
    image: detail.image,
    buffClose: latestBuff,
    yyypClose: latestYyyp,
    spreadPct,
    change7d,
    volumeSpike,
    entryScore,
    dumpRiskScore,
    alertSignal: idleAlertSignal,
    taxonomy,
    updatedAt,
    snapshotsAvailable: persistedSnapshots.length,
  });

  return applyPushSignal({
    item: {
      goodId,
      name: detail.name,
      image: detail.image,
      rarity: detail.rarity,
      weapon: detail.weapon,
      exterior: detail.exterior,
    },
    market: {
      buffClose: latestBuff,
      yyypClose: latestYyyp,
      spreadPct,
      buffSell: detail.buffSell,
      yyypSell: detail.yyypSell,
      buffBuy: detail.buffBuy,
      yyypBuy: detail.yyypBuy,
      updatedAt,
      t7SellableAt: addDays(new Date(), 7).toISOString(),
    },
    charts: {
      timestamps: primary.map((row) => row.t),
      labels: primary.map((row) => formatDateLabel(row.t)),
      buffClose,
      yyypClose,
      blendClose,
      blendVolume,
      ma7,
      ma20,
    },
    indicators: {
      macd: {
        ...macd,
        signal: macdSignal.signal,
        summary: macdSignal.summary,
      },
      kdj: {
        ...kdj,
        signal: kdjSignal.signal,
        summary: kdjSignal.summary,
      },
    },
    prediction: {
      direction,
      confidence,
      expected7dPct,
      lowBand,
      baseBand,
      highBand,
      cooldownRiskPct,
    },
    scores: {
      entryScore,
      dumpRiskScore,
      entryLabel:
        entryScore >= 78 ? "偏强建仓" : entryScore >= 62 ? "观察低吸" : "暂缓建仓",
      dumpLabel:
        dumpRiskScore >= 72 ? "高危跑路" : dumpRiskScore >= 58 ? "筹码松动" : "风险暂稳",
      entryReasons,
      dumpReasons,
    },
    strategy,
    marketContext: {
      priceTier,
      teamSignal,
    },
    reasoning,
    alerts,
    statistic,
    llm,
    pushSignal: idleAlertSignal,
    taxonomy,
    holderInsights,
    earlyAccumulation,
    csfloat,
    holders: {
      rows: holders.slice(0, 10),
      top5,
      top1,
      top10,
      top5SharePct,
      top10SharePct,
      delta24h,
      delta7d,
    },
    history: {
      snapshotsAvailable: persistedSnapshots.length,
      lastSnapshotAt: persistedSnapshots.at(-1)?.at ?? null,
    },
    summary,
  });
}
