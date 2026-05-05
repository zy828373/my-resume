import {
  candidateMatchesScannerScopes,
  normalizeItemText,
  tagProfileMatchesScanner,
} from "./item-taxonomy.js";
import type {
  AnalysisResponse,
  AutonomousPool,
  AutonomousPoolDecision,
  AutonomousRuleEvidence,
  PreFilterDiagnostics,
  RecommendationScopeKey,
  ScannerConfig,
  SupplyGrade,
} from "./types.js";

export interface AutonomousCandidateInput {
  id: string;
  name: string;
  marketHashName?: string | null;
  sourceLabel?: string | null;
  scopeHint?: RecommendationScopeKey | null;
}

export interface CandidatePreFilterDecision {
  accepted: boolean;
  reason: string | null;
  riskTag: string | null;
}

export interface CandidatePreFilterResult<T extends AutonomousCandidateInput> {
  accepted: T[];
  rejected: Array<{ candidate: T; decision: CandidatePreFilterDecision }>;
  diagnostics: PreFilterDiagnostics;
}

const POOLS: AutonomousPool[] = [
  "candidate_core",
  "candidate_low_weight",
  "watchlist",
  "risk_only",
  "excluded",
];

const ACTIVE_DROP_CASE_TOKENS = [
  "recoil case",
  "revolution case",
  "dreams & nightmares case",
  "dreams and nightmares case",
  "kilowatt case",
  "gallery case",
  "fever case",
  "fracture case",
  "反冲武器箱",
  "变革武器箱",
  "梦魇武器箱",
  "千瓦武器箱",
  "画廊武器箱",
  "狂热武器箱",
  "裂空武器箱",
];

const RARE_OR_DISCONTINUED_CASE_TOKENS = [
  "rare drop",
  "discontinued",
  "operation",
  "bravo",
  "cobblestone",
  "gods and monsters",
  "rising sun",
  "chop shop",
  "norse",
  "canals",
  "st. marc",
  "control collection",
  "havoc collection",
  "ancient collection",
  "train collection",
  "mirage collection",
  "dust 2 collection",
  "vertigo collection",
  "稀有掉落",
  "绝版",
  "大行动",
  "古堡",
  "旭日",
  "挪威",
  "运河",
];

function emptyDistribution(): Record<AutonomousPool, number> {
  return {
    candidate_core: 0,
    candidate_low_weight: 0,
    watchlist: 0,
    risk_only: 0,
    excluded: 0,
  };
}

