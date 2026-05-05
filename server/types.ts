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

export type RecommendationScopeKey =
  | "agent"
  | "holo_team_sticker"
  | "gun_skin"
  | "discontinued_collection_skin";

export type StickerSeriesKey =
  | "stockholm_2021"
  | "antwerp_2022"
  | "rio_2022"
  | "paris_2023"
  | "copenhagen_2024"
  | "shanghai_2024"
  | "other";

export interface ScannerConfig {
  enabled: boolean;
  candidatePages: number;
  candidatePageSize: number;
  deepAnalyzeLimit: number;
  recommendationLimit: number;
  featuredLimit: number;
  hotWindowSize: number;
  randomSampleSize: number;
  maxRoundsPerCycle: number;
  analysisScopes: RecommendationScopeKey[];
  holoStickerSeries: StickerSeriesKey[];
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
  scanner?: ScannerConfig;
  portfolio?: PortfolioHolding[];
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

export interface MarketIndexCandle {
  t: number;
  o: number;
  c: number;
  h: number;
  l: number;
  v: number;
}

export interface MarketIndexDetail {
  now: number | null;
  amplitude: number | null;
  rate: number | null;
  maxValue: number | null;
  minValue: number | null;
  consecutiveDays: number | null;
}

export interface MarketIndexAnalysis {
  id: number;
  name: string;
  nameKey: string;
  marketIndex: number;
  chgRate: number;
  updatedAt: string;
  bottomState: "none" | "watch" | "forming";
  trendState: "down" | "neutral" | "up";
  tone: "positive" | "warning" | "negative" | "neutral";
  bottomScore: number;
  trendScore: number;
  summary: string;
  bottomDetail: string;
  trendDetail: string;
  volume: {
    available: boolean;
    ratio: number | null;
    recentAverage: number | null;
    baselineAverage: number | null;
    summary: string;
  };
  metrics: {
    change7d: number | null;
    change30d: number | null;
    lowDistance30d: number | null;
    lowDistance60d: number | null;
    highDistance30d: number | null;
    ma7: number | null;
    ma20: number | null;
    consecutiveUpDays: number;
    amplitude: number | null;
  };
}

export interface MarketAnalysisResponse {
  updatedAt: string;
  source: "csqaq";
  overall: MarketIndexAnalysis | null;
  boards: MarketIndexAnalysis[];
  warnings: string[];
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
  updatedAt: string | null;
  buffPrice: number | null;
  yyypPrice: number | null;
  buffBuyPrice: number | null;
  yyypBuyPrice: number | null;
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

export interface ItemTagProfile {
  itemTypeKey:
    | "knife"
    | "glove"
    | "gun"
    | "weapon_case"
    | "music_kit"
    | "sticker"
    | "tool"
    | "collectible"
    | "patch"
    | "charm"
    | "agent"
    | "other";
  itemTypeLabel: string;
  weaponClassKey: "rifle" | "pistol" | "smg" | "shotgun" | "machinegun" | null;
  qualityKey: string | null;
  qualityLabel: string | null;
  rarityKey: string | null;
  rarityLabel: string | null;
  stickerRarityKey: string | null;
  agentRarityKey: string | null;
  specialKey: "normal" | "souvenir" | "stattrak" | "star" | "star_stattrak" | null;
  wearKey:
    | "factory_new"
    | "minimal_wear"
    | "field_tested"
    | "well_worn"
    | "battle_scarred"
    | "not_painted"
    | null;
  stickerFinishKey: "paper" | "glitter" | "holo" | "gold" | null;
  originKey:
    | "armory"
    | "collection"
    | "case"
    | "souvenir_package"
    | "capsule"
    | "music_kit"
    | "patch_pack"
    | "operation_collection"
    | "operation_agent"
    | null;
  originLabel: string | null;
  sourceSeriesKey: string | null;
  sourceSeriesLabel: string | null;
  stickerSeriesKey: StickerSeriesKey | null;
  stickerSeriesLabel: string | null;
  isTeamSticker: boolean;
  isPlayerSignature: boolean;
  isStatTrak: boolean;
  isSouvenir: boolean;
  isDiscontinuedCandidate: boolean;
  isRareDropSource: boolean;
  isOperationSource: boolean;
  supplyBandKey: "under_2k" | "2k_40k" | "over_40k" | "unknown";
  hypeFitScore: number;
  hypeTags: string[];
  recommendationScopes: RecommendationScopeKey[];
}

export interface HolderBehaviorInsight {
  taskId?: number;
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

export interface ScoreDriver {
  title: string;
  contribution: number;
  detail: string;
  tone: "positive" | "neutral" | "negative";
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

export interface BottomReversalSignal {
  triggered: boolean;
  score: number;
  title: string;
  detail: string;
  overlapDays: number;
  shrinkDays: number;
  recentLowDays: number;
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
  uniqueSellerCount: number;
  publicSellerCount: number;
  uniquePaintSeedCount: number;
  lowestPrice: number | null;
  highestPrice: number | null;
  bestFloat: number | null;
  worstFloat: number | null;
  limitation: string;
  sellerClusters: Array<{
    sellerName: string;
    sellerSteamId: string | null;
    listingCount: number;
    lowestPrice: number | null;
    bestFloat: number | null;
    paintSeedCount: number;
  }>;
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
  marketHashName: string | null;
  image: string | null;
  taxonomy: BoardTaxonomy;
  tagProfile: Pick<
    ItemTagProfile,
    | "itemTypeKey"
    | "itemTypeLabel"
    | "weaponClassKey"
    | "rarityLabel"
    | "specialKey"
    | "wearKey"
    | "stickerFinishKey"
    | "originLabel"
    | "sourceSeriesLabel"
    | "stickerSeriesLabel"
    | "supplyBandKey"
    | "recommendationScopes"
  >;
  hypeFitScore: number;
  hypeTags: string[];
  recommendationType:
    | "early_build"
    | "bottom_reversal"
    | "trend_follow"
    | "rotation"
    | "risk_avoid";
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
  triggerTags: string[];
}

export interface RecommendationResponse {
  updatedAt: string;
  universeCount: number;
  featured: RecommendationCard[];
  positive: RecommendationCard[];
  watch: RecommendationCard[];
  risk: RecommendationCard[];
  scanner: {
    source: string;
    candidatePages: number;
    candidatePageSize: number;
    scannedCandidateCount: number;
    deepAnalyzedCount: number;
    recommendationLimit: number;
    featuredLimit: number;
    sortBy: string;
    hotWindowSize: number;
    randomSampleSize: number;
    analysisScopes: RecommendationScopeKey[];
    holoStickerSeries: StickerSeriesKey[];
    windowRangeStart: number;
    windowRangeEnd: number;
    poolSize: number;
    completedRoundsInCycle: number;
    totalRoundsCompleted: number;
    roundsRemaining: number;
    maxRoundsPerCycle: number;
    paused: boolean;
    autofilling: boolean;
    minimumTargetCount: number;
    lastRoundAt: string | null;
    lastBatchCandidates: string[];
    fallbackSource: string | null;
    resetNotice?: string | null;
  };
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
    marketHashName: string | null;
    image: string | null;
    rarity: string | null;
    weapon: string | null;
    exterior: string | null;
  };
  market: {
    buffClose: number | null;
    yyypClose: number | null;
    spreadPct: number | null;
    buffBuyPrice: number | null;
    yyypBuyPrice: number | null;
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
    entryDrivers: ScoreDriver[];
    dumpDrivers: ScoreDriver[];
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
  tagProfile: ItemTagProfile;
  holderInsights: HolderBehaviorInsight[];
  earlyAccumulation: EarlyAccumulationSignal;
  bottomReversal: BottomReversalSignal;
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

export interface MonitorTaskProfile {
  taskId: number;
  steamName: string;
  steamId: string | null;
  avatar: string | null;
  inventoryCount: number | null;
  visibleAssetCount: number | null;
  activeDays: number | null;
  state: number | null;
  updatedAt: string | null;
  tradedAt: string | null;
  inventoryState: number | null;
  isUser: boolean;
  isSubscribe: boolean;
}

export interface MonitorInventoryItem {
  categoryName: string;
  price: number | null;
  marketName: string;
  tradable: boolean;
  count: number;
  tradableCount: number;
  cooldownCount: number;
  createdAt: string | null;
  iconUrl: string | null;
  goodId: string | null;
}

export interface MonitorBusinessItem {
  goodId: string | null;
  marketName: string;
  count: number;
  iconUrl: string | null;
  tradable: boolean;
  type: number | null;
  createdAt: string | null;
}

export interface MonitorSnapshotPoint {
  snapshotId: number;
  createdAt: string | null;
}

export interface HolderDrilldownResponse {
  goodId: string;
  holder: {
    taskId: number;
    steamName: string;
    steamId: string | null;
    avatar: string | null;
    currentNum: number | null;
    role: HolderBehaviorInsight["role"];
    note: string;
    sharePct: number | null;
    change24hAbs: number | null;
    change7dAbs: number | null;
  };
  profile: MonitorTaskProfile;
  inventory: {
    pageIndex: number;
    pageSize: number;
    hasMore: boolean;
    items: MonitorInventoryItem[];
  };
  focusActivities: MonitorBusinessItem[];
  latestActivities: MonitorBusinessItem[];
  snapshots: MonitorSnapshotPoint[];
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

export interface PortfolioHolding {
  id: string;
  goodId: string;
  name: string;
  averageCost: number;
  quantity: number;
  buyDate: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PortfolioAdvice {
  holdingId: string;
  goodId: string;
  name: string;
  quantity: number;
  averageCost: number;
  currentPrice: number | null;
  costDeviationPct: number | null;
  unrealizedPnL: number | null;
  addScore: number;
  sellScore: number;
  holdScore: number;
  action: "add" | "hold" | "reduce" | "exit";
  summary: string;
  reasons: string[];
  riskNotes: string[];
  analysis: AnalysisResponse;
}
