export interface WatchlistEntry {
  goodId: string;
  name?: string;
}

export interface PlatformMap {
  buff?: number;
  yyyp?: number;
  updatedAt?: string;
}

export interface AutoRefreshConfig {
  enabled: boolean;
  intervalMinutes: number;
  includeDeep: boolean;
  maxDeepItems: number;
}

export interface AlertPolicyConfig {
  enabled: boolean;
  entryPushThreshold: number;
  exitPushThreshold: number;
  llmPushThreshold: number;
  watchThreshold: number;
  cooldownBlockEntry: boolean;
}

export interface RuntimeConfig {
  apiToken?: string;
  csfloatApiKey?: string;
  watchlist: WatchlistEntry[];
  platformMap?: PlatformMap;
  autoRefresh?: AutoRefreshConfig;
  alertPolicy?: AlertPolicyConfig;
}

export interface MarketIndex {
  id: number;
  name: string;
  nameKey: string;
  marketIndex: number;
  chgNum: number;
  chgRate: number;
  open: number;
  close: number;
  high: number;
  low: number;
  updatedAt: string;
  img?: string;
}

export interface ChartCandle {
  t: number;
  o: number;
  c: number;
  h: number;
  l: number;
  v: number;
}

export interface HolderRow {
  id?: number;
  steamName: string;
  steamId?: string;
  avatar?: string;
  num: number;
}

export interface HolderLeaderSnapshot {
  steamId?: string;
  steamName: string;
  avatar?: string;
  num: number;
}

export interface Snapshot {
  at: string;
  goodId: string;
  buffClose: number | null;
  yyypClose: number | null;
  spreadPct: number | null;
  volume: number;
  top1: number | null;
  top10: number | null;
  buffSell: number | null;
  yyypSell: number | null;
  buffBuy: number | null;
  yyypBuy: number | null;
  leaders?: HolderLeaderSnapshot[];
}

export interface NormalizedDetail {
  goodId: string;
  name: string;
  marketHashName: string | null;
  image: string | null;
  rarity: string | null;
  weapon: string | null;
  exterior: string | null;
  statistic: number | null;
  buffPrice: number | null;
  yyypPrice: number | null;
  buffSell: number | null;
  yyypSell: number | null;
  buffBuy: number | null;
  yyypBuy: number | null;
  raw: Record<string, unknown>;
}

export interface TrendDelta {
  changePct: number | null;
  volumePct: number | null;
}

export interface AlertSignal {
  level: "silent" | "watch" | "push_entry" | "push_risk";
  shouldNotify: boolean;
  score: number;
  title: string;
  detail: string;
  sources: string[];
  matchedRules: string[];
  updatedAt: string;
}

export interface BoardTaxonomy {
  categoryKey: "gun" | "sticker" | "glove" | "agent" | "knife" | "other";
  categoryLabel: string;
  segmentKey: string;
  segmentLabel: string;
  spotlight: string;
}

export interface HolderBehaviorInsight {
  steamId?: string;
  steamName: string;
  avatar?: string;
  currentNum: number;
  sharePct: number | null;
  change24h: number | null;
  change7d: number | null;
  change24hAbs: number | null;
  change7dAbs: number | null;
  role: "builder" | "watch" | "exiting";
  note: string;
}

export interface EarlyAccumulationSignal {
  state: "none" | "watch" | "early_build" | "crowded_breakout";
  score: number;
  title: string;
  detail: string;
  detectedBuilders: number;
  totalTrackedSharePct: number | null;
  likelyMotives: string[];
}

export interface WatchlistSummary {
  goodId: string;
  name: string;
  image: string | null;
  buffClose: number | null;
  yyypClose: number | null;
  spreadPct: number | null;
  change7d: number | null;
  volumeSpike: number;
  entryScore: number;
  dumpRiskScore: number;
  signal: string;
  alertSignal: AlertSignal;
  taxonomy: BoardTaxonomy;
  updatedAt: string;
  snapshotsAvailable: number;
}

export interface StrategyPlan {
  tone: "entry" | "neutral" | "risk";
  action: string;
  actionSummary: string;
  positionMinPct: number;
  positionMaxPct: number;
  targetPrice: number | null;
  defensePrice: number | null;
  lockDays: number;
  cooldownSummary: string;
}

export interface PriceTierProfile {
  key: "low" | "mid" | "high";
  label: string;
  latestPrice: number | null;
  description: string;
  buildVolumeThreshold: number;
  dangerDropThresholdPct: number;
  spreadRiskThresholdPct: number;
  cooldownWeight: number;
}

export interface TeamSignal {
  buildScore: number;
  exitScore: number;
  status: "building" | "neutral" | "exiting";
  summary: string;
  buildReasons: string[];
  exitReasons: string[];
}

export interface ReasoningFactor {
  title: string;
  value: string;
  detail: string;
  tone: "positive" | "neutral" | "negative";
}

export interface ItemAlert {
  level: "entry" | "warning" | "risk";
  title: string;
  detail: string;
}

export interface StatisticSnapshot {
  current: number | null;
  change7d: number | null;
  change14d: number | null;
  change30d: number | null;
}