export function createEmptyPreFilterDiagnostics(): PreFilterDiagnostics {
  return {
    rawCandidateCount: 0,
    acceptedCandidateCount: 0,
    rejectedCandidateCount: 0,
    sampledCandidateCount: 0,
    candidateShortage: false,
    shortageReason: null,
    sampledFromFiltered: true,
    rejectReasonCounts: {},
    poolDistribution: emptyDistribution(),
  };
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatCount(value: number | null) {
  return value == null ? "unknown" : Math.round(value).toLocaleString("zh-CN");
}

function formatPercentValue(value: number | null) {
  return value == null ? "unknown" : `${Number(value.toFixed(1))}%`;
}

function hasAny(text: string, tokens: string[]) {
  return tokens.some((token) => text.includes(token.toLowerCase()));
}

function getCandidateText(candidate: AutonomousCandidateInput) {
  return normalizeItemText(
    [
      candidate.name,
      candidate.marketHashName,
      candidate.sourceLabel,
      candidate.scopeHint,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

function isActiveDropCaseText(text: string) {
  return hasAny(text, ACTIVE_DROP_CASE_TOKENS);
}

function isRareOrDiscontinuedCaseText(text: string) {
  return hasAny(text, RARE_OR_DISCONTINUED_CASE_TOKENS);
}

export function evaluateAutonomousCandidatePrefilter(
  candidate: AutonomousCandidateInput,
  scanner?: Pick<ScannerConfig, "analysisScopes" | "holoStickerSeries"> | null,
): CandidatePreFilterDecision {
  const text = getCandidateText(candidate);
  if (!text) return { accepted: false, reason: "EMPTY_CANDIDATE_NAME", riskTag: "DATA_INSUFFICIENT" };
  if (hasAny(text, ["stattrak", "stat trak"])) {
    return { accepted: false, reason: "STATTRAK_EXCLUDED", riskTag: "STATTRAK_EXCLUDED" };
  }
  if (hasAny(text, ["souvenir", "纪念品"])) {
    return { accepted: false, reason: "SOUVENIR_EXCLUDED", riskTag: "SOUVENIR_EXCLUDED" };
  }
  if (hasAny(text, ["music kit", "音乐盒", "音乐集"])) {
    return { accepted: false, reason: "MUSIC_KIT_EXCLUDED", riskTag: "MUSIC_KIT_EXCLUDED" };
  }
  const isCapsuleCandidate = hasAny(text, ["capsule", "胶囊"]);
  if (!isCapsuleCandidate && hasAny(text, ["sticker", "印花"])) {
    if (!hasAny(text, ["holo", "全息"])) {
      return { accepted: false, reason: "NON_TARGET_STICKER", riskTag: "NON_TARGET_STICKER" };
    }
    if (hasAny(text, ["autograph", "signature", "签名"])) {
      return { accepted: false, reason: "NON_TARGET_STICKER", riskTag: "NON_TARGET_STICKER" };
    }
  }
  if (hasAny(text, ["case", "武器箱"]) && isActiveDropCaseText(text)) {
    return { accepted: false, reason: "ACTIVE_DROP_CASE_EXCLUDED", riskTag: "ACTIVE_DROP_CASE_EXCLUDED" };
  }

  const scopes = scanner?.analysisScopes ?? [];
  const scopeText = getCandidateText(candidate);
  if (candidate.scopeHint && scopes.includes(candidate.scopeHint)) {
    if (candidate.scopeHint === "holo_team_sticker" && !candidateMatchesScannerScopes(scopeText, scanner)) {
      return { accepted: false, reason: "SCOPE_NOT_SELECTED", riskTag: "SCOPE_NOT_SELECTED" };
    }
    return { accepted: true, reason: null, riskTag: null };
  }
  if (candidateMatchesScannerScopes(scopeText, scanner)) {
    return { accepted: true, reason: null, riskTag: null };
  }
  return { accepted: false, reason: "SCOPE_NOT_SELECTED", riskTag: "SCOPE_NOT_SELECTED" };
}

export function prefilterScannerCandidates<T extends AutonomousCandidateInput>(
  candidates: T[],
  scanner: Pick<ScannerConfig, "analysisScopes" | "holoStickerSeries" | "randomSampleSize">,
): CandidatePreFilterResult<T> {
  const accepted: T[] = [];
  const rejected: Array<{ candidate: T; decision: CandidatePreFilterDecision }> = [];
  const rejectReasonCounts: Record<string, number> = {};

  for (const candidate of candidates) {
    const decision = evaluateAutonomousCandidatePrefilter(candidate, scanner);
    if (decision.accepted) {
      accepted.push(candidate);
    } else {
      rejected.push({ candidate, decision });
      const reason = decision.reason ?? "UNKNOWN_REJECT";
      rejectReasonCounts[reason] = (rejectReasonCounts[reason] ?? 0) + 1;
    }
  }

  const minimumSample = Math.max(1, scanner.randomSampleSize);
  const candidateShortage = candidates.length > 0 && accepted.length < minimumSample;
  return {
    accepted,
    rejected,
    diagnostics: {
      rawCandidateCount: candidates.length,
      acceptedCandidateCount: accepted.length,
      rejectedCandidateCount: rejected.length,
      sampledCandidateCount: 0,
      candidateShortage,
      shortageReason: candidateShortage
        ? `预筛后仅剩 ${accepted.length} 个候选，未回退低质量候选。`
        : null,
      sampledFromFiltered: true,
      rejectReasonCounts,
      poolDistribution: emptyDistribution(),
    },
  };
}

function getKnownCount(parts: Array<number | null | undefined>) {
  const known = parts.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return known.length ? known.reduce((sum, value) => sum + value, 0) : null;
}

function getListingCount(analysis: AnalysisResponse) {
  const marketListings = getKnownCount([analysis.market.buffSell, analysis.market.yyypSell]);
  if (marketListings != null) {
    return { value: marketListings, source: "direct" as const };
  }
  if (analysis.csfloat.enabled && analysis.csfloat.listingCount > 0) {
    return { value: analysis.csfloat.listingCount, source: "sample_only" as const };
  }
  return { value: null, source: "unsupported" as const };
}

function latestPositive(values: Array<number | null | undefined>) {
  const rows = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  return rows.length ? rows : null;
}

function getSpreadAndSupport(analysis: AnalysisResponse) {
  const sells = latestPositive([analysis.market.buffClose, analysis.market.yyypClose]);
  const buys = latestPositive([analysis.market.buffBuyPrice, analysis.market.yyypBuyPrice]);
  if (sells && buys) {
    const lowestListing = Math.min(...sells);
    const highestBuy = Math.max(...buys);
    if (lowestListing > 0 && highestBuy > 0) {
      return {
        spreadPct: ((lowestListing - highestBuy) / lowestListing) * 100,
        buySupport: highestBuy / lowestListing,
      };
    }
  }
  return {
    spreadPct: finiteNumber(analysis.market.spreadPct),
    buySupport: null,
  };
}

function getRecentVolume(analysis: AnalysisResponse) {
  const rows = analysis.charts.blendVolume.filter((value) => Number.isFinite(value) && value > 0);
  const volume7d = rows.slice(-7).reduce((sum, value) => sum + value, 0);
  const volume30d = rows.slice(-30).reduce((sum, value) => sum + value, 0);
  return { volume7d, volume30d };
}

function getPriceDeviation30d(analysis: AnalysisResponse) {
  const prices = analysis.charts.blendClose.filter((value) => Number.isFinite(value) && value > 0);
  const latest = prices.at(-1);
  const base = prices.slice(-30);
  if (latest == null || !base.length) return null;
  const average = base.reduce((sum, value) => sum + value, 0) / base.length;
  return average > 0 ? ((latest / average) - 1) * 100 : null;
}

function resolveSupplyGrade(population: number | null, listings: number | null): SupplyGrade {
  if (population == null || listings == null) return "NA";
  if (population > 70_000 && listings > 1_500) return "D";
  if (population >= 3_000 && population <= 30_000 && listings >= 60 && listings <= 600) return "S";
  if (
    (population >= 3_000 && population <= 30_000 && (listings < 60 || (listings > 600 && listings <= 1_500))) ||
    (population > 30_000 && population <= 70_000 && listings >= 60 && listings <= 600)
  ) {
    return "A";
  }
  if (
    (population < 3_000 && listings < 60) ||
    (population > 30_000 && population <= 70_000 && listings > 600 && listings <= 1_500)
  ) {
    return "B";
  }
  if ((population > 70_000 && listings <= 1_500) || (population <= 70_000 && listings > 1_500)) {
    return "C";
  }
  return "NA";
}

function poolFromScore(score: number): AutonomousPool {
  if (score >= 80) return "candidate_core";
  if (score >= 60) return "candidate_low_weight";
  if (score >= 40) return "watchlist";
  if (score >= 20) return "risk_only";
  return "excluded";
}

function makeDecision(params: {
  pool: AutonomousPool;
  score: number;
  category: string;
  supplyGrade?: SupplyGrade;
  optimalGunSupply?: boolean | null;
  firstSupplyExclude?: boolean;
  summary: string;
  keepReasons?: string[];
  downgradeReasons?: string[];
  excludeReasons?: string[];
  riskTags?: string[];
  evidence?: AutonomousRuleEvidence[];
}): AutonomousPoolDecision {
  const pool = params.pool;
  return {
    pool,
    admissionScore: Math.round(clamp(params.score, 0, 100)),
    category: params.category,
    supplyGrade: params.supplyGrade ?? "NA",
    optimalGunSupply: params.optimalGunSupply ?? null,
    firstSupplyExclude: params.firstSupplyExclude ?? false,
    canEnterEntryScore: pool === "candidate_core" || pool === "candidate_low_weight",
    canEnterAlertScore: pool !== "excluded",
    summary: params.summary,
    keepReasons: [...new Set(params.keepReasons ?? [])].slice(0, 6),
    downgradeReasons: [...new Set(params.downgradeReasons ?? [])].slice(0, 6),
    excludeReasons: [...new Set(params.excludeReasons ?? [])].slice(0, 6),
    riskTags: [...new Set(params.riskTags ?? [])].slice(0, 10),
    evidence: params.evidence ?? [],
  };
}

function hardExclude(
  category: string,
  reason: string,
  riskTag: string,
  evidence: AutonomousRuleEvidence[],
  supplyGrade: SupplyGrade = "NA",
  firstSupplyExclude = false,
) {
  return makeDecision({
    pool: "excluded",
    score: 0,
    category,
    supplyGrade,
    firstSupplyExclude,
    summary: reason,
    excludeReasons: [reason],
    riskTags: [riskTag],
    evidence,
  });
}

function resolveCategory(analysis: AnalysisResponse) {
  const profile = analysis.tagProfile;
  if (profile.itemTypeKey === "sticker") return "sticker";
  if (profile.itemTypeKey === "agent") return "agent";
  if (profile.itemTypeKey === "weapon_case") return "weapon_case";
  if (profile.itemTypeKey === "capsule" || profile.originKey === "capsule") return "capsule";
  if (profile.itemTypeKey === "knife" || profile.itemTypeKey === "glove") return "knife_glove";
  const rarityText = `${profile.rarityKey ?? ""} ${profile.rarityLabel ?? ""}`.toLowerCase();
  if (profile.itemTypeKey === "gun" && hasAny(rarityText, ["covert", "隐秘", "绝密"])) {
    return "covert_tradeup";
  }
  if (profile.itemTypeKey === "gun") return "gun_skin";
  if (["collectible", "patch", "charm"].includes(profile.itemTypeKey)) return "collectible";
  return "other";
}

function categoryUsesPopulation(category: string) {
  return !["sticker", "agent", "weapon_case"].includes(category);
}

export function evaluateAutonomousPoolDecision(
  analysis: AnalysisResponse,
  scanner?: Pick<ScannerConfig, "analysisScopes" | "holoStickerSeries"> | null,
): AutonomousPoolDecision {
  const profile = analysis.tagProfile;
  const category = resolveCategory(analysis);
  const nameText = normalizeItemText(
    [
      analysis.item.name,
      analysis.item.marketHashName,
      profile.originLabel,
      profile.sourceSeriesLabel,
      profile.stickerSeriesLabel,
    ]
      .filter(Boolean)
      .join(" "),
  );
  const population = finiteNumber(analysis.statistic.current);
  const listings = getListingCount(analysis);
  const { spreadPct, buySupport } = getSpreadAndSupport(analysis);
  const { volume7d, volume30d } = getRecentVolume(analysis);
  const priceDeviation30d = getPriceDeviation30d(analysis);
  const listingCountForSupplyGrade = listings.source === "direct" ? listings.value : null;
  const supplyGrade = category === "gun_skin" || category === "covert_tradeup"
    ? resolveSupplyGrade(population, listingCountForSupplyGrade)
    : "NA";
  const optimalGunSupply = supplyGrade === "S" ? true : category === "gun_skin" || category === "covert_tradeup" ? false : null;
  const evidence: AutonomousRuleEvidence[] = [
    {
      key: "category",
      label: "识别品类",
      value: category,
      source: "direct",
      supported: true,
    },
    {
      key: "population",
      label: "存世量",
      value: formatCount(population),
      source: population == null ? "unsupported" : "direct",
      supported: population != null,
    },
    {
      key: "listings",
      label: "在售数量",
      value: formatCount(listings.value),
      source: listings.source,
      supported: listings.value != null,
    },
    {
      key: "spread",
      label: "买卖价差",
      value: formatPercentValue(spreadPct),
      source: spreadPct == null ? "unsupported" : "direct",
      supported: spreadPct != null,
    },
    {
      key: "buy_support",
      label: "求购承接",
      value: buySupport == null ? "unknown" : buySupport.toFixed(2),
      source: buySupport == null ? "unsupported" : "direct",
      supported: buySupport != null,
    },
    {
      key: "volume30d",
      label: "30 日成交活动",
      value: formatCount(volume30d),
      source: volume30d > 0 ? "direct" : "unsupported",
      supported: volume30d > 0,
    },
  ];

  if (profile.isStatTrak || hasAny(nameText, ["stattrak", "stat trak"])) {
    return hardExclude(category, "StatTrak 标的不进入自主推荐池。", "STATTRAK_EXCLUDED", evidence);
  }
  if (profile.isSouvenir || hasAny(nameText, ["souvenir", "纪念品"])) {
    return hardExclude(category, "Souvenir 标的不进入自主推荐池。", "SOUVENIR_EXCLUDED", evidence);
  }
  if (profile.itemTypeKey === "music_kit" || profile.originKey === "music_kit") {
    return hardExclude(category, "音乐盒不进入自主推荐池。", "MUSIC_KIT_EXCLUDED", evidence);
  }
  if (!tagProfileMatchesScanner(profile, scanner)) {
    return hardExclude(category, "当前标的未命中自主推荐池已启用的分析范围。", "SCOPE_NOT_SELECTED", evidence);
  }
  if (category === "sticker") {
    if (profile.stickerFinishKey !== "holo" || !profile.isTeamSticker || profile.isPlayerSignature) {
      return hardExclude(category, "仅保留目标全息战队贴纸，非全息、签名或非战队贴纸剔除。", "NON_TARGET_STICKER", evidence);
    }
  }
  if (category === "weapon_case" && isActiveDropCaseText(nameText)) {
    return hardExclude(category, "活跃/常规掉落武器箱不进入自主推荐池。", "ACTIVE_DROP_CASE_EXCLUDED", evidence);
  }
  if (
    (category === "gun_skin" || category === "covert_tradeup") &&
    profile.originKey === "case" &&
    isActiveDropCaseText(nameText)
  ) {
    return hardExclude(category, "来自活跃/常规掉落箱的枪皮不进入自主推荐池。", "ACTIVE_DROP_CASE_SKIN_EXCLUDED", evidence);
  }

  const riskTags: string[] = [];
  const keepReasons: string[] = [];
  const downgradeReasons: string[] = [];
  const excludeReasons: string[] = [];
  const populationApplies = categoryUsesPopulation(category);
  const firstSupplyExclude =
    populationApplies &&
    population != null &&
    listings.source === "direct" &&
    listings.value != null &&
    population > 70_000 &&
    listings.value > 1_500;
  if (firstSupplyExclude) {
    return hardExclude(
      category,
      "存世量超过 70000 且在售超过 1500，触发第一轮高供应剔除。",
      "HIGH_SUPPLY",
      evidence,
      supplyGrade,
      true,
    );
  }

  if (populationApplies && population == null) {
    riskTags.push("DATA_INSUFFICIENT");
    downgradeReasons.push("缺少存世量，不能进入核心池。");
  }
  if (listings.value == null) {
    riskTags.push("DATA_INSUFFICIENT");
    downgradeReasons.push("缺少在售数量，按数据不足降级。");
  } else if (listings.source === "sample_only") {
    riskTags.push("SAMPLE_ONLY_LISTINGS");
    downgradeReasons.push("在售数量仅来自 CSFloat 样本，不用于高供应硬剔除。");
  }
  if (volume30d <= 0) {
    riskTags.push("LOW_LIQUIDITY");
    downgradeReasons.push("30 日成交活动不足。");
  }
  if (spreadPct != null && spreadPct > 20) {
    riskTags.push("WIDE_SPREAD");
    downgradeReasons.push("买卖价差超过 20%。");
  }
  if (buySupport != null && buySupport < 0.85) {
    riskTags.push("WEAK_BUY_SUPPORT");
    downgradeReasons.push("求购承接低于 0.85。");
  }
  if ((analysis.summary.change7d ?? 0) > 80) {
    riskTags.push("PRICE_CHASE");
    downgradeReasons.push("7 日涨幅过高，避免追高。");
  }
  if ((analysis.summary.change7d ?? 0) > 30 && volume7d <= 0) {
    riskTags.push("LISTING_ONLY_PUMP");
    downgradeReasons.push("价格上行但成交活动没有同步确认。");
  }
  if (category === "covert_tradeup") {
    riskTags.push("UNSUPPORTED_SIGNAL");
    downgradeReasons.push("当前没有完整炼金 EV 和输出池数据，先按红皮候选降级。");
  }
  if (category === "weapon_case" && !profile.isRareDropSource && !profile.isDiscontinuedCandidate && !isRareOrDiscontinuedCaseText(nameText)) {
    riskTags.push("UNSUPPORTED_SIGNAL");
    downgradeReasons.push("缺少权威稀有/停产箱确认，不能进入核心池。");
  }

  let liquidityScore = 0;
  if (listings.value != null) {
    liquidityScore += listings.value > 0 && listings.value <= 1_500 ? 7 : 3;
    if (supplyGrade === "S") liquidityScore += 7;
    else if (supplyGrade === "A") liquidityScore += 5;
    else if (supplyGrade === "B") liquidityScore += 3;
  }
  if (volume30d > 0) liquidityScore += volume30d >= 10 ? 7 : 4;
  if (spreadPct != null) liquidityScore += spreadPct <= 8 ? 6 : spreadPct <= 12 ? 4 : spreadPct <= 20 ? 2 : 0;
  if (buySupport != null) liquidityScore += buySupport >= 0.9 ? 5 : buySupport >= 0.85 ? 3 : 0;
  liquidityScore = clamp(liquidityScore, 0, 25);

  let authenticityScore = 0;
  if (volume30d > 0) authenticityScore += 10;
  if (volume7d > 0) authenticityScore += 4;
  if (analysis.history.snapshotsAvailable >= 3) authenticityScore += 4;
  if (!riskTags.includes("LISTING_ONLY_PUMP")) authenticityScore += 2;
  authenticityScore = clamp(authenticityScore, 0, 20);

  let priceScore = 0;
  const change7d = finiteNumber(analysis.summary.change7d);
  if (change7d == null || Math.abs(change7d) <= 30) priceScore += 6;
  if (priceDeviation30d == null || Math.abs(priceDeviation30d) <= 20) priceScore += 7;
  if (spreadPct == null || spreadPct <= 12) priceScore += 4;
  if (!riskTags.includes("PRICE_CHASE")) priceScore += 3;
  priceScore = clamp(priceScore, 0, 20);

  let categoryScore = clamp(Math.round(profile.hypeFitScore * 0.16), 0, 16);
  if (category === "gun_skin" && optimalGunSupply) categoryScore += 4;
  if (category === "sticker" && profile.stickerFinishKey === "holo" && profile.isTeamSticker) categoryScore += 4;
  if (category === "agent" && profile.isOperationSource) categoryScore += 3;
  if (category === "weapon_case" && (profile.isRareDropSource || profile.isDiscontinuedCandidate || isRareOrDiscontinuedCaseText(nameText))) categoryScore += 4;
  categoryScore = clamp(categoryScore, 0, 20);

  let riskScore = 15;
  riskScore -= riskTags.includes("DATA_INSUFFICIENT") ? 5 : 0;
  riskScore -= riskTags.includes("LOW_LIQUIDITY") ? 4 : 0;
  riskScore -= riskTags.includes("WIDE_SPREAD") ? 4 : 0;
  riskScore -= riskTags.includes("WEAK_BUY_SUPPORT") ? 3 : 0;
  riskScore -= riskTags.includes("PRICE_CHASE") ? 4 : 0;
  riskScore -= riskTags.includes("UNSUPPORTED_SIGNAL") ? 3 : 0;
  riskScore = clamp(riskScore, 0, 15);

  if (supplyGrade === "S") keepReasons.push("枪皮供给命中 S 档最优区间。");
  if (supplyGrade === "A") keepReasons.push("枪皮供给处于 A 档，可低权重观察。");
  if (category === "sticker") keepReasons.push("命中目标全息战队贴纸。");
  if (category === "agent") keepReasons.push("探员不套用存世量过滤，按流动性和承接判断。");
  if (category === "weapon_case" && (profile.isRareDropSource || profile.isDiscontinuedCandidate || isRareOrDiscontinuedCaseText(nameText))) {
    keepReasons.push("武器箱具备稀有/停产候选特征。");
  }
  if (volume30d > 0) keepReasons.push("近 30 日有成交活动。");
  if (spreadPct != null && spreadPct <= 12) keepReasons.push("买卖价差处于可接受区间。");
  if (buySupport != null && buySupport >= 0.85) keepReasons.push("求购承接达到 0.85 以上。");

  let admissionScore = liquidityScore + authenticityScore + priceScore + categoryScore + riskScore;
  if (supplyGrade === "S") admissionScore += 5;
  if (supplyGrade === "C") admissionScore = Math.min(admissionScore, 45);
  if (category === "agent") admissionScore = Math.min(admissionScore, 78);
  if (riskTags.includes("DATA_INSUFFICIENT")) admissionScore = Math.min(admissionScore, 55);
  if (riskTags.includes("UNSUPPORTED_SIGNAL")) admissionScore = Math.min(admissionScore, 59);
  if (riskTags.includes("LOW_LIQUIDITY") && riskTags.includes("WIDE_SPREAD")) admissionScore = Math.min(admissionScore, 35);
  admissionScore = clamp(admissionScore, 0, 100);

  const pool = poolFromScore(admissionScore);
  if (pool === "excluded") {
    excludeReasons.push(...downgradeReasons);
  }

  return makeDecision({
    pool,
    score: admissionScore,
    category,
    supplyGrade,
    optimalGunSupply,
    firstSupplyExclude,
    summary:
      pool === "candidate_core"
        ? "通过前置筛选，进入核心候选池。"
        : pool === "candidate_low_weight"
          ? "通过前置筛选，但按低权重进入候选池。"
          : pool === "watchlist"
            ? "暂不进入核心候选，放入观察池。"
            : pool === "risk_only"
              ? "仅保留风险观察，不进入建仓推荐。"
              : "前置筛选剔除。",
    keepReasons,
    downgradeReasons,
    excludeReasons,
    riskTags,
    evidence,
  });
}

export function attachAutonomousPoolDecision(
  analysis: AnalysisResponse,
  scanner?: Pick<ScannerConfig, "analysisScopes" | "holoStickerSeries"> | null,
): AnalysisResponse {
  return {
    ...analysis,
    autonomousPool: evaluateAutonomousPoolDecision(analysis, scanner),
  };
}

export function isAutonomousPoolVisible(decision: AutonomousPoolDecision) {
  return decision.pool !== "excluded";
}

export function summarizeAutonomousPoolDistribution(
  analyses: AnalysisResponse[],
  scanner?: Pick<ScannerConfig, "analysisScopes" | "holoStickerSeries"> | null,
) {
  const distribution = emptyDistribution();
  for (const analysis of analyses) {
    const pool = analysis.autonomousPool?.pool ?? evaluateAutonomousPoolDecision(analysis, scanner).pool;
    distribution[pool] += 1;
  }
  return distribution;
}

export function mergePreFilterPoolDistribution(
  diagnostics: PreFilterDiagnostics | null | undefined,
  distribution: Record<AutonomousPool, number>,
): PreFilterDiagnostics {
  return {
    ...(diagnostics ?? createEmptyPreFilterDiagnostics()),
    poolDistribution: {
      ...emptyDistribution(),
      ...distribution,
    },
  };
}
