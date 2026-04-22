import { appendSnapshot, listSnapshots } from "./history-store.js";
import type { CsqaqClient } from "./csqaq-client.js";
import type { LocalMonitorLlmClient } from "./llm-client.js";
import type {
  AlertSignal,
  AnalysisResponse,
  BoardTaxonomy,
  BottomReversalSignal,
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
  ScoreDriver,
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

function normalizeContribution(value: number) {
  return Number(value.toFixed(1));
}

function recordScoreDriver(
  drivers: ScoreDriver[],
  title: string,
  contribution: number,
  detail: string,
  tone: ScoreDriver["tone"],
) {
  if (!Number.isFinite(contribution) || Math.abs(contribution) < 0.2) {
    return 0;
  }

  const normalized = normalizeContribution(contribution);
  drivers.push({
    title,
    contribution: normalized,
    detail,
    tone,
  });
  return normalized;
}

function uniq(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())).map((value) => value.trim()))];
}

function includesAny(text: string, tokens: string[]) {
  return tokens.some((token) => text.includes(token));
}

function normalizeItemText(text: string | null | undefined) {
  return (text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

const TEAM_STICKER_TOKENS = [
  " gaming",
  " esports",
  " team",
  "g2",
  "faze",
  "furia",
  "pain",
  "navi",
  "navi",
  "vitality",
  "liquid",
  "spirit",
  "mouz",
  "astralis",
  "fnatic",
  "nip",
  "heroic",
  "ence",
  "complexity",
  "cloud9",
  "virtus.pro",
  "vp",
  "imperial",
  "9z",
  "monte",
  "apeks",
  "aurora",
  "falcons",
  "the mongolz",
  "mongolz",
  "lynn vision",
  "3dmax",
  "b8",
  "ecstatic",
  "big",
  "og",
  "gamerlegion",
];

function isStatTrakName(text: string) {
  return includesAny(text, ["stattrak", "stat trak", "stattrak™"]);
}

function isHoloStickerName(text: string) {
  return includesAny(text, ["(holo)", "（全息）", " holo ", "全息"]);
}

function isLikelyTeamSticker(text: string) {
  if (
    includesAny(text, [
      "autograph",
      "签名",
      "souvenir",
      "glitter",
      "paper",
      "foil",
      "champion",
      "mvp",
      "选手",
    ])
  ) {
    return false;
  }

  return TEAM_STICKER_TOKENS.some((token) => text.includes(token));
}

function countConsecutiveFromEnd(
  values: number[],
  predicate: (value: number, index: number, values: number[]) => boolean,
) {
  let count = 0;
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (!predicate(values[index]!, index, values)) {
      break;
    }
    count += 1;
  }
  return count;
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
    updatedAt: pickString(raw, ["updated_at"], [["updated", "at"]]),
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
    buffBuyPrice: pickNumber(
      raw,
      ["buff_buy_price"],
      [["buff", "buy", "price"]],
    ),
    yyypBuyPrice: pickNumber(
      raw,
      ["yyyp_buy_price"],
      [["yyyp", "buy", "price"]],
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
  if (dumpRiskScore >= 120) {
    return "高危跑路";
  }

  if (entryScore >= 120) {
    return "强势建仓";
  }

  if (entryScore >= 45) {
    return "观察低吸";
  }

  if (dumpRiskScore >= 45) {
    return "筹码松动";
  }

  if (entryScore <= -80) {
    return "不宜建仓";
  }

  return "中性观察";
}

function toDirectionalScore(rawScore: number, opposingScore: number) {
  return Number(
    clamp((rawScore - 50) * 5 + (rawScore - opposingScore) * 1.5, -200, 200).toFixed(1),
  );
}

const ENTRY_PUSH_THRESHOLD = 72;
const EXIT_PUSH_THRESHOLD = 72;
const WATCH_THRESHOLD = 60;
const LLM_PUSH_THRESHOLD = 65;
const ENTRY_SCORE_PUSH_THRESHOLD = 110;
const EXIT_SCORE_PUSH_THRESHOLD = 110;
const ENTRY_SCORE_WATCH_THRESHOLD = 40;
const EXIT_SCORE_WATCH_THRESHOLD = 40;

function createIdleAlertSignal(
  updatedAt: string,
  entryScore: number,
  dumpRiskScore: number,
): AlertSignal {
  return {
    level: "silent",
    shouldNotify: false,
    score: Math.max(0, entryScore, dumpRiskScore),
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
    marketContext.teamSignal.buildScore >= ENTRY_PUSH_THRESHOLD &&
    scores.entryScore >= ENTRY_SCORE_PUSH_THRESHOLD;
  if (entryByTeam) {
    sources.add("team");
    buildRules.push(
      `团队建仓 ${marketContext.teamSignal.buildScore}/100 与建仓分 ${scores.entryScore}/200 同步过线`,
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
    marketContext.teamSignal.exitScore >= EXIT_PUSH_THRESHOLD &&
    scores.dumpRiskScore >= EXIT_SCORE_PUSH_THRESHOLD;
  if (exitByTeam) {
    sources.add("team");
    exitRules.push(
      `团队撤退 ${marketContext.teamSignal.exitScore}/100 与风险分 ${scores.dumpRiskScore}/200 同步过线`,
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
      scores.entryScore >= ENTRY_SCORE_WATCH_THRESHOLD ||
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
      scores.dumpRiskScore >= EXIT_SCORE_WATCH_THRESHOLD ||
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

type AutonomousEligibility = {
  passed: boolean;
  summary: string;
  reasons: string[];
};

function evaluateAutonomousRecommendationEligibility(analysis: AnalysisResponse): AutonomousEligibility {
  const nameText = normalizeItemText(analysis.item.name);
  const statistic = analysis.statistic.current;

  if (isStatTrakName(nameText)) {
    return {
      passed: false,
      summary: "StatTrak™ 标的不纳入自主推荐池",
      reasons: ["当前标的带有 StatTrak™ 标签，按你的要求直接剔除。"],
    };
  }

  if (analysis.taxonomy.categoryKey === "sticker") {
    if (!isHoloStickerName(nameText)) {
      return {
        passed: false,
        summary: "非全息贴纸不纳入自主推荐池",
        reasons: ["当前贴纸不是全息品质，已按规则剔除。"],
      };
    }

    if (!isLikelyTeamSticker(nameText)) {
      return {
        passed: false,
        summary: "仅保留全息战队贴纸",
        reasons: ["当前贴纸更像选手签名或非战队题材，不进入自主推荐池。"],
      };
    }

    return {
      passed: true,
      summary: "全息战队贴纸进入自主推荐池",
      reasons: ["当前贴纸满足“全息 + 战队题材”的自主推荐条件。"],
    };
  }

  if (analysis.taxonomy.categoryKey === "gun") {
    if (statistic == null) {
      return {
        passed: false,
        summary: "枪皮缺少存世量数据",
        reasons: ["当前枪皮还没拿到稳定存世量，先不放入自主推荐池。"],
      };
    }

    if (statistic < 5_000 || statistic > 30_000) {
      return {
        passed: false,
        summary: "枪皮存世量不在 5000-30000 区间",
        reasons: ["当前存世量 " + formatCount(statistic) + "，未落在你指定的枪皮观察区间。"],
      };
    }

    return {
      passed: true,
      summary: "枪皮存世量命中目标区间",
      reasons: ["当前存世量 " + formatCount(statistic) + "，处于 5000-30000 的观察区间。"],
    };
  }

  if (analysis.taxonomy.categoryKey === "glove") {
    if (statistic == null) {
      return {
        passed: false,
        summary: "手套缺少存世量数据",
        reasons: ["当前手套还没拿到稳定存世量，先不放入自主推荐池。"],
      };
    }

    if (statistic < 2_000 || statistic > 7_000) {
      return {
        passed: false,
        summary: "手套存世量不在 2000-7000 区间",
        reasons: ["当前存世量 " + formatCount(statistic) + "，未落在你指定的手套观察区间。"],
      };
    }

    return {
      passed: true,
      summary: "手套存世量命中目标区间",
      reasons: ["当前存世量 " + formatCount(statistic) + "，处于 2000-7000 的观察区间。"],
    };
  }

  if (analysis.taxonomy.categoryKey === "agent") {
    return {
      passed: true,
      summary: "探员板块直接纳入自主推荐池",
      reasons: ["当前标的是探员题材，按规则直接进入自主推荐池。"],
    };
  }

  return {
    passed: false,
    summary: "当前板块不在自主推荐范围",
    reasons: ["当前仅纳入枪皮、手套、探员和全息战队贴纸。"],
  };
}

export function isAutonomousRecommendationEligible(analysis: AnalysisResponse) {
  return evaluateAutonomousRecommendationEligibility(analysis).passed;
}

function buildBottomReversalSignal({
  itemName,
  taxonomy,
  currentStatistic,
  closes,
  macd,
}: {
  itemName: string;
  taxonomy: BoardTaxonomy;
  currentStatistic: number | null;
  closes: number[];
  macd: ReturnType<typeof calcMacd>;
}): BottomReversalSignal {
  const nameText = normalizeItemText(itemName);
  const eligibleBoard =
    (taxonomy.categoryKey === "gun" &&
      currentStatistic != null &&
      currentStatistic >= 5_000 &&
      currentStatistic <= 30_000) ||
    (taxonomy.categoryKey === "glove" &&
      currentStatistic != null &&
      currentStatistic >= 2_000 &&
      currentStatistic <= 7_000) ||
    taxonomy.categoryKey === "agent" ||
    (taxonomy.categoryKey === "sticker" && isHoloStickerName(nameText) && isLikelyTeamSticker(nameText));

  const latestIndex = macd.dif.length - 1;
  if (!eligibleBoard || latestIndex < 8 || closes.length < 12) {
    return {
      triggered: false,
      score: 0,
      title: itemName + " 未触发底部蓄势预警",
      detail: "当前样本量不足，或板块不在底部反转策略的观察范围内。",
      overlapDays: 0,
      shrinkDays: 0,
      recentLowDays: 0,
    };
  }

  const macdGapSeries = macd.dif.map((value, index) => Math.abs(value - macd.dea[index]!));
  const gapThreshold = Math.max(0.05, Number((average(macdGapSeries.slice(-12)) * 0.8).toFixed(4)));
  const overlapDays = countConsecutiveFromEnd(
    macdGapSeries,
    (_gap, index) =>
      (macd.dif[index] ?? 0) < 0 &&
      (macd.dea[index] ?? 0) < 0 &&
      Math.abs((macd.dif[index] ?? 0) - (macd.dea[index] ?? 0)) <= gapThreshold,
  );

  let crossSwitches = 0;
  const startIndex = Math.max(1, macd.dif.length - overlapDays);
  for (let index = startIndex; index < macd.dif.length; index += 1) {
    const prevGap = macd.dif[index - 1]! - macd.dea[index - 1]!;
    const currentGap = macd.dif[index]! - macd.dea[index]!;
    if (Math.sign(prevGap) !== 0 && Math.sign(currentGap) !== 0 && Math.sign(prevGap) !== Math.sign(currentGap)) {
      crossSwitches += 1;
    }
  }

  const shrinkDays = countConsecutiveFromEnd(
    macd.hist,
    (value, index, values) =>
      value < 0 &&
      (index === 0 || (values[index - 1]! < 0 && Math.abs(value) <= Math.abs(values[index - 1]!) + 0.02)),
  );

  const recentWindow = closes.slice(-12);
  const priorWindow = recentWindow.slice(0, -4);
  const tailWindow = recentWindow.slice(-4);
  const priorLow = priorWindow.length ? Math.min(...priorWindow) : recentWindow[0]!;
  const tailLow = tailWindow.length ? Math.min(...tailWindow) : recentWindow.at(-1)!;
  const latestClose = recentWindow.at(-1)!;
  const notNewLow = tailLow >= priorLow * 0.998 && latestClose >= priorLow * 1.005;

  const difBelowZero = (macd.dif.at(-1) ?? 0) < 0;
  const deaBelowZero = (macd.dea.at(-1) ?? 0) < 0;
  const triggered =
    difBelowZero &&
    deaBelowZero &&
    overlapDays >= 6 &&
    crossSwitches >= 1 &&
    notNewLow &&
    shrinkDays >= 4;

  const score = Math.round(
    clamp(42 + overlapDays * 5 + shrinkDays * 4 + (notNewLow ? 12 : -10) + crossSwitches * 6, 0, 100),
  );

  return {
    triggered,
    score,
    title: triggered ? itemName + " 底部蓄势即将向上反转预警" : itemName + " 未触发底部蓄势预警",
    detail: triggered
      ? "MACD 双线在零轴下方粘合 " + overlapDays + " 天，绿柱连续缩短 " + shrinkDays + " 天，最近价格未再创近期新低，已满足底部蓄势反转条件。"
      : "当前仅满足部分条件：双线粘合 " + overlapDays + " 天、绿柱缩短 " + shrinkDays + " 天，" + (notNewLow ? "价格已止跌。" : "价格仍可能探新低。"),
    overlapDays,
    shrinkDays,
    recentLowDays: 4,
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

function dedupeHolderRows(rows: HolderRow[]) {
  const merged = new Map<
    string,
    HolderRow & {
      order: number;
    }
  >();

  rows.forEach((row, index) => {
    const key = holderKey(row);
    if (!key) {
      return;
    }

    const current = merged.get(key);
    if (!current) {
      merged.set(key, {
        ...row,
        steamName: row.steamName.trim() || "未知持仓",
        order: index,
      });
      return;
    }

    const nextName = row.steamName.trim();
    const currentName = current.steamName.trim();
    const shouldReplaceName =
      Boolean(nextName) &&
      (!currentName ||
        currentName === "未知持仓" ||
        currentName === "< blank >" ||
        nextName.length > currentName.length);

    merged.set(key, {
      ...current,
      id: current.id ?? row.id,
      steamId: current.steamId ?? row.steamId,
      avatar: current.avatar ?? row.avatar,
      steamName: shouldReplaceName ? nextName : current.steamName,
      num: Math.max(current.num, row.num),
      order: Math.min(current.order, index),
    });
  });

  return [...merged.values()]
    .sort((left, right) => right.num - left.num || left.order - right.order)
    .map(({ order: _order, ...row }) => row);
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
      taskId: row.id,
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
    motives.push("价格只是缓慢抬头，节奏更像提前试仓而不是情绪化拉升");
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
      title: itemName + " 疑似提前建仓",
      detail:
        "目前主要是少数席位在抬升仓位，价格还只是轻微上拐，尚未进入暴力拉升阶段，适合列入优先观察名单。",
      detectedBuilders: builders.length,
      totalTrackedSharePct: Number(builderShare.toFixed(2)),
      likelyMotives,
    };
  }

  if (builders.length >= 2 && (change7d ?? 0) > 7) {
    return {
      state: "crowded_breakout",
      score,
      title: itemName + " 资金已被市场看见",
      detail:
        "持仓席位仍在集中，但价格已经明显抬升，后续更像突破跟随而不是提前潜伏，追价风险会更高。",
      detectedBuilders: builders.length,
      totalTrackedSharePct: Number(builderShare.toFixed(2)),
      likelyMotives,
    };
  }

  if (builders.length >= 1 || score >= 58 || (entryScore >= 45 && dumpRiskScore <= 20)) {
    return {
      state: "watch",
      score,
      title: itemName + " 建仓观察中",
      detail: "已经能看到部分席位试探性加仓，但强度还不够，建议继续等 1 到 2 轮快照确认。",
      detectedBuilders: builders.length,
      totalTrackedSharePct: Number(builderShare.toFixed(2)),
      likelyMotives,
    };
  }

  return {
    state: "none",
    score,
    title: itemName + " 暂无提前建仓特征",
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
      Math.max(0, dumpRiskScore - entryScore) * 0.015 +
      Math.max(0, teamSignal.exitScore - 60) * 0.035,
    2.8,
    12,
  );
  const targetPct = clamp(
    Math.max(expected7dPct, 1.2) +
      volatility * 0.55 +
      Math.max(0, scoreGap) * 0.015 +
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

  if (dumpRiskScore >= 120) {
    tone = "risk";
    action = "减仓避险";
    actionSummary = "价格、盘口和筹码同时偏弱，7 天锁仓期内容易承受被动回撤。";
    positionMinPct = 0;
    positionMaxPct = Math.min(8, tierCap);
  } else if (entryScore >= 120 && cooldownRiskPct <= 45) {
    tone = "entry";
    action = "分批建仓";
    actionSummary = "量价、指标与筹码偏多共振，适合分两到三笔逐步建立仓位。";
    positionMinPct = 12;
    positionMaxPct = tierCap;
  } else if (entryScore >= 45 && scoreGap >= 18) {
    tone = "entry";
    action = "低位试仓";
    actionSummary = "信号开始转强，但还没到全力推进阶段，适合轻仓试错。";
    positionMinPct = 6;
    positionMaxPct = Math.min(18, tierCap);
  } else if (dumpRiskScore >= 45) {
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
  csfloat,
  bottomReversal,
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
  csfloat: CsfloatListingSummary;
  bottomReversal: BottomReversalSignal;
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
    {
      title: "全球在售样本",
      value:
        csfloat.listingCount > 0
          ? `${csfloat.listingCount} 挂单 / ${csfloat.uniqueSellerCount} 卖家`
          : "样本不足",
      detail:
        csfloat.listingCount > 0
          ? `公开在售样本中可见 ${csfloat.uniquePaintSeedCount} 个模板，Float 区间 ${
              csfloat.bestFloat != null ? csfloat.bestFloat.toFixed(4) : "--"
            } ~ ${csfloat.worstFloat != null ? csfloat.worstFloat.toFixed(4) : "--"}。`
          : csfloat.limitation,
      tone:
        csfloat.listingCount >= 10
          ? "positive"
          : csfloat.enabled
            ? "neutral"
            : "negative",
    },
    {
      title: "底部蓄势",
      value: bottomReversal.triggered ? `${bottomReversal.score} 分` : "未触发",
      detail: bottomReversal.detail,
      tone: bottomReversal.triggered ? "positive" : "neutral",
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
  bottomReversal,
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
  bottomReversal: BottomReversalSignal;
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

  if (cooldownRiskPct >= 65 || dumpRiskScore >= 120) {
    alerts.push({
      level: "warning",
      title: "锁仓期风险偏高",
      detail: `当前 7 天锁仓风险 ${cooldownRiskPct}% ，不适合重仓追高。`,
    });
  }

  if (teamSignal.buildScore >= 72 || entryScore >= 110) {
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

  if (bottomReversal.triggered) {
    alerts.push({
      level: "entry",
      title: "底部蓄势即将向上反转",
      detail: bottomReversal.detail,
    });
  }

  if (teamSignal.exitScore >= 72 || dumpRiskScore >= 110) {
    alerts.push({
      level: "risk",
      title: "团队撤退评分抬升",
      detail: `${teamSignal.summary} 撤退分 ${teamSignal.exitScore}/100，需优先检查卖压与价差。`,
    });
  }

  if (!alerts.length && entryScore < 45 && dumpRiskScore < 45) {
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

export function buildRecommendationCard(analysis: AnalysisResponse): RecommendationCard | null {
  const eligibility = evaluateAutonomousRecommendationEligibility(analysis);
  if (!eligibility.passed) {
    return null;
  }

  let recommendationType: RecommendationCard["recommendationType"] = "trend_follow";
  let score = analysis.scores.entryScore;
  let reason = analysis.strategy.actionSummary;
  const triggerTags: string[] = [];

  if (analysis.bottomReversal.triggered) {
    recommendationType = "bottom_reversal";
    score = Math.max(score, analysis.scores.entryScore + 14, analysis.bottomReversal.score * 1.6);
    reason = analysis.bottomReversal.detail;
    triggerTags.push("底部蓄势反转");
  } else if (analysis.earlyAccumulation.state === "early_build") {
    recommendationType = "early_build";
    score = Math.max(score, analysis.scores.entryScore + 12);
    reason = analysis.earlyAccumulation.detail;
    triggerTags.push("少数席位提前建仓");
  } else if (
    analysis.taxonomy.categoryKey === "sticker" &&
    analysis.scores.entryScore >= 45 &&
    analysis.scores.dumpRiskScore <= 20
  ) {
    recommendationType = "rotation";
    reason = "贴纸题材轮动和仓位集中度正在改善，适合纳入轮动推荐池。";
    triggerTags.push("贴纸题材轮动");
  } else if (analysis.scores.dumpRiskScore >= 110) {
    recommendationType = "risk_avoid";
    score = analysis.scores.dumpRiskScore;
    reason = "风险侧更强，建议优先放进规避清单而不是推荐清单。";
    triggerTags.push("高风险规避");
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
    marketHashName: analysis.item.marketHashName,
    image: analysis.item.image,
    taxonomy: analysis.taxonomy,
    recommendationType,
    score: Number(clamp(score, -200, 200).toFixed(1)),
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
      eligibility.summary,
      analysis.taxonomy.categoryLabel + " / " + analysis.taxonomy.segmentLabel,
      "建仓 " + analysis.scores.entryScore + "，风险 " + analysis.scores.dumpRiskScore,
      "7 天预期 " + formatSignedPercent(analysis.prediction.expected7dPct, 1),
      "团队建仓 " + analysis.marketContext.teamSignal.buildScore + " / 撤退 " + analysis.marketContext.teamSignal.exitScore,
      analysis.bottomReversal.triggered
        ? "底部蓄势 " + analysis.bottomReversal.overlapDays + " 天粘合 / " + analysis.bottomReversal.shrinkDays + " 天缩柱"
        : null,
      analysis.csfloat.listingCount > 0 ? "CSFloat 在售 " + analysis.csfloat.listingCount + " 条" : null,
    ]),
    triggerTags: uniq([
      ...triggerTags,
      analysis.earlyAccumulation.state === "watch" ? "提前建仓观察" : null,
    ]),
  };
}

export function buildRecommendationResponse(
  analyses: AnalysisResponse[],
  options?: {
    recommendationLimit?: number;
    featuredLimit?: number;
    scanner?: RecommendationResponse["scanner"];
  },
): RecommendationResponse {
  const cards = analyses
    .map((analysis) => buildRecommendationCard(analysis))
    .filter((card): card is RecommendationCard => card != null);
  const boardMap = new Map<
    string,
    {
      key: string;
      label: string;
      count: number;
      segments: Map<string, { key: string; label: string; count: number }>;
    }
  >();

  cards.forEach((card) => {
    const categoryKey = card.taxonomy.categoryKey;
    const segmentKey = card.taxonomy.segmentKey;
    const current =
      boardMap.get(categoryKey) ??
      {
        key: categoryKey,
        label: card.taxonomy.categoryLabel,
        count: 0,
        segments: new Map<string, { key: string; label: string; count: number }>(),
      };
    current.count += 1;
    const segment =
      current.segments.get(segmentKey) ??
      {
        key: segmentKey,
        label: card.taxonomy.segmentLabel,
        count: 0,
      };
    segment.count += 1;
    current.segments.set(segmentKey, segment);
    boardMap.set(categoryKey, current);
  });

  const recommendationLimit = Math.max(3, options?.recommendationLimit ?? 15);
  const featuredLimit = Math.max(1, options?.featuredLimit ?? 3);
  const positive = cards
    .filter(
      (card) =>
        card.recommendationType !== "risk_avoid" &&
        (card.entryScore >= 35 || card.recommendationType === "bottom_reversal"),
    )
    .sort(
      (left, right) =>
        right.entryScore - left.entryScore ||
        right.score - left.score ||
        left.dumpRiskScore - right.dumpRiskScore,
    )
    .slice(0, recommendationLimit);
  const watch = cards
    .filter(
      (card) =>
        card.recommendationType !== "risk_avoid" &&
        card.entryScore >= 0 &&
        card.entryScore < 35 &&
        card.dumpRiskScore < 90,
    )
    .sort(
      (left, right) =>
        right.entryScore - left.entryScore ||
        right.score - left.score ||
        left.dumpRiskScore - right.dumpRiskScore,
    )
    .slice(0, recommendationLimit);
  const risk = cards
    .filter((card) => card.recommendationType === "risk_avoid" || card.dumpRiskScore >= 90)
    .sort((left, right) => right.dumpRiskScore - left.dumpRiskScore || right.score - left.score)
    .slice(0, recommendationLimit);
  const featured = positive.slice(0, featuredLimit);

  return {
    updatedAt: new Date().toISOString(),
    universeCount: cards.length,
    featured,
    positive,
    watch,
    risk,
    scanner:
      options?.scanner ??
      {
        source: "watchlist",
        candidatePages: 0,
        candidatePageSize: 0,
        scannedCandidateCount: cards.length,
        deepAnalyzedCount: cards.length,
        recommendationLimit,
        featuredLimit,
        sortBy: "建仓推荐评分降序",
        hotWindowSize: 20,
        randomSampleSize: 10,
        windowRangeStart: 1,
        windowRangeEnd: 20,
        poolSize: cards.length,
        completedRoundsInCycle: 0,
        totalRoundsCompleted: 0,
        roundsRemaining: 15,
        maxRoundsPerCycle: 15,
        paused: false,
        autofilling: false,
        minimumTargetCount: 3,
        lastRoundAt: null,
        lastBatchCandidates: [],
        fallbackSource: null,
      },
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

function fillCloseFromSeries(
  timeline: ChartCandle[],
  platformSeries: ChartCandle[],
) {
  let lastValue: number | null = null;
  let platformIndex = 0;

  return timeline.map((candle) => {
    while (
      platformIndex < platformSeries.length &&
      platformSeries[platformIndex]!.t <= candle.t
    ) {
      lastValue = platformSeries[platformIndex]!.c;
      platformIndex += 1;
    }

    return lastValue;
  });
}

function upsertLatestQuoteCandle(
  candles: ChartCandle[],
  updatedAt: string | null,
  price: number | null,
  depth: number | null,
) {
  if (price == null || !Number.isFinite(price) || price <= 0) {
    return candles;
  }

  const next = candles.map((candle) => ({ ...candle }));
  const timestamp = updatedAt ? Date.parse(updatedAt) : Number.NaN;
  const hasTimestamp = Number.isFinite(timestamp) && timestamp > 0;
  const depthValue = depth != null && Number.isFinite(depth) ? Math.max(0, depth) : 0;

  if (next.length === 0) {
    if (!hasTimestamp) {
      return next;
    }

    return [
      {
        t: timestamp,
        o: price,
        c: price,
        h: price,
        l: price,
        v: depthValue,
      },
    ];
  }

  const last = next.at(-1)!;
  if (!hasTimestamp || timestamp <= last.t) {
    next[next.length - 1] = {
      ...last,
      c: price,
      h: Math.max(last.h, last.o, price),
      l: Math.min(last.l, last.o, price),
      v: depthValue || last.v,
    };
    return next;
  }

  next.push({
    t: timestamp,
    o: last.c,
    c: price,
    h: Math.max(last.c, price),
    l: Math.min(last.c, price),
    v: depthValue || last.v,
  });

  return next;
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
    source: "CSFloat Active Listings",
    marketHashName,
    listingCount: 0,
    uniqueSellerCount: 0,
    publicSellerCount: 0,
    uniquePaintSeedCount: 0,
    lowestPrice: null,
    highestPrice: null,
    bestFloat: null,
    worstFloat: null,
    limitation: "尚未接入 CSFloat 补充数据。",
    sellerClusters: [],
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
  detail.marketHashName =
    pickString(
      detailRaw,
      ["goods_info.market_hash_name", "market_hash_name", "goods_market_hash_name"],
      [["goods", "info", "market", "hash", "name"], ["goods", "market", "hash", "name"]],
    ) ?? detail.marketHashName;
  detail.name =
    pickString(detailRaw, ["goods_info.name", "goods_name", "name"], [["goods", "info", "name"]]) ??
    detail.marketHashName ??
    detail.name;
  detail.image =
    pickString(
      detailRaw,
      ["goods_info.img", "img", "icon", "image"],
      [["goods", "info", "img"], ["icon"], ["image"]],
    ) ?? detail.image;
  detail.rarity =
    pickString(
      detailRaw,
      [
        "goods_info.rarity_localized_name",
        "rarity_localized_name",
        "rare_name",
        "rarity",
        "quality_name",
      ],
      [["goods", "info", "rarity", "localized", "name"], ["rare"], ["quality"]],
    ) ?? detail.rarity;
  detail.weapon =
    pickString(
      detailRaw,
      ["goods_info.type_localized_name", "type_localized_name", "weapon_name", "category_name"],
      [["goods", "info", "type", "localized", "name"], ["weapon"], ["category"]],
    ) ?? detail.weapon;
  detail.exterior =
    pickString(
      detailRaw,
      ["goods_info.exterior_localized_name", "exterior_localized_name", "exterior_name", "wear_name"],
      [["goods", "info", "exterior", "localized", "name"], ["wear"], ["exterior"]],
    ) ?? detail.exterior;
  const platformInfo = await resolvePlatforms(
    client,
    goodId,
    detail,
    options.platformMap,
    options.persistPlatformMap,
  );

  const buffCandles = upsertLatestQuoteCandle(
    platformInfo.buffCandles,
    detail.updatedAt,
    detail.buffPrice,
    detail.buffSell,
  );
  const yyypCandles = upsertLatestQuoteCandle(
    platformInfo.yyypCandles,
    detail.updatedAt,
    detail.yyypPrice,
    detail.yyypSell,
  );
  const primary = buffCandles.length >= yyypCandles.length ? buffCandles : yyypCandles;
  const secondary = primary === buffCandles ? yyypCandles : buffCandles;
  const secondaryMap = new Map(secondary.map((row) => [row.t, row]));

  const buffClose = fillCloseFromSeries(primary, buffCandles);
  const yyypClose = fillCloseFromSeries(primary, yyypCandles);
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
  const latestBuff = detail.buffPrice ?? buffClose[latestIndex];
  const latestYyyp = detail.yyypPrice ?? yyypClose[latestIndex];
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
    holders = dedupeHolderRows(await fetchHoldersSafely(client, goodId));
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
  let bottomReversal: BottomReversalSignal;
  const csfloat =
    options.includeHolders && options.getCsfloatListingSummary
      ? await options.getCsfloatListingSummary(detail.marketHashName)
      : buildEmptyCsfloatSummary(detail.marketHashName);

  let entryScore = 34;
  let dumpRiskScore = 22;
  const entryDrivers: ScoreDriver[] = [];
  const dumpDrivers: ScoreDriver[] = [];
  const latestMacdHist = macd.hist.at(-1) ?? 0;
  const previousMacdHist = macd.hist.at(-2) ?? latestMacdHist;
  const macdMomentum = latestMacdHist - previousMacdHist;
  const latestJ = kdj.j.at(-1) ?? 50;

  if (macdSignal.signal === "buy") {
    entryScore += recordScoreDriver(
      entryDrivers,
      "MACD 动能",
      6 + clamp(Math.abs(latestMacdHist) * 0.8 + Math.max(0, macdMomentum) * 1.6, 0, 8),
      macdSignal.summary,
      "positive",
    );
  } else {
    dumpRiskScore += recordScoreDriver(
      dumpDrivers,
      "MACD 动能",
      6 + clamp(Math.abs(latestMacdHist) * 0.8 + Math.max(0, -macdMomentum) * 1.6, 0, 8),
      macdSignal.summary,
      "negative",
    );
  }

  if (kdjSignal.signal === "buy") {
    entryScore += recordScoreDriver(
      entryDrivers,
      "KDJ 位置",
      4 + clamp((50 - latestJ) * 0.14, 0, 6),
      `${kdjSignal.summary}，J 值 ${latestJ.toFixed(1)}`,
      "positive",
    );
  } else if (kdjSignal.signal === "sell") {
    dumpRiskScore += recordScoreDriver(
      dumpDrivers,
      "KDJ 位置",
      4 + clamp((latestJ - 50) * 0.14, 0, 6),
      `${kdjSignal.summary}，J 值 ${latestJ.toFixed(1)}`,
      "negative",
    );
  }

  if ((change7d ?? 0) > 0) {
    entryScore += recordScoreDriver(
      entryDrivers,
      "近 7 天趋势",
      clamp((change7d ?? 0) * 1.2, 0, 12),
      `近 7 天涨幅 ${(change7d ?? 0).toFixed(1)}%，近 30 天 ${formatSignedPercent(change30d, 1)}`,
      "positive",
    );
  } else if ((change7d ?? 0) < 0) {
    dumpRiskScore += recordScoreDriver(
      dumpDrivers,
      "近 7 天趋势",
      clamp(Math.abs(change7d ?? 0) * 1.45, 0, 16),
      `近 7 天跌幅 ${(change7d ?? 0).toFixed(1)}%，短线承压正在放大`,
      "negative",
    );
  }

  if (volumeSpike >= priceTier.buildVolumeThreshold) {
    if ((change1d ?? 0) >= 0) {
      entryScore += recordScoreDriver(
        entryDrivers,
        "量能放大",
        clamp((volumeSpike - 1) * 12, 2, 12),
        `放量 ${volumeSpike.toFixed(2)}x，且 1 日变动 ${formatSignedPercent(change1d, 1)}`,
        "positive",
      );
    } else {
      dumpRiskScore += recordScoreDriver(
        dumpDrivers,
        "量能放大",
        clamp((volumeSpike - 1) * 13, 2, 14),
        `放量 ${volumeSpike.toFixed(2)}x，但 1 日变动 ${formatSignedPercent(change1d, 1)}，疑似加速出货`,
        "negative",
      );
    }
  }

  if ((spreadPct ?? 0) <= 0) {
    entryScore += recordScoreDriver(
      entryDrivers,
      "平台价差",
      clamp(Math.abs(spreadPct ?? 0) * 1.8, 0, 7),
      "悠悠有品价格低于 BUFF，存在跨平台价差缓冲",
      "positive",
    );
  } else {
    dumpRiskScore += recordScoreDriver(
      dumpDrivers,
      "平台价差",
      clamp((spreadPct ?? 0) * 1.6, 0, 7),
      "BUFF 溢价扩张，跨平台价格正在分化",
      "negative",
    );
  }

  if (sellPressure < 1.15) {
    entryScore += recordScoreDriver(
      entryDrivers,
      "盘口承接",
      clamp((1.2 - sellPressure) * 10, 0, 6),
      `在售/求购比 ${sellPressure.toFixed(2)}，承接相对健康`,
      "positive",
    );
  } else if (sellPressure > 1.35) {
    dumpRiskScore += recordScoreDriver(
      dumpDrivers,
      "盘口卖压",
      clamp((sellPressure - 1.2) * 8, 0, 12),
      `在售/求购比 ${sellPressure.toFixed(2)}，卖压明显偏大`,
      "negative",
    );
  }

  if ((delta24h?.changePct ?? 0) > 0) {
    entryScore += recordScoreDriver(
      entryDrivers,
      "Top10 24h 变化",
      clamp((delta24h?.changePct ?? 0) * 0.9, 0, 11),
      `Top10 持仓 24h 增加 ${(delta24h?.changePct ?? 0).toFixed(1)}%`,
      "positive",
    );
  } else if ((delta24h?.changePct ?? 0) < 0) {
    dumpRiskScore += recordScoreDriver(
      dumpDrivers,
      "Top10 24h 变化",
      clamp(Math.abs(delta24h?.changePct ?? 0) * 1.05, 0, 12),
      `Top10 持仓 24h 减少 ${(delta24h?.changePct ?? 0).toFixed(1)}%`,
      "negative",
    );
  }

  if ((delta7d?.changePct ?? 0) > 0) {
    entryScore += recordScoreDriver(
      entryDrivers,
      "Top10 7d 趋势",
      clamp((delta7d?.changePct ?? 0) * 0.55, 0, 9),
      `Top10 持仓 7d 累积增加 ${(delta7d?.changePct ?? 0).toFixed(1)}%`,
      "positive",
    );
  } else if ((delta7d?.changePct ?? 0) < 0) {
    dumpRiskScore += recordScoreDriver(
      dumpDrivers,
      "Top10 7d 趋势",
      clamp(Math.abs(delta7d?.changePct ?? 0) * 0.65, 0, 10),
      `Top10 持仓 7d 累积下降 ${(delta7d?.changePct ?? 0).toFixed(1)}%`,
      "negative",
    );
  }

  if ((statisticChange14d ?? 0) < 0) {
    entryScore += recordScoreDriver(
      entryDrivers,
      "存世量变化",
      clamp(Math.abs(statisticChange14d ?? 0) * 1.9, 0, 6),
      `近 14 天存世量收缩 ${(statisticChange14d ?? 0).toFixed(2)}%，供给压力在下降`,
      "positive",
    );
  } else if ((statisticChange14d ?? 0) > 0) {
    dumpRiskScore += recordScoreDriver(
      dumpDrivers,
      "存世量变化",
      clamp((statisticChange14d ?? 0) * 1.35, 0, 8),
      `近 14 天存世量扩张 ${(statisticChange14d ?? 0).toFixed(2)}%，供给上升会压制弹性`,
      "negative",
    );
  }

  if ((top10SharePct ?? 0) >= 1) {
    entryScore += recordScoreDriver(
      entryDrivers,
      "筹码集中度",
      clamp((top10SharePct ?? 0) * 1.8, 0, 5),
      `Top10 占存世量 ${top10SharePct?.toFixed(2)}%，头部筹码集中度不低`,
      "positive",
    );
  }

  if (teamSignal.buildScore >= 55) {
    entryScore += recordScoreDriver(
      entryDrivers,
      "团队建仓",
      clamp((teamSignal.buildScore - 52) * 0.34, 0, 16),
      `团队建仓分 ${teamSignal.buildScore}/100：${teamSignal.summary}`,
      "positive",
    );
  }

  if (teamSignal.exitScore >= 55) {
    dumpRiskScore += recordScoreDriver(
      dumpDrivers,
      "团队撤退",
      clamp((teamSignal.exitScore - 52) * 0.36, 0, 16),
      `团队撤退分 ${teamSignal.exitScore}/100：${teamSignal.summary}`,
      "negative",
    );
  }

  if (csfloat.uniqueSellerCount > 0) {
    const liquidityContribution = clamp(csfloat.uniqueSellerCount * 0.35, 0, 4.5);
    dumpRiskScore += recordScoreDriver(
      dumpDrivers,
      "全球在售样本",
      liquidityContribution,
      `CSFloat 可见 ${csfloat.listingCount} 条挂单、${csfloat.uniqueSellerCount} 个卖家，全球流动性会增加短线兑现压力`,
      "neutral",
    );
  }

  bottomReversal = buildBottomReversalSignal({
    itemName: detail.name,
    taxonomy,
    currentStatistic,
    closes: blendClose,
    macd,
  });

  if (bottomReversal.triggered) {
    entryScore += recordScoreDriver(
      entryDrivers,
      "底部蓄势",
      clamp(bottomReversal.score * 0.18, 10, 18),
      bottomReversal.detail,
      "positive",
    );
    dumpRiskScore = Math.max(0, dumpRiskScore - 4);
  }

  entryDrivers.sort((left, right) => right.contribution - left.contribution);
  dumpDrivers.sort((left, right) => right.contribution - left.contribution);
  const entryReasons = entryDrivers.slice(0, 5).map((driver) => driver.detail);
  const dumpReasons = dumpDrivers.slice(0, 5).map((driver) => driver.detail);

  const rawEntryScore = normalizeContribution(clamp(entryScore, 0, 100));
  const rawDumpRiskScore = normalizeContribution(clamp(dumpRiskScore, 0, 100));
  entryScore = toDirectionalScore(rawEntryScore, rawDumpRiskScore);
  dumpRiskScore = toDirectionalScore(rawDumpRiskScore, rawEntryScore);

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
  const directionalGap = entryScore - dumpRiskScore;
  const bias = directionalGap / 18;
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
    clamp(52 + Math.abs(directionalGap) * 0.12 + volumeSpike * 4, 45, 92),
  );
  const cooldownRiskPct = Math.round(
    clamp(
      45 +
        dumpRiskScore * 0.28 -
        entryScore * 0.12 +
        volatility * 2 +
        (priceTier.cooldownWeight - 1) * 18,
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
    csfloat,
    bottomReversal,
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
    bottomReversal,
  });
  const statistic: StatisticSnapshot = {
    current: currentStatistic,
    change7d: statisticChange7d,
    change14d: statisticChange14d,
    change30d: statisticChange30d,
  };

  const updatedAt = detail.updatedAt ?? new Date().toISOString();
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
      marketHashName: detail.marketHashName,
      image: detail.image,
      rarity: detail.rarity,
      weapon: detail.weapon,
      exterior: detail.exterior,
    },
    market: {
      buffClose: latestBuff,
      yyypClose: latestYyyp,
      spreadPct,
      buffBuyPrice: detail.buffBuyPrice,
      yyypBuyPrice: detail.yyypBuyPrice,
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
        entryScore >= 120 ? "偏强建仓" : entryScore >= 45 ? "观察低吸" : "暂缓建仓",
      dumpLabel:
        dumpRiskScore >= 120 ? "高危跑路" : dumpRiskScore >= 45 ? "筹码松动" : "风险暂稳",
      entryReasons,
      dumpReasons,
      entryDrivers,
      dumpDrivers,
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
    bottomReversal,
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