export interface LlmInsight {
  enabled: boolean;
  status: "ok" | "degraded" | "disabled";
  provider: string;
  model: string;
  generatedAt: string | null;
  summary: string;
  regime: "accumulation" | "distribution" | "breakout_watch" | "panic" | "neutral";
  confidence: number | null;
  buildSignalStrength: number | null;
  dumpSignalStrength: number | null;
  cooldownAssessment: "favorable" | "mixed" | "unfavorable" | "unknown";
  alertDecision: "push_alert" | "watch_closely" | "observe_only" | "unavailable";
  expected7dRange: {
    lowPct: number | null;
    basePct: number | null;
    highPct: number | null;
  };
  evidence: string[];
  counterSignals: string[];
  actionPlan: string[];
  nextCheckMinutes: number | null;
  shouldPushAlert: boolean;
  pushReason: string;
  error?: string;
}

export interface CsfloatListingSummary {
  enabled: boolean;
  source: string;
  marketHashName: string | null;
  listingCount: number;
  lowestPrice: number | null;
  highestPrice: number | null;
  bestFloat: number | null;
  limitation: string;
  samples: Array<{
    listingId: string;
    sellerName: string;
    sellerSteamId: string | null;
    price: number | null;
    floatValue: number | null;
    paintSeed: number | null;
  }>;
}

export interface RecommendationCard {
  goodId: string;
  name: string;
  image: string | null;
  taxonomy: BoardTaxonomy;
  recommendationType: "early_build" | "trend_follow" | "rotation" | "risk_avoid";
  score: number;
  reason: string;
  expected7dPct: number;
  entryScore: number;
  dumpRiskScore: number;
  teamBuildScore: number;
  teamExitScore: number;
  alertLevel: AlertSignal["level"];
  likelyMotives: string[];
  topHolders: HolderBehaviorInsight[];
  dataPoints: string[];
}

export interface RecommendationResponse {
  updatedAt: string;
  universeCount: number;
  positive: RecommendationCard[];
  watch: RecommendationCard[];
  risk: RecommendationCard[];
  boards: Array<{
    key: string;
    label: string;
    count: number;
    segments: Array<{
      key: string;
      label: string;
      count: number;
    }>;
  }>;
}

export interface AnalysisResponse {
  item: {
    goodId: string;
    name: string;
    image: string | null;
    rarity: string | null;
    weapon: string | null;
    exterior: string | null;
  };
  market: {
    buffClose: number | null;
    yyypClose: number | null;
    spreadPct: number | null;
    buffSell: number | null;
    yyypSell: number | null;
    buffBuy: number | null;
    yyypBuy: number | null;
    updatedAt: string;
    t7SellableAt: string;
  };
  charts: {
    timestamps: number[];
    labels: string[];
    buffClose: Array<number | null>;
    yyypClose: Array<number | null>;
    blendClose: number[];
    blendVolume: number[];
    ma7: Array<number | null>;
    ma20: Array<number | null>;
  };
  indicators: {
    macd: {
      dif: number[];
      dea: number[];
      hist: number[];
      signal: string;
      summary: string;
    };
    kdj: {
      k: number[];
      d: number[];
      j: number[];
      signal: string;
      summary: string;
    };
  };
  prediction: {
    direction: string;
    confidence: number;
    expected7dPct: number;
    lowBand: number | null;
    baseBand: number | null;
    highBand: number | null;
    cooldownRiskPct: number;
  };
  scores: {
    entryScore: number;
    dumpRiskScore: number;
    entryLabel: string;
    dumpLabel: string;
    entryReasons: string[];
      dumpReasons: string[];
  };
  strategy: StrategyPlan;
  marketContext: {
    priceTier: PriceTierProfile;
    teamSignal: TeamSignal;
  };
  reasoning: ReasoningFactor[];
  alerts: ItemAlert[];
  statistic: StatisticSnapshot;
  llm: LlmInsight;
  pushSignal: AlertSignal;
  taxonomy: BoardTaxonomy;
  holderInsights: HolderBehaviorInsight[];
  earlyAccumulation: EarlyAccumulationSignal;
  csfloat: CsfloatListingSummary;
  holders: {
    rows: HolderRow[];
    top5: number | null;
    top1: number | null;
    top10: number | null;
    top5SharePct: number | null;
    top10SharePct: number | null;
    delta24h: TrendDelta | null;
    delta7d: TrendDelta | null;
  };
  history: {
    snapshotsAvailable: number;
    lastSnapshotAt: string | null;
  };
  summary: WatchlistSummary;
}

export interface HistoryPlaybackPoint {
  at: string;
  buffClose: number | null;
  yyypClose: number | null;
  spreadPct: number | null;
  volume: number;
  top1: number | null;
  top10: number | null;
  buffSell: number | null;
  yyypSell: number | null;
  buffBuy: number | null;
  yyypBuy: number | null;
  sellPressure: number | null;
  leaders?: HolderLeaderSnapshot[];
}

export interface HistoryPlaybackResponse {
  goodId: string;
  snapshotsAvailable: number;
  latestAt: string | null;
  points: HistoryPlaybackPoint[];
}

export interface RefreshRuntimeStatus {
  enabled: boolean;
  intervalMinutes: number;
  includeDeep: boolean;
  maxDeepItems: number;
  running: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRunMs: number | null;
  lastRunSummaryCount: number;
  lastRunDeepCount: number;
  lastRunTriggeredBy: "startup" | "scheduled" | "manual" | null;
  lastError: string | null;
}
