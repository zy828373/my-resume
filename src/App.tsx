import { useDeferredValue, useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import type {
  AnalysisResponse,
  ConfigResponse,
  HolderDrilldownResponse,
  HistoryPlaybackResponse,
  MarketIndex,
  PortfolioAdvice,
  PortfolioHolding,
  RecommendationResponse,
  RefreshRuntimeStatus,
  ScannerConfig,
  SearchSuggestion,
  WatchlistSummary,
} from "./types";

type ApiResponse<T> = {
  ok: boolean;
  data?: T;
  error?: string;
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const json = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !json.ok) {
    throw new Error(json.error || "\u8bf7\u6c42\u5931\u8d25");
  }

  return json.data as T;
}

function normalizeRecommendationCard(card: RecommendationResponse["featured"][number]) {
  return {
    ...card,
    likelyMotives: Array.isArray(card.likelyMotives) ? card.likelyMotives.filter(Boolean) : [],
    topHolders: Array.isArray(card.topHolders) ? card.topHolders : [],
    dataPoints: Array.isArray(card.dataPoints) ? card.dataPoints.filter(Boolean) : [],
    triggerTags: Array.isArray(card.triggerTags) ? card.triggerTags.filter(Boolean) : [],
  };
}

function normalizeRecommendationResponse(response: RecommendationResponse): RecommendationResponse {
  const scanner = response.scanner;
  const normalizeCards = (cards: RecommendationResponse["featured"] | undefined) =>
    Array.isArray(cards) ? cards.map(normalizeRecommendationCard) : [];

  return {
    ...response,
    featured: normalizeCards(response.featured),
    positive: normalizeCards(response.positive),
    watch: normalizeCards(response.watch),
    risk: normalizeCards(response.risk),
    scanner: {
      source: scanner?.source ?? "scanner",
      candidatePages: scanner?.candidatePages ?? 0,
      candidatePageSize: scanner?.candidatePageSize ?? 0,
      scannedCandidateCount: scanner?.scannedCandidateCount ?? 0,
      deepAnalyzedCount: scanner?.deepAnalyzedCount ?? 0,
      recommendationLimit: scanner?.recommendationLimit ?? 15,
      featuredLimit: scanner?.featuredLimit ?? 3,
      sortBy: scanner?.sortBy ?? "建仓推荐评分降序",
      hotWindowSize: scanner?.hotWindowSize ?? 20,
      randomSampleSize: scanner?.randomSampleSize ?? 10,
      windowRangeStart: scanner?.windowRangeStart ?? 1,
      windowRangeEnd: scanner?.windowRangeEnd ?? 20,
      poolSize: scanner?.poolSize ?? 0,
      completedRoundsInCycle: scanner?.completedRoundsInCycle ?? 0,
      totalRoundsCompleted: scanner?.totalRoundsCompleted ?? 0,
      roundsRemaining: scanner?.roundsRemaining ?? 0,
      maxRoundsPerCycle: scanner?.maxRoundsPerCycle ?? 15,
      paused: Boolean(scanner?.paused),
      autofilling: Boolean(scanner?.autofilling),
      minimumTargetCount: scanner?.minimumTargetCount ?? 3,
      lastRoundAt: scanner?.lastRoundAt ?? null,
      lastBatchCandidates: Array.isArray(scanner?.lastBatchCandidates)
        ? scanner.lastBatchCandidates.filter(Boolean)
        : [],
      fallbackSource: scanner?.fallbackSource ?? null,
    },
    boards: Array.isArray(response.boards)
      ? response.boards.map((board) => ({
          ...board,
          segments: Array.isArray(board.segments) ? board.segments : [],
        }))
      : [],
  };
}

function shouldShowMarketHashAlias(name: string, marketHashName?: string | null) {
  return Boolean(marketHashName?.trim() && marketHashName.trim() !== name.trim());
}

function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function formatMoney(value: number | null) {
  if (value == null) {
    return "--";
  }

  return `\u00a5${value.toLocaleString("zh-CN", {
    minimumFractionDigits: value >= 100 ? 0 : 2,
    maximumFractionDigits: value >= 100 ? 0 : 2,
  })}`;
}

function formatPercent(value: number | null, digits = 2) {
  if (value == null || Number.isNaN(value)) {
    return "--";
  }

  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

function formatNumber(value: number | null) {
  if (value == null) {
    return "--";
  }

  return value.toLocaleString("zh-CN");
}

function formatSignedCount(value: number | null | undefined) {
  if (value == null) {
    return "--";
  }

  return `${value > 0 ? "+" : ""}${value}`;
}

function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "--";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function badgeTone(score: number) {
  if (score >= 75) {
    return "high";
  }

  if (score >= 58) {
    return "mid";
  }

  return "low";
}

function strategyToneClass(tone: AnalysisResponse["strategy"]["tone"]) {
  if (tone === "entry") {
    return "positive";
  }

  if (tone === "risk") {
    return "negative";
  }

  return "neutral";
}

function alertLevelClass(level: AnalysisResponse["alerts"][number]["level"]) {
  if (level === "entry") {
    return "entry";
  }

  if (level === "risk") {
    return "dump";
  }

  return "warning";
}

function portfolioActionLabel(action: PortfolioAdvice["action"]) {
  if (action === "add") {
    return "\u7ee7\u7eed\u52a0\u4ed3";
  }

  if (action === "reduce") {
    return "\u51cf\u4ed3\u89c2\u5bdf";
  }

  if (action === "exit") {
    return "\u4f18\u5148\u5356\u51fa";
  }

  return "\u7ee7\u7eed\u6301\u6709";
}

function portfolioActionTone(action: PortfolioAdvice["action"]) {
  if (action === "add") {
    return "positive";
  }

  if (action === "reduce" || action === "exit") {
    return "negative";
  }

  return "neutral";
}

function teamStatusClass(status: AnalysisResponse["marketContext"]["teamSignal"]["status"]) {
  if (status === "building") {
    return "positive";
  }

  if (status === "exiting") {
    return "negative";
  }

  return "neutral";
}

function llmDecisionLabel(decision: AnalysisResponse["llm"]["alertDecision"]) {
  if (decision === "push_alert") {
    return "\u63a8\u9001\u9884\u8b66";
  }

  if (decision === "watch_closely") {
    return "\u91cd\u70b9\u76ef\u76d8";
  }

  if (decision === "observe_only") {
    return "\u4fdd\u6301\u89c2\u5bdf";
  }

  return "AI \u6682\u4e0d\u53ef\u7528";
}

function llmRegimeLabel(regime: AnalysisResponse["llm"]["regime"]) {
  if (regime === "accumulation") {
    return "\u504f\u5efa\u4ed3";
  }

  if (regime === "distribution") {
    return "\u504f\u6d3e\u53d1";
  }

  if (regime === "breakout_watch") {
    return "\u7a81\u7834\u89c2\u5bdf";
  }

  if (regime === "panic") {
    return "\u6050\u614c\u9636\u6bb5";
  }

  return "\u4e2d\u6027\u9707\u8361";
}

function needsLlmBackfill(analysis: AnalysisResponse | null) {
  return Boolean(
    analysis &&
      analysis.llm.status === "degraded" &&
      analysis.llm.generatedAt == null &&
      !analysis.llm.error,
  );
}

function pushSignalTone(level: WatchlistSummary["alertSignal"]["level"]) {
  if (level === "push_entry") {
    return "positive";
  }

  if (level === "push_risk") {
    return "negative";
  }

  if (level === "watch") {
    return "warning";
  }

  return "neutral";
}

function pushSignalLabel(level: WatchlistSummary["alertSignal"]["level"]) {
  if (level === "push_entry") {
    return "AI \u5efa\u4ed3\u63a8\u9001";
  }

  if (level === "push_risk") {
    return "AI \u98ce\u9669\u63a8\u9001";
  }

  if (level === "watch") {
    return "\u91cd\u70b9\u89c2\u5bdf";
  }

  return "\u6682\u65e0\u4fe1\u53f7";
}

function refreshStatusLabel(status: RefreshRuntimeStatus | null) {
  if (!status) {
    return "\u81ea\u52a8\u5237\u65b0\u672a\u521d\u59cb\u5316";
  }

  if (!status.enabled) {
    return "\u81ea\u52a8\u5237\u65b0\u5df2\u5173\u95ed";
  }

  if (status.running) {
    return `\u81ea\u52a8\u5237\u65b0\u8fdb\u884c\u4e2d ${status.lastRunSummaryCount}/${status.lastRunDeepCount}`;
  }

  if (status.lastError) {
    return `\u81ea\u52a8\u5237\u65b0\u5f02\u5e38: ${status.lastError}`;
  }

  return `\u81ea\u52a8\u5237\u65b0 ${status.intervalMinutes}m \u4e00\u6b21\uff0c\u4e0b\u6b21 ${formatDateTime(status.nextRunAt)}`;
}

function recommendationTypeLabel(type: RecommendationResponse["positive"][number]["recommendationType"]) {
  if (type === "early_build") {
    return "提前建仓";
  }

  if (type === "bottom_reversal") {
    return "底部反转";
  }

  if (type === "rotation") {
    return "题材轮动";
  }

  if (type === "risk_avoid") {
    return "风险回避";
  }

  return "趋势跟随";
}

function createScannerForm(scanner?: ScannerConfig | null) {
  return {
    enabled: scanner?.enabled ?? true,
    deepAnalyzeLimit: String(scanner?.deepAnalyzeLimit ?? 15),
    recommendationLimit: String(scanner?.recommendationLimit ?? 15),
    featuredLimit: String(scanner?.featuredLimit ?? 3),
    hotWindowSize: String(scanner?.hotWindowSize ?? 20),
    randomSampleSize: String(scanner?.randomSampleSize ?? 10),
    maxRoundsPerCycle: String(scanner?.maxRoundsPerCycle ?? 15),
  };
}

function holderRoleTone(role: AnalysisResponse["holderInsights"][number]["role"]) {
  if (role === "builder") {
    return "positive";
  }

  if (role === "exiting") {
    return "negative";
  }

  return "neutral";
}

function matchesBoardFilter(
  item: { taxonomy: WatchlistSummary["taxonomy"] },
  boardKey: string,
  segmentKey: string,
) {
  if (boardKey !== "all" && item.taxonomy.categoryKey !== boardKey) {
    return false;
  }

  if (segmentKey !== "all" && item.taxonomy.segmentKey !== segmentKey) {
    return false;
  }

  return true;
}

function buildHistoryOption(historyPlayback: HistoryPlaybackResponse): EChartsOption {
  const labels = historyPlayback.points.map((point) => formatDateTime(point.at));

  return {
    animationDuration: 280,
    tooltip: { trigger: "axis" },
    legend: {
      top: 0,
      right: 8,
      textStyle: { color: "#98a9bf", fontSize: 11 },
      data: ["BUFF", "\u60a0\u60a0\u6709\u54c1", "\u5356\u538b"],
    },
    grid: { left: 42, right: 48, top: 28, bottom: 24 },
    xAxis: {
      type: "category",
      data: labels,
      axisLine: { lineStyle: { color: "#283447" } },
      axisLabel: { color: "#7f91a8", fontSize: 10 },
    },
    yAxis: [
      {
        type: "value",
        scale: true,
        splitLine: { lineStyle: { color: "rgba(97, 122, 143, 0.14)" } },
        axisLabel: {
          color: "#7f91a8",
          formatter: (value: number) => `\u00a5${Math.round(value)}`,
        },
      },
      {
        type: "value",
        min: 0,
        splitLine: { show: false },
        axisLabel: {
          color: "#7f91a8",
          formatter: (value: number) => `${value.toFixed(1)}x`,
        },
      },
    ],
    series: [
      {
        name: "BUFF",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: historyPlayback.points.map((point) => point.buffClose),
        lineStyle: { color: "#2f7df6", width: 2 },
      },
      {
        name: "\u60a0\u60a0\u6709\u54c1",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: historyPlayback.points.map((point) => point.yyypClose),
        lineStyle: { color: "#38c7b4", width: 2 },
      },
      {
        name: "\u5356\u538b",
        type: "line",
        yAxisIndex: 1,
        showSymbol: false,
        smooth: true,
        data: historyPlayback.points.map((point) => point.sellPressure),
        lineStyle: { color: "#ffb549", width: 1.8, type: "dashed" },
        areaStyle: { color: "rgba(255, 181, 73, 0.12)" },
      },
    ],
  };
}

function EChartPanel({
  option,
  height,
}: {
  option: EChartsOption;
  height: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(ref.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) {
      return;
    }

    chartRef.current.setOption(option, {
      notMerge: true,
      lazyUpdate: true,
    });
  }, [option]);

  return <div ref={ref} style={{ width: "100%", height }} />;
}

function buildPriceOption(analysis: AnalysisResponse): EChartsOption {
  return {
    animationDuration: 350,
    textStyle: {
      fontFamily:
        '"HarmonyOS Sans SC","PingFang SC","Microsoft YaHei","Segoe UI",sans-serif',
    },
    tooltip: {
      trigger: "axis",
      backgroundColor: "rgba(14, 20, 31, 0.96)",
      borderColor: "rgba(120, 150, 170, 0.24)",
      textStyle: { color: "#eef4ff" },
    },
    legend: {
      top: 2,
      right: 8,
      textStyle: { color: "#98a9bf", fontSize: 11 },
      data: ["BUFF", "悠悠有品", "MA7", "MA20", "成交量"],
    },
    grid: [
      { left: 50, right: 16, top: 32, height: "60%" },
      { left: 50, right: 16, top: "78%", height: "15%" },
    ],
    xAxis: [
      {
        type: "category",
        data: analysis.charts.labels,
        boundaryGap: false,
        axisLine: { lineStyle: { color: "#283447" } },
        axisLabel: { color: "#7f91a8", fontSize: 10 },
      },
      {
        type: "category",
        gridIndex: 1,
        data: analysis.charts.labels,
        axisLabel: { show: false },
        axisTick: { show: false },
        axisLine: { show: false },
      },
    ],
    yAxis: [
      {
        type: "value",
        scale: true,
        splitLine: { lineStyle: { color: "rgba(97, 122, 143, 0.14)" } },
        axisLabel: {
          color: "#7f91a8",
          formatter: (value: number) => `¥${Math.round(value)}`,
        },
      },
      {
        type: "value",
        gridIndex: 1,
        splitLine: { show: false },
        axisLabel: { color: "#7f91a8", fontSize: 10 },
      },
    ],
    series: [
      {
        name: "BUFF",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: analysis.charts.buffClose,
        lineStyle: { color: "#2f7df6", width: 2.5 },
      },
      {
        name: "悠悠有品",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: analysis.charts.yyypClose,
        lineStyle: { color: "#38c7b4", width: 2 },
      },
      {
        name: "MA7",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: analysis.charts.ma7,
        lineStyle: { color: "#ffb549", width: 1.5 },
      },
      {
        name: "MA20",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: analysis.charts.ma20,
        lineStyle: { color: "#ff7a5c", width: 1.5 },
      },
      {
        name: "成交量",
        type: "bar",
        xAxisIndex: 1,
        yAxisIndex: 1,
        data: analysis.charts.blendVolume.map((value, index) => ({
          value,
          itemStyle: {
            color:
              index > 0 &&
              analysis.charts.blendClose[index] < analysis.charts.blendClose[index - 1]
                ? "rgba(255, 98, 98, 0.52)"
                : "rgba(56, 199, 180, 0.42)",
          },
        })),
      },
    ],
  };
}

function buildMacdOption(analysis: AnalysisResponse): EChartsOption {
  return {
    animationDuration: 280,
    tooltip: { trigger: "axis" },
    grid: { left: 34, right: 12, top: 22, bottom: 20 },
    xAxis: {
      type: "category",
      data: analysis.charts.labels,
      axisLabel: { show: false },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#283447" } },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "rgba(97, 122, 143, 0.14)" } },
      axisLabel: { color: "#7f91a8", fontSize: 10 },
    },
    series: [
      {
        name: "MACD",
        type: "bar",
        data: analysis.indicators.macd.hist.map((value) => ({
          value,
          itemStyle: {
            color: value >= 0 ? "rgba(255, 122, 92, 0.7)" : "rgba(56, 199, 180, 0.7)",
          },
        })),
      },
      {
        name: "DIF",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: analysis.indicators.macd.dif,
        lineStyle: { color: "#2f7df6", width: 1.8 },
      },
      {
        name: "DEA",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: analysis.indicators.macd.dea,
        lineStyle: { color: "#ffb549", width: 1.8 },
      },
    ],
  };
}

function buildKdjOption(analysis: AnalysisResponse): EChartsOption {
  return {
    animationDuration: 280,
    tooltip: { trigger: "axis" },
    grid: { left: 34, right: 12, top: 22, bottom: 20 },
    xAxis: {
      type: "category",
      data: analysis.charts.labels,
      axisLabel: { show: false },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "#283447" } },
    },
    yAxis: {
      type: "value",
      min: 0,
      max: 100,
      splitLine: { lineStyle: { color: "rgba(97, 122, 143, 0.14)" } },
      axisLabel: { color: "#7f91a8", fontSize: 10 },
    },
    series: [
      {
        name: "K",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: analysis.indicators.kdj.k,
        lineStyle: { color: "#2f7df6", width: 1.8 },
      },
      {
        name: "D",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: analysis.indicators.kdj.d,
        lineStyle: { color: "#ffb549", width: 1.8 },
      },
      {
        name: "J",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: analysis.indicators.kdj.j,
        lineStyle: { color: "#ff6258", width: 1.8 },
      },
    ],
  };
}

function buildHolderOption(analysis: AnalysisResponse): EChartsOption {
  return {
    animationDuration: 300,
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    grid: { left: 46, right: 14, top: 20, bottom: 48 },
    xAxis: {
      type: "category",
      data: analysis.holders.rows.map((row) => row.steamName),
      axisLabel: {
        color: "#7f91a8",
        fontSize: 10,
        rotate: 24,
      },
      axisLine: { lineStyle: { color: "#283447" } },
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#7f91a8", fontSize: 10 },
      splitLine: { lineStyle: { color: "rgba(97, 122, 143, 0.14)" } },
    },
    series: [
      {
        type: "bar",
        data: analysis.holders.rows.map((row) => row.num),
        itemStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: "#ffb549" },
              { offset: 1, color: "rgba(255, 122, 92, 0.38)" },
            ],
          },
          borderRadius: [6, 6, 0, 0],
        },
      },
    ],
  };
}

function App() {
  const [activePage, setActivePage] = useState<
    "market" | "watchlist" | "holders" | "recommendations" | "portfolio"
  >("watchlist");
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [market, setMarket] = useState<MarketIndex[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistSummary[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [historyPlayback, setHistoryPlayback] = useState<HistoryPlaybackResponse | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationResponse | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioHolding[]>([]);
  const [portfolioAdvice, setPortfolioAdvice] = useState<PortfolioAdvice[]>([]);
  const [refreshStatus, setRefreshStatus] = useState<RefreshRuntimeStatus | null>(null);
  const [holderDetail, setHolderDetail] = useState<HolderDrilldownResponse | null>(null);
  const [holderDetailLoading, setHolderDetailLoading] = useState(false);
  const [holderDetailError, setHolderDetailError] = useState<string | null>(null);
  const [boardKey, setBoardKey] = useState("all");
  const [segmentKey, setSegmentKey] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isSwitchPending, startSwitchTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [analysisSyncing, setAnalysisSyncing] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [portfolioLoading, setPortfolioLoading] = useState(false);
  const [portfolioAdviceLoading, setPortfolioAdviceLoading] = useState(false);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [csfloatKeyInput, setCsfloatKeyInput] = useState("");
  const [scannerForm, setScannerForm] = useState(() => createScannerForm());
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [portfolioForm, setPortfolioForm] = useState({
    goodId: "",
    name: "",
    averageCost: "",
    quantity: "",
    note: "",
  });
  const deferredQuery = useDeferredValue(searchText.trim());
  const llmPollAttemptsRef = useRef<Record<string, number>>({});
  const selectedIdRef = useRef<string | null>(null);
  const analysisCacheRef = useRef<Record<string, AnalysisResponse>>({});
  const historyCacheRef = useRef<Record<string, HistoryPlaybackResponse>>({});
  const analysisAbortRef = useRef<AbortController | null>(null);
  const historyAbortRef = useRef<AbortController | null>(null);
  const holderPageSizeRef = useRef(24);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  function cacheAnalysis(next: AnalysisResponse) {
    analysisCacheRef.current[next.item.goodId] = next;
  }

  function cacheHistory(next: HistoryPlaybackResponse) {
    historyCacheRef.current[next.goodId] = next;
  }

  function handleSelectItem(goodId: string) {
    if (goodId === selectedIdRef.current) {
      return;
    }

    const cachedAnalysis = analysisCacheRef.current[goodId];
    if (cachedAnalysis) {
      setAnalysis(cachedAnalysis);
    }

    const cachedHistory = historyCacheRef.current[goodId];
    if (cachedHistory) {
      setHistoryPlayback(cachedHistory);
    }

    startSwitchTransition(() => {
      setSelectedId(goodId);
    });
  }

  async function loadHolderDetail(
    target: {
      goodId: string;
      taskId: number;
      steamId?: string | null;
    },
    page = 1,
  ) {
    setHolderDetailLoading(true);
    setHolderDetailError(null);

    try {
      const query = new URLSearchParams({
        page: String(page),
        pageSize: String(holderPageSizeRef.current),
      });

      if (target.steamId) {
        query.set("steamId", target.steamId);
      }

      const next = await requestJson<HolderDrilldownResponse>(
        `/api/items/${target.goodId}/holders/${target.taskId}?${query.toString()}`,
      );
      setHolderDetail(next);
    } catch (caughtError) {
      setHolderDetailError(
        caughtError instanceof Error ? caughtError.message : "席位详情获取失败",
      );
    } finally {
      setHolderDetailLoading(false);
    }
  }

  function openHolderDetail(
    holder: AnalysisResponse["holderInsights"][number],
    goodId = analysis?.item.goodId,
  ) {
    if (!goodId || !holder.taskId) {
      return;
    }

    void loadHolderDetail({
      goodId,
      taskId: holder.taskId,
      steamId: holder.steamId ?? null,
    });
  }

  function closeHolderDetail() {
    setHolderDetail(null);
    setHolderDetailError(null);
    setHolderDetailLoading(false);
  }

  async function refreshConfig() {
    const next = await requestJson<ConfigResponse>("/api/config");
    setConfig(next);
    setScannerForm(createScannerForm(next.scanner));

    if (!selectedId && next.watchlist.length > 0) {
      handleSelectItem(next.watchlist[0].goodId);
    }
  }

  async function refreshMarket() {
    const rows = await requestJson<MarketIndex[]>("/api/market/overview");
    setMarket(rows);
  }

  async function refreshRuntimeStatus() {
    const next = await requestJson<RefreshRuntimeStatus>("/api/refresh/status");
    setRefreshStatus(next);
  }

  async function refreshRecommendations(
    forceOrOptions:
      | boolean
      | {
          force?: boolean;
          sync?: boolean;
          advance?: boolean;
        } = false,
  ) {
    const options =
      typeof forceOrOptions === "boolean"
        ? { force: forceOrOptions, sync: false, advance: false }
        : forceOrOptions;
    const query = new URLSearchParams();

    if (options.force) {
      query.set("force", "1");
    }
    if (options.sync) {
      query.set("sync", "1");
    }
    if (options.advance) {
      query.set("advance", "1");
    }

    setRecommendationsLoading(true);
    try {
      const queryString = query.toString();
      const next = normalizeRecommendationResponse(
        await requestJson<RecommendationResponse>(`/api/recommendations${queryString ? `?${queryString}` : ""}`),
      );
      setRecommendations(next);
      return next;
    } finally {
      setRecommendationsLoading(false);
    }
  }

  async function refreshPortfolio() {
    setPortfolioLoading(true);

    try {
      const next = await requestJson<PortfolioHolding[]>("/api/portfolio");
      setPortfolio(next);
    } finally {
      setPortfolioLoading(false);
    }
  }

  async function refreshPortfolioAdvice() {
    setPortfolioAdviceLoading(true);

    try {
      const next = await requestJson<PortfolioAdvice[]>("/api/portfolio/advice");
      setPortfolioAdvice(next);
    } finally {
      setPortfolioAdviceLoading(false);
    }
  }

  async function refreshWatchlist(force = false) {
    setWatchlistLoading(true);
    setError(null);

    try {
      const payload = await requestJson<{ configured: boolean; items: WatchlistSummary[] }>(
        `/api/watchlist/analysis${force ? "?force=1" : ""}`,
      );
      setWatchlist(payload.items);

      if (!selectedId && payload.items.length > 0) {
        setSelectedId(payload.items[0].goodId);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "监控池刷新失败");
    } finally {
      setWatchlistLoading(false);
    }
  }

  async function refreshAnalysis(goodId: string, force = false) {
    setLoading(true);
    setError(null);

    try {
      const next = await requestJson<AnalysisResponse>(
        `/api/items/${goodId}/analysis${force ? "?force=1" : ""}`,
      );
      setAnalysis(next);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "饰品分析获取失败");
    } finally {
      setLoading(false);
    }
  }

  async function refreshHistory(goodId: string) {
    try {
      const next = await requestJson<HistoryPlaybackResponse>(`/api/items/${goodId}/history`);
      setHistoryPlayback((current) => (current?.goodId === goodId || !current ? next : current));
    } catch {
      setHistoryPlayback((current) =>
        current?.goodId === goodId
          ? {
              goodId,
              snapshotsAvailable: 0,
              latestAt: null,
              points: [],
            }
          : current,
      );
    }
  }

  async function requestAnalysisFast(
    goodId: string,
    {
      force = false,
      mode = "deep",
      background = false,
    }: {
      force?: boolean;
      mode?: "summary" | "deep";
      background?: boolean;
    } = {},
  ) {
    if (!background && !force && mode === "deep") {
      const cached = analysisCacheRef.current[goodId];
      if (cached) {
        setAnalysis(cached);
        void requestAnalysisFast(goodId, { mode: "deep", background: true });
        return cached;
      }
    }

    const controller = new AbortController();
    if (!background) {
      analysisAbortRef.current?.abort();
      analysisAbortRef.current = controller;
      setLoading(mode === "summary");
      setAnalysisSyncing(mode === "deep");
      setError(null);
    } else if (mode === "deep" && goodId === selectedIdRef.current) {
      setAnalysisSyncing(true);
    }

    try {
      const query = new URLSearchParams();
      if (force) {
        query.set("force", "1");
      }
      if (mode === "summary") {
        query.set("mode", "summary");
      }

      const next = await requestJson<AnalysisResponse>(
        `/api/items/${goodId}/analysis${query.size > 0 ? `?${query.toString()}` : ""}`,
        { signal: controller.signal },
      );
      cacheAnalysis(next);

      if (goodId === selectedIdRef.current) {
        setAnalysis(next);
      }

      return next;
    } catch (caughtError) {
      if (isAbortError(caughtError)) {
        return null;
      }

      if (!background) {
        setError(caughtError instanceof Error ? caughtError.message : "饰品分析获取失败");
      }

      return null;
    } finally {
      if (!background) {
        if (analysisAbortRef.current === controller) {
          analysisAbortRef.current = null;
        }
        setLoading(false);
        if (mode === "summary") {
          setAnalysisSyncing(false);
        }
      }

      if (mode === "deep" && goodId === selectedIdRef.current) {
        setAnalysisSyncing(false);
      }
    }
  }

  async function loadAnalysis(goodId: string, force = false) {
    return requestAnalysisFast(goodId, { force, mode: "deep", background: false });
  }

  async function loadHistory(goodId: string, background = false) {
    if (!background) {
      const cached = historyCacheRef.current[goodId];
      if (cached) {
        setHistoryPlayback(cached);
        void loadHistory(goodId, true);
        return;
      }
    }

    const controller = new AbortController();
    if (!background) {
      historyAbortRef.current?.abort();
      historyAbortRef.current = controller;
    }

    try {
      const next = await requestJson<HistoryPlaybackResponse>(`/api/items/${goodId}/history`, {
        signal: controller.signal,
      });
      cacheHistory(next);
      if (goodId === selectedIdRef.current) {
        setHistoryPlayback(next);
      }
    } catch (caughtError) {
      if (isAbortError(caughtError)) {
        return;
      }

      if (goodId === selectedIdRef.current) {
        setHistoryPlayback((current) =>
          current?.goodId === goodId
            ? {
                goodId,
                snapshotsAvailable: 0,
                latestAt: null,
                points: [],
              }
            : current,
        );
      }
    } finally {
      if (!background && historyAbortRef.current === controller) {
        historyAbortRef.current = null;
      }
    }
  }

  async function bootstrap() {
    try {
      await Promise.all([refreshConfig(), refreshMarket(), refreshRuntimeStatus()]);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "初始化失败");
    }
  }

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (config?.configured && config.watchlist.length > 0) {
      void refreshWatchlist();
      void refreshRecommendations();
    }
  }, [config?.configured, config?.watchlist.length]);

  useEffect(() => {
    if (!config?.configured || watchlist.length <= 1) {
      return;
    }

    const queued = watchlist
      .filter((item) => item.goodId !== selectedId && !analysisCacheRef.current[item.goodId])
      .slice(0, 2);

    if (queued.length === 0) {
      return;
    }

    const timeouts = queued.map((item, index) =>
      window.setTimeout(() => {
        void requestAnalysisFast(item.goodId, { mode: "summary", background: true });
      }, 1200 * (index + 1)),
    );

    return () => {
      timeouts.forEach((timeout) => window.clearTimeout(timeout));
    };
  }, [watchlist, selectedId, config?.configured]);

  useEffect(() => {
    if (selectedId && config?.configured) {
      llmPollAttemptsRef.current[selectedId] = 0;
      closeHolderDetail();
      const cachedAnalysis = analysisCacheRef.current[selectedId];
      if (cachedAnalysis) {
        setAnalysis(cachedAnalysis);
        setLoading(false);
        void requestAnalysisFast(selectedId, { mode: "deep", background: true });
      } else {
        void requestAnalysisFast(selectedId, { mode: "summary" }).then((next) => {
          if (next && selectedIdRef.current === selectedId) {
            void requestAnalysisFast(selectedId, { mode: "deep", background: true });
          }
        });
      }
      void loadHistory(selectedId);
    } else if (!selectedId) {
      setHistoryPlayback(null);
      closeHolderDetail();
    }
  }, [selectedId, config?.configured]);

  useEffect(() => {
    if (activePage !== "portfolio") {
      return;
    }

    void refreshPortfolio();
    if (config?.configured) {
      void refreshPortfolioAdvice();
    }
  }, [activePage, config?.configured]);

  useEffect(() => {
    if (activePage !== "recommendations" || !config?.configured) {
      return;
    }

    const minimumCount = recommendations?.scanner.minimumTargetCount ?? 3;
    const hasEnoughCards =
      (recommendations?.positive.length ?? 0) + (recommendations?.watch.length ?? 0) >= minimumCount;

    if (!hasEnoughCards && !recommendations?.scanner.paused) {
      void refreshRecommendations({ sync: true, advance: true });
      return;
    }

    void refreshRecommendations({ sync: true });
  }, [activePage, config?.configured]);

  useEffect(() => {
    const scanner = recommendations?.scanner;
    const actionableCount = (recommendations?.positive.length ?? 0) + (recommendations?.watch.length ?? 0);
    const minimumCount = scanner?.minimumTargetCount ?? 3;

    if (activePage !== "recommendations" || !config?.configured || !scanner || scanner.paused) {
      return;
    }

    if (actionableCount >= minimumCount) {
      return;
    }

    const timeout = window.setTimeout(
      () => {
        void refreshRecommendations();
      },
      scanner.autofilling ? 6000 : 2500,
    );

    return () => window.clearTimeout(timeout);
  }, [
    activePage,
    config?.configured,
    recommendations?.positive.length,
    recommendations?.watch.length,
    recommendations?.scanner?.autofilling,
    recommendations?.scanner?.lastRoundAt,
    recommendations?.scanner?.minimumTargetCount,
    recommendations?.scanner?.paused,
  ]);

  useEffect(() => {
    if (!selectedId || !analysis || analysis.item.goodId !== selectedId) {
      return;
    }

    if (!needsLlmBackfill(analysis)) {
      return;
    }

    const attempts = llmPollAttemptsRef.current[selectedId] ?? 0;
    if (attempts >= 8) {
      return;
    }

    const timeout = window.setTimeout(() => {
      llmPollAttemptsRef.current[selectedId] = attempts + 1;
      void loadAnalysis(selectedId);
    }, 8000);

    return () => window.clearTimeout(timeout);
  }, [analysis, selectedId]);

  useEffect(() => {
    if (!config?.configured) {
      return;
    }

    const timeout = window.setTimeout(
      () => {
        void refreshRuntimeStatus();
      },
      refreshStatus?.running ? 4_000 : 15_000,
    );

    return () => window.clearTimeout(timeout);
  }, [config?.configured, refreshStatus?.running, refreshStatus?.lastRunAt]);

  useEffect(() => {
    if (!config?.configured || !refreshStatus?.lastRunAt) {
      return;
    }

    void refreshWatchlist();
    void refreshRecommendations();
    if (selectedId) {
      void loadAnalysis(selectedId);
      void loadHistory(selectedId);
    }
  }, [config?.configured, refreshStatus?.lastRunAt]);

  useEffect(() => {
    if (!config?.configured || deferredQuery.length < 2) {
      setSearchResults([]);
      return;
    }

    const timeout = window.setTimeout(() => {
      void requestJson<SearchSuggestion[]>(`/api/search?q=${encodeURIComponent(deferredQuery)}`)
        .then(setSearchResults)
        .catch(() => setSearchResults([]));
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [deferredQuery, config?.configured]);

  async function handleSaveToken(bindIp: boolean) {
    if (!tokenInput.trim()) {
      setError("请先粘贴 ApiToken");
      return;
    }

    setError(null);
    setMessage(null);

    try {
      const payload = await requestJson<{ maskedToken: string | null; bindResult?: string | null }>(
        "/api/config/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiToken: tokenInput.trim(),
            bindIp,
          }),
        },
      );

      setTokenInput("");
      setMessage(payload.bindResult || "ApiToken 已保存");
      await refreshConfig();
      await refreshWatchlist(true);
      await refreshRecommendations({ force: true, sync: true, advance: true });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "保存 Token 失败");
    }
  }

  async function handleBindIpOnly() {
    try {
      const payload = await requestJson<{ message: string }>("/api/config/bind-ip", {
        method: "POST",
      });
      setMessage(payload.message);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "绑定 IP 失败");
    }
  }

  async function handleSaveCsfloatKey() {
    if (!csfloatKeyInput.trim()) {
      setError("请先粘贴 CSFloat 开发者 Key");
      return;
    }

    setError(null);
    setMessage(null);

    try {
      const payload = await requestJson<{ maskedCsfloatApiKey: string | null }>(
        "/api/config/csfloat-key",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: csfloatKeyInput.trim(),
          }),
        },
      );

      setCsfloatKeyInput("");
      setMessage(`CSFloat Key 已保存 ${payload.maskedCsfloatApiKey ?? ""}`.trim());
      await refreshConfig();
      await refreshRecommendations({ force: true, sync: true });
      if (selectedId) {
        await loadAnalysis(selectedId, true);
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "保存 CSFloat Key 失败");
    }
  }

  async function handleRunRefresh() {
    setError(null);
    setMessage(null);

    try {
      await refreshMarket();

      if (config?.configured) {
        await requestJson<{ started: boolean; running: boolean }>("/api/refresh/run", {
          method: "POST",
        });
        await refreshRuntimeStatus();
        await refreshWatchlist();
        await refreshRecommendations();

        if (selectedId) {
          await loadAnalysis(selectedId);
          await loadHistory(selectedId);
        }

        setMessage("已触发后台批量刷新，结果会随定时任务自动回填");
        return;
      }

      setMessage("市场指数已刷新");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "刷新监控失败");
    }
  }

  async function handleAddWatch(item: SearchSuggestion) {
    try {
      await requestJson("/api/config/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goodId: item.id,
          name: item.value,
        }),
      });
      setSearchText("");
      setSearchResults([]);
      await refreshConfig();
      handleSelectItem(item.id);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "加入监控失败");
    }
  }

  async function handleRemoveWatch(goodId: string) {
    try {
      await requestJson(`/api/config/watchlist/${goodId}`, {
        method: "DELETE",
      });

      if (selectedId === goodId) {
        setSelectedId(null);
        setAnalysis(null);
      }

      await refreshConfig();
      await refreshWatchlist();
      await refreshRecommendations();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "移除失败");
    }
  }

  async function handleSavePortfolio() {
    if (!portfolioForm.goodId.trim() || !portfolioForm.name.trim()) {
      setError("请先填写饰品 ID 和名称");
      return;
    }

    if (!portfolioForm.averageCost.trim() || !portfolioForm.quantity.trim()) {
      setError("请先填写买入成本和持仓数量");
      return;
    }

    setError(null);
    setMessage(null);

    try {
      await requestJson<PortfolioHolding[]>("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goodId: portfolioForm.goodId.trim(),
          name: portfolioForm.name.trim(),
          averageCost: Number(portfolioForm.averageCost),
          quantity: Number(portfolioForm.quantity),
          note: portfolioForm.note.trim() || undefined,
        }),
      });

      setPortfolioForm({
        goodId: analysis?.item.goodId ?? "",
        name: analysis?.item.name ?? "",
        averageCost: "",
        quantity: "",
        note: "",
      });
      await refreshPortfolio();
      if (config?.configured) {
        await refreshPortfolioAdvice();
      }
      setMessage("持仓登记已保存");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "保存持仓失败");
    }
  }

  async function handleSaveScannerConfig() {
    setError(null);
    setMessage(null);

    try {
      const payload = await requestJson<ScannerConfig>("/api/config/scanner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: scannerForm.enabled,
          deepAnalyzeLimit: Number(scannerForm.deepAnalyzeLimit),
          recommendationLimit: Number(scannerForm.recommendationLimit),
          featuredLimit: Number(scannerForm.featuredLimit),
          hotWindowSize: Number(scannerForm.hotWindowSize),
          randomSampleSize: Number(scannerForm.randomSampleSize),
          maxRoundsPerCycle: Number(scannerForm.maxRoundsPerCycle),
        }),
      });

      setScannerForm(createScannerForm(payload));
      setMessage(
        `自主推荐扫描参数已保存：热门窗口 ${payload.hotWindowSize} / 随机抽样 ${payload.randomSampleSize} / 每轮上限 ${payload.maxRoundsPerCycle}`,
      );
      await refreshConfig();
      await refreshRecommendations({
        force: true,
        sync: true,
        advance: true,
      });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "保存扫描设置失败");
    }
  }

  async function handleContinueRecommendations() {
    setError(null);
    setMessage(null);
    setRecommendationsLoading(true);

    try {
      if (recommendations?.scanner.paused) {
        const next = normalizeRecommendationResponse(
          await requestJson<RecommendationResponse>("/api/recommendations/continue", {
            method: "POST",
          }),
        );
        setRecommendations(next);
        setMessage(
          `已继续自主推荐扫描，后台会至少补到 ${next.scanner.minimumTargetCount} 个候选或跑完整轮循环`,
        );
      } else {
        const next = await refreshRecommendations({
          force: true,
          sync: true,
          advance: true,
        });
        if (next) {
          setMessage(
            `已手动推进一轮自主推荐扫描，后台会继续补到至少 ${next.scanner.minimumTargetCount} 个候选`,
          );
        }
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "继续分析推品失败");
    } finally {
      setRecommendationsLoading(false);
    }
  }

  async function handleDeletePortfolio(holdingId: string) {
    try {
      await requestJson<PortfolioHolding[]>(`/api/portfolio/${holdingId}`, {
        method: "DELETE",
      });
      await refreshPortfolio();
      if (config?.configured) {
        await refreshPortfolioAdvice();
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "删除持仓失败");
    }
  }

  function openItemAnalysis(goodId: string) {
    handleSelectItem(goodId);
    setActivePage("watchlist");
  }

  const topIndices = market.length
    ? market
        .filter((row) =>
          ["init", "knives", "gloves", "covert_weapon", "main_weapon"].includes(row.nameKey),
        )
        .slice(0, 4)
    : [];
  const marketCards = topIndices.length ? topIndices : market.slice(0, 4);
  const activeBoard =
    boardKey === "all" ? null : recommendations?.boards.find((board) => board.key === boardKey) ?? null;
  const filteredWatchlist = watchlist.filter((item) => matchesBoardFilter(item, boardKey, segmentKey));
  const filteredPositive =
    recommendations?.positive.filter((item) => matchesBoardFilter(item, boardKey, segmentKey)) ?? [];
  const filteredWatch =
    recommendations?.watch.filter((item) => matchesBoardFilter(item, boardKey, segmentKey)) ?? [];
  const filteredRisk =
    recommendations?.risk.filter((item) => matchesBoardFilter(item, boardKey, segmentKey)) ?? [];
  const recommendationLimit =
    recommendations?.scanner.recommendationLimit ?? config?.scanner?.recommendationLimit ?? 15;
  const featuredLimit =
    recommendations?.scanner.featuredLimit ?? config?.scanner?.featuredLimit ?? 3;
  const topRecommendedCards = [...filteredPositive, ...filteredWatch]
    .sort(
      (left, right) =>
        right.entryScore - left.entryScore ||
        right.score - left.score ||
        left.dumpRiskScore - right.dumpRiskScore,
    )
    .slice(0, recommendationLimit);
  const rotatingCards = topRecommendedCards.slice(0, featuredLimit);
  const recommendationFocusCards = (filteredPositive.length > 0 ? filteredPositive : topRecommendedCards).slice(0, 2);
  const watchPreviewCards = filteredWatch.slice(0, 3);
  const riskPreviewCards = filteredRisk.slice(0, 3);
  const scannerStatus = recommendations?.scanner ?? null;
  const actionableRecommendationCount = (recommendations?.positive.length ?? 0) + (recommendations?.watch.length ?? 0);
  const minimumRecommendationCount = scannerStatus?.minimumTargetCount ?? 3;
  const scannerWindowLabel = scannerStatus
    ? `${scannerStatus.windowRangeStart}-${scannerStatus.windowRangeEnd}`
    : "--";
  const scannerStateText = scannerStatus
    ? scannerStatus.paused
      ? `本轮已暂停，等待手动继续。已完成 ${scannerStatus.completedRoundsInCycle}/${scannerStatus.maxRoundsPerCycle} 次`
      : scannerStatus.autofilling
        ? `正在自动补扫，直到至少补出 ${scannerStatus.minimumTargetCount} 个候选`
        : `正在按窗口 ${scannerWindowLabel} 抽样 ${scannerStatus.randomSampleSize} 个标的`
    : "等待首次扫描";
  const pageTabs: Array<{
    key: "market" | "watchlist" | "holders" | "recommendations" | "portfolio";
    label: string;
    hint: string;
    count: number | null;
  }> = [
    { key: "market", label: "大盘异动", hint: "指数 / 异动 / 扫描概览", count: marketCards.length },
    { key: "watchlist", label: "监控分析", hint: "单标的深度分析", count: watchlist.length },
    { key: "holders", label: "库存席位", hint: "库存 / 买卖动向", count: analysis?.holderInsights.length ?? null },
    {
      key: "recommendations",
      label: "自主推荐",
      hint: "扫描候选标的前 15",
      count: topRecommendedCards.length,
    },
    { key: "portfolio", label: "我的持仓", hint: "登记成本 / AI 建议", count: portfolio.length },
  ];

  const liveAlerts = filteredWatchlist
    .flatMap((item) => {
      if (item.alertSignal.level === "silent") {
        return [];
      }

      const type =
        item.alertSignal.level === "push_risk"
          ? "dump"
          : item.alertSignal.level === "push_entry"
            ? "entry"
            : "watch";
      const sourceText =
        item.alertSignal.sources.length > 0 ? ` 来源 ${item.alertSignal.sources.slice(0, 2).join(" / ")}` : "";

      return [
        {
          type,
          title: item.alertSignal.title || `${item.name} ${pushSignalLabel(item.alertSignal.level)}`,
          detail: `${item.alertSignal.detail}${sourceText}`,
          score: item.alertSignal.score,
        },
      ];
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);

  const watchAlertsLegacy = filteredWatchlist
    .flatMap((item) => {
      const rows: Array<{ type: "entry" | "dump"; title: string; detail: string; score: number }> = [];

      if (item.dumpRiskScore >= 70) {
        rows.push({
          type: "dump",
          title: `${item.name} 疑似跑路预警`,
          detail: `风险 ${item.dumpRiskScore}/100，近 7 天 ${formatPercent(item.change7d)}，量能 ${item.volumeSpike}x`,
          score: item.dumpRiskScore,
        });
      }

      if (item.entryScore >= 76) {
        rows.push({
          type: "entry",
          title: `${item.name} 建仓信号出现`,
          detail: `评分 ${item.entryScore}/100，量价配合增强，适合重点跟踪。`,
          score: item.entryScore,
        });
      }

      return rows;
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);
  void watchAlertsLegacy;

  useEffect(() => {
    if (!activeBoard) {
      if (segmentKey !== "all") {
        setSegmentKey("all");
      }
      return;
    }

    if (segmentKey !== "all" && !activeBoard.segments.some((segment) => segment.key === segmentKey)) {
      setSegmentKey("all");
    }
  }, [activeBoard, segmentKey]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">CS</div>
          <div>
            <h1>CS2 饰品交易监控台</h1>
            <p>基于 CSQAQ 聚合的 BUFF / 悠悠有品行情，聚焦建仓预判与跑路预警</p>
          </div>
        </div>

        <div className="topbar-actions">
          <div className="status-pill">
            <span className={`status-dot ${config?.configured ? "online" : "offline"}`} />
            <span>
              {config?.configured ? `Token 已配置 ${config.maskedToken ?? ""}` : "等待配置 ApiToken"}
            </span>
          </div>
          <div
            className={`status-pill status-pill-wide ${pushSignalTone(
              refreshStatus
                ? refreshStatus.running
                  ? "watch"
                  : refreshStatus.lastError
                    ? "push_risk"
                    : "push_entry"
                : "silent",
            )}`}
          >
            <span
              className={`status-dot ${
                refreshStatus?.running ? "online" : refreshStatus?.enabled ? "idle" : "offline"
              }`}
            />
            <span>{refreshStatusLabel(refreshStatus)}</span>
          </div>
          <button className="ghost-button" type="button" onClick={() => setSettingsOpen(true)}>
            数据源设置
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={() => void handleRunRefresh()}
          >
            刷新监控
          </button>
        </div>
      </header>

      <nav className="page-nav" aria-label="页面导航">
        {pageTabs.map((tab) => (
          <button
            className={`page-tab ${activePage === tab.key ? "active" : ""}`}
            key={tab.key}
            type="button"
            onClick={() => setActivePage(tab.key)}
          >
            <strong>{tab.label}</strong>
            <span>{tab.hint}</span>
            <em>{tab.count == null ? "--" : tab.count}</em>
          </button>
        ))}
      </nav>
      {activePage === "market" && (
      <section className="market-strip">
        {marketCards.map((card) => (
          <article className="market-card" key={card.id}>
            <div className="market-card-head">
              <span>{card.name}</span>
              <span className={card.chgRate >= 0 ? "trend-up" : "trend-down"}>
                {formatPercent(card.chgRate)}
              </span>
            </div>
            <strong>{card.marketIndex.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}</strong>
            <small>更新时间 {formatDateTime(card.updatedAt)}</small>
          </article>
        ))}
      </section>
      )}
      {(message || error) && (
        <div className={`feedback-bar ${error ? "error" : "success"}`}>{error || message}</div>
      )}
      {activePage === "market" && (
        <main className="page-layout market-layout">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>大盘异动</h2>
                <p>把指数、扫描命中和重点异动放在一页看，先判断今天市场在做什么。</p>
              </div>
              <span className="muted-tag">{recommendations?.scanner.source ?? "CSQAQ"}</span>
            </div>

            <div className="scanner-summary-grid">
              <div className="scanner-card">
                <span>候选扫描</span>
                <strong>{recommendations?.scanner.scannedCandidateCount ?? 0}</strong>
                <small>{recommendations?.scanner.candidatePages ?? 0} 页候选池</small>
              </div>
              <div className="scanner-card">
                <span>深度分析</span>
                <strong>{recommendations?.scanner.deepAnalyzedCount ?? 0}</strong>
                <small>进入深度分析的标的数</small>
              </div>
              <div className="scanner-card">
                <span>推荐入池</span>
                <strong>{recommendations?.featured.length ?? 0}</strong>
                <small>当前进入自主推荐池的项目</small>
              </div>
            </div>

            <div className="holder-insight-list">
              {rotatingCards.map((card) => (
                <button
                  className={`holder-insight-card ${card.recommendationType === "risk_avoid" ? "negative" : "positive"}`}
                  key={`market-featured-${card.goodId}`}
                  type="button"
                  onClick={() => openItemAnalysis(card.goodId)}
                >
                  <div className="holder-insight-head">
                    <div>
                      <strong>{card.name}</strong>
                      {shouldShowMarketHashAlias(card.name, card.marketHashName) && (
                        <small className="item-market-hash">{card.marketHashName}</small>
                      )}
                    </div>
                    <span className={`signal-pill ${card.recommendationType === "risk_avoid" ? "negative" : "positive"}`}>
                      {recommendationTypeLabel(card.recommendationType)}
                    </span>
                  </div>
                  <div className="delta-row">
                    <span>综合 {card.score}</span>
                    <span>建仓 {card.entryScore}</span>
                    <span>风险 {card.dumpRiskScore}</span>
                  </div>
                  <p className="holder-insight-note">{card.reason}</p>
                </button>
              ))}
            </div>
          </section>

          <aside className="panel panel-fill">
            <div className="panel-header">
              <div>
                <h2>异动提醒</h2>
                <p>这里只保留最值得你马上处理的建仓和风险信号。</p>
              </div>
              <span className="muted-tag">{liveAlerts.length} 条</span>
            </div>

            <div className="alerts-list">
              {liveAlerts.length === 0 && (
                <div className="empty-box slim">
                  <strong>当前没有强信号</strong>
                  <p>后台继续跑几轮后，异动提醒会更稳定。</p>
                </div>
              )}

              {liveAlerts.map((alert, index) => (
                <article
                  className={`alert-card ${alert.type === "watch" ? "warning" : alert.type}`}
                  key={`market-alert-${index}`}
                >
                  <div className="alert-chip">
                    {alert.type === "dump" ? "跑路预警" : alert.type === "entry" ? "建仓推送" : "重点观察"}
                  </div>
                  <strong>{alert.title}</strong>
                  <p>{alert.detail}</p>
                </article>
              ))}
            </div>
          </aside>
        </main>
      )}
      {activePage === "recommendations" && (
        <section className="panel recommendation-stage">
          <div className="recommendation-stage-top">
            <div className="recommendation-stage-copy">
              <span className="stage-eyebrow">Autonomous Recommendation Deck</span>
              <h2>自主推荐工作台</h2>
              <p>先用板块过滤收窄范围，再看当前扫描状态和这一轮最值得优先处理的推荐焦点。</p>
            </div>
            <div className="recommendation-stage-actions">
              <span className="status-pill status-pill-wide">{scannerStateText}</span>
              <button
                className="ghost-button"
                disabled={!config?.configured || recommendationsLoading}
                type="button"
                onClick={() => void handleContinueRecommendations()}
              >
                {scannerStatus?.paused ? "继续分析推品" : "手动推进一轮"}
              </button>
            </div>
          </div>

          <div className="recommendation-filter-card">
            <div className="stage-filter-group">
              <span className="stage-filter-label">板块过滤</span>
              <div className="chip-row compact">
                <button
                  className={`filter-chip ${boardKey === "all" ? "active" : ""}`}
                  type="button"
                  onClick={() => {
                    setBoardKey("all");
                    setSegmentKey("all");
                  }}
                >
                  全部板块
                </button>
                {(recommendations?.boards ?? []).map((board) => (
                  <button
                    className={`filter-chip ${boardKey === board.key ? "active" : ""}`}
                    key={board.key}
                    type="button"
                    onClick={() => {
                      setBoardKey(board.key);
                      setSegmentKey("all");
                    }}
                  >
                    {board.label}
                    <span>{board.count}</span>
                  </button>
                ))}
              </div>
            </div>

            {activeBoard && activeBoard.segments.length > 0 && (
              <div className="stage-filter-group">
                <span className="stage-filter-label">细分过滤</span>
                <div className="chip-row compact secondary">
                  <button
                    className={`filter-chip ${segmentKey === "all" ? "active" : ""}`}
                    type="button"
                    onClick={() => setSegmentKey("all")}
                  >
                    全部细分
                  </button>
                  {activeBoard.segments.map((segment) => (
                    <button
                      className={`filter-chip ${segmentKey === segment.key ? "active" : ""}`}
                      key={segment.key}
                      type="button"
                      onClick={() => setSegmentKey(segment.key)}
                    >
                      {segment.label}
                      <span>{segment.count}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="recommendation-stage-metrics">
            <article className="stage-metric-card">
              <span>当前窗口</span>
              <strong>{scannerWindowLabel}</strong>
              <small>热门窗口 {scannerStatus?.hotWindowSize ?? config?.scanner?.hotWindowSize ?? 20} 个</small>
            </article>
            <article className="stage-metric-card">
              <span>轮次进度</span>
              <strong>
                {scannerStatus?.completedRoundsInCycle ?? 0}/
                {scannerStatus?.maxRoundsPerCycle ?? config?.scanner?.maxRoundsPerCycle ?? 15}
              </strong>
              <small>剩余 {scannerStatus?.roundsRemaining ?? config?.scanner?.maxRoundsPerCycle ?? 15} 次</small>
            </article>
            <article className="stage-metric-card">
              <span>候选与抽样</span>
              <strong>{scannerStatus?.scannedCandidateCount ?? 0}</strong>
              <small>本轮抽样 {scannerStatus?.randomSampleSize ?? config?.scanner?.randomSampleSize ?? 10} 个</small>
            </article>
            <article className="stage-metric-card">
              <span>推荐池深度</span>
              <strong>{topRecommendedCards.length}</strong>
              <small>深度分析 {scannerStatus?.deepAnalyzedCount ?? 0} 个</small>
            </article>
          </div>

          {(scannerStatus && actionableRecommendationCount < minimumRecommendationCount && !scannerStatus.paused) ||
          scannerStatus?.lastBatchCandidates?.length ||
          scannerStatus?.fallbackSource ? (
            <div className="recommendation-stage-notes">
              {scannerStatus && actionableRecommendationCount < minimumRecommendationCount && !scannerStatus.paused ? (
                <article className="stage-note-card">
                  <strong>{scannerStatus.autofilling ? "正在自动补扫候选" : "准备补扫候选"}</strong>
                  <p>
                    当前仅有 {actionableRecommendationCount} 个可推荐候选，系统会继续推进窗口，直到至少补出{" "}
                    {minimumRecommendationCount} 个候选或本轮循环耗尽。
                  </p>
                </article>
              ) : null}

              {scannerStatus?.lastBatchCandidates?.length ? (
                <article className="stage-note-card">
                  <strong>上一轮抽样</strong>
                  <p>{scannerStatus.lastBatchCandidates.join(" / ")}</p>
                </article>
              ) : null}

              {scannerStatus?.fallbackSource ? (
                <article className="stage-note-card warning">
                  <strong>候选池回退</strong>
                  <p>{scannerStatus.fallbackSource}</p>
                </article>
              ) : null}
            </div>
          ) : null}

          <div className="recommendation-stage-grid">
            <section className="stage-spotlight-panel">
              <div className="recommend-title-row">
                <div>
                  <strong>本轮推荐焦点</strong>
                  <p>优先看评分和趋势同时向上的标的，避免在同一层级里塞太多卡片。</p>
                </div>
                <span className="muted-tag">{recommendationFocusCards.length} 张焦点卡</span>
              </div>

              <div className="spotlight-card-grid">
                {recommendationFocusCards.map((card, index) => (
                  <button
                    className={`spotlight-card ${card.recommendationType === "bottom_reversal" ? "accent" : ""}`}
                    key={`spotlight-${card.goodId}`}
                    type="button"
                    onClick={() => openItemAnalysis(card.goodId)}
                  >
                    <div className="spotlight-card-top">
                      <span className="spotlight-rank">#{index + 1}</span>
                      <span className={`signal-pill ${card.recommendationType === "bottom_reversal" ? "positive" : "warning"}`}>
                        {recommendationTypeLabel(card.recommendationType)}
                      </span>
                    </div>
                    <div>
                      <strong>{card.name}</strong>
                      {shouldShowMarketHashAlias(card.name, card.marketHashName) && (
                        <small className="item-market-hash">{card.marketHashName}</small>
                      )}
                    </div>
                    <p>{card.reason}</p>
                    <div className="spotlight-card-metrics">
                      <span>综合 {card.score}</span>
                      <span>建仓 {card.entryScore}</span>
                      <span>7天 {formatPercent(card.expected7dPct, 1)}</span>
                    </div>
                    <div className="spotlight-card-footer">
                      <span>{card.taxonomy.categoryLabel}</span>
                      <span>{card.taxonomy.segmentLabel}</span>
                    </div>
                  </button>
                ))}
                {recommendationFocusCards.length === 0 && (
                  <div className="recommend-empty">
                    <strong>当前还没有命中推荐</strong>
                    <p>先让扫描器至少跑完一轮，再看哪些标的进入前排。</p>
                  </div>
                )}
              </div>
            </section>

            <aside className="stage-side-rail">
              <article className="stage-stream-card">
                <div className="recommend-title-row">
                  <div>
                    <strong>提前观察</strong>
                    <p>刚起势但还没完全走出来的标的。</p>
                  </div>
                  <span className="muted-tag">{filteredWatch.length}</span>
                </div>
                <div className="mini-recommend-list">
                  {watchPreviewCards.map((card) => (
                    <button
                      className="mini-recommend-card"
                      key={`watch-preview-${card.goodId}`}
                      type="button"
                      onClick={() => openItemAnalysis(card.goodId)}
                    >
                      <div className="recommend-meta">
                        <span className="signal-pill warning">{recommendationTypeLabel(card.recommendationType)}</span>
                        <span className="muted-tag">{card.taxonomy.segmentLabel}</span>
                      </div>
                      <div>
                        <strong>{card.name}</strong>
                        {shouldShowMarketHashAlias(card.name, card.marketHashName) && (
                          <small className="item-market-hash">{card.marketHashName}</small>
                        )}
                      </div>
                      <div className="delta-row">
                        <span>评分 {card.score}</span>
                        <span>建仓 {card.entryScore}</span>
                        <span>风险 {card.dumpRiskScore}</span>
                      </div>
                    </button>
                  ))}
                  {watchPreviewCards.length === 0 && (
                    <div className="recommend-empty compact">
                      <strong>当前没有提前观察项</strong>
                      <p>这一轮还没看到明显转强但尚未爆发的标的。</p>
                    </div>
                  )}
                </div>
              </article>

              <article className="stage-stream-card">
                <div className="recommend-title-row">
                  <div>
                    <strong>风险回避</strong>
                    <p>优先提醒需要减仓或回避的高风险信号。</p>
                  </div>
                  <span className="muted-tag">{filteredRisk.length}</span>
                </div>
                <div className="mini-recommend-list">
                  {riskPreviewCards.map((card) => (
                    <button
                      className="mini-recommend-card risk"
                      key={`risk-preview-${card.goodId}`}
                      type="button"
                      onClick={() => openItemAnalysis(card.goodId)}
                    >
                      <div className="recommend-meta">
                        <span className="signal-pill negative">{recommendationTypeLabel(card.recommendationType)}</span>
                        <span className="muted-tag">{card.taxonomy.segmentLabel}</span>
                      </div>
                      <div>
                        <strong>{card.name}</strong>
                        {shouldShowMarketHashAlias(card.name, card.marketHashName) && (
                          <small className="item-market-hash">{card.marketHashName}</small>
                        )}
                      </div>
                      <div className="delta-row">
                        <span>风险 {card.dumpRiskScore}</span>
                        <span>警报 {pushSignalLabel(card.alertLevel)}</span>
                      </div>
                    </button>
                  ))}
                  {riskPreviewCards.length === 0 && (
                    <div className="recommend-empty compact">
                      <strong>当前没有高风险回避项</strong>
                      <p>当前没有需要你优先避开的强风险标的。</p>
                    </div>
                  )}
                </div>
              </article>
            </aside>
          </div>
        </section>
      )}
      {activePage === "watchlist" && (
      <main className="workspace">
        <aside className="left-column">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>监控池</h2>
                <p>按饰品名搜索并加入本地监控列表</p>
              </div>
              <span className="muted-tag">{filteredWatchlist.length}/{watchlist.length}</span>
            </div>

            <label className="search-box">
              <span>搜索</span>
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder={config?.configured ? "输入饰品名、俗称、武器或磨损" : "先配置 ApiToken 再搜索"}
                disabled={!config?.configured}
              />
            </label>

            {searchResults.length > 0 && (
              <div className="search-results">
                {searchResults.map((item) => (
                  <button
                    className="search-result"
                    key={item.id}
                    type="button"
                    onClick={() => {
                      void handleAddWatch(item);
                    }}
                  >
                    <span>{item.value}</span>
                    <small>#{item.id}</small>
                  </button>
                ))}
              </div>
            )}

            <div className="watchlist">
              {filteredWatchlist.length === 0 && (
                <div className="empty-box">
                  <strong>还没有监控饰品</strong>
                  <p>先配置 Token，然后搜索你想跟踪的饰品加入监控池。</p>
                </div>
              )}

              {filteredWatchlist.map((item) => (
                <article
                  className={`watch-card ${selectedId === item.goodId ? "active" : ""}`}
                  key={item.goodId}
                >
                  <button className="watch-card-select" type="button" onClick={() => handleSelectItem(item.goodId)}>
                    <div className="watch-card-main">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="watch-image" />
                      ) : (
                        <div className="watch-image placeholder">CS</div>
                      )}
                      <div className="watch-copy">
                        <strong>{item.name}</strong>
                        <span>
                          {item.taxonomy.segmentLabel} 路 {formatMoney(item.buffClose)} / {formatMoney(item.yyypClose)}
                        </span>
                      </div>
                    </div>

                    <div className="watch-card-side">
                      <span className={`signal-pill ${pushSignalTone(item.alertSignal.level)}`}>
                        {pushSignalLabel(item.alertSignal.level)}
                      </span>
                      <span className={`score-badge ${badgeTone(item.dumpRiskScore)}`}>
                        风险 {item.dumpRiskScore}
                      </span>
                      <span className={`score-badge ${badgeTone(item.entryScore)}`}>
                        建仓 {item.entryScore}
                      </span>
                    </div>
                  </button>
                  <button
                    className="mini-text-button watch-card-remove"
                    type="button"
                    onClick={() => void handleRemoveWatch(item.goodId)}
                  >
                    移除
                  </button>
                </article>
              ))}
            </div>
          </section>

          <section className="panel panel-fill">
            <div className="panel-header">
              <div>
                <h2>实时预警</h2>
                <p>按监控池评分自动筛出高优先级信号</p>
              </div>
              <span className="muted-tag">{liveAlerts.length} 条</span>
            </div>

            <div className="alerts-list">
              {liveAlerts.length === 0 && (
                <div className="empty-box slim">
                  <strong>当前没有强信号</strong>
                  <p>如果刚开始使用，先让系统积累一段历史快照，预警会更稳定。</p>
                </div>
              )}

                {liveAlerts.map((alert, index) => (
                  <article
                    className={`alert-card ${alert.type === "watch" ? "warning" : alert.type}`}
                    key={`${alert.title}-${index}`}
                  >
                  <div className="alert-chip">
                    {alert.type === "dump" ? "跑路预警" : alert.type === "entry" ? "建仓推送" : "重点观察"}
                  </div>
                  <strong>{alert.title}</strong>
                  <p>{alert.detail}</p>
                </article>
              ))}
            </div>
          </section>
        </aside>
        <section className="center-column">
          {analysis ? (
            <>
              <section className="hero-card">
                <div className="hero-item">
                  {analysis.item.image ? (
                    <img src={analysis.item.image} alt={analysis.item.name} className="hero-image" />
                  ) : (
                    <div className="hero-image placeholder large">CS</div>
                  )}

                  <div className="hero-copy">
                    <div className="hero-tags">
                      <span className="chip">{analysis.taxonomy.categoryLabel}</span>
                      <span className="chip muted">{analysis.taxonomy.segmentLabel}</span>
                      {analysis.item.rarity && <span className="chip">{analysis.item.rarity}</span>}
                      {analysis.item.weapon && <span className="chip">{analysis.item.weapon}</span>}
                      {analysis.item.exterior && <span className="chip muted">{analysis.item.exterior}</span>}
                      {(isSwitchPending || analysisSyncing) && (
                        <span className="chip muted">{loading ? "快速加载中" : "深度同步中"}</span>
                      )}
                    </div>
                    <h2>{analysis.item.name}</h2>
                    {shouldShowMarketHashAlias(analysis.item.name, analysis.item.marketHashName) && (
                      <p className="hero-alias">{analysis.item.marketHashName}</p>
                    )}
                    <p>
                      7 天冷却卖出时间 {formatDateTime(analysis.market.t7SellableAt)}，历史快照{" "}
                      {analysis.history.snapshotsAvailable} 次
                    </p>
                  </div>
                </div>

                <div className="hero-metrics">
                  <div className="metric-card">
                    <span>BUFF 最新</span>
                    <strong>{formatMoney(analysis.market.buffClose)}</strong>
                    <small>更新时间 {formatDateTime(analysis.market.updatedAt)}</small>
                  </div>
                  <div className="metric-card">
                    <span>悠悠有品最新</span>
                    <strong>{formatMoney(analysis.market.yyypClose)}</strong>
                    <small>平台价差 {formatPercent(analysis.market.spreadPct)}</small>
                  </div>
                  <div className="metric-card">
                    <span>7 天预期</span>
                    <strong className={analysis.prediction.expected7dPct >= 0 ? "trend-up" : "trend-down"}>
                      {formatPercent(analysis.prediction.expected7dPct)}
                    </strong>
                    <small>{analysis.prediction.direction}</small>
                  </div>
                  <div className="metric-card">
                    <span>存世量</span>
                    <strong>{formatNumber(analysis.statistic.current)}</strong>
                    <small>14 天变化 {formatPercent(analysis.statistic.change14d)}</small>
                  </div>
                </div>
              </section>

              <section className="insight-grid">
                <article className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>交易策略</h2>
                      <p>把建仓评分、跑路风险和 7 天锁仓约束整合成动作建议</p>
                    </div>
                    <span className={`signal-pill ${strategyToneClass(analysis.strategy.tone)}`}>
                      {analysis.strategy.action}
                    </span>
                  </div>

                  <div className={`strategy-summary-card ${strategyToneClass(analysis.strategy.tone)}`}>
                    <strong>{analysis.strategy.action}</strong>
                    <p>{analysis.strategy.actionSummary}</p>
                  </div>

                  <div className="strategy-metric-grid">
                    <div className="book-row">
                      <span>建议仓位</span>
                      <strong>
                        {analysis.strategy.positionMinPct}% - {analysis.strategy.positionMaxPct}%
                      </strong>
                    </div>
                    <div className="book-row">
                      <span>目标价</span>
                      <strong>{formatMoney(analysis.strategy.targetPrice)}</strong>
                    </div>
                    <div className="book-row">
                      <span>防守位</span>
                      <strong>{formatMoney(analysis.strategy.defensePrice)}</strong>
                    </div>
                    <div className="book-row">
                      <span>冷却判断</span>
                      <strong>{analysis.strategy.lockDays} 天</strong>
                    </div>
                    <div className="book-row">
                      <span>价格分层</span>
                      <strong>{analysis.marketContext.priceTier.label}</strong>
                    </div>
                    <div className="book-row">
                      <span>团队评分</span>
                      <strong>
                        建 {analysis.marketContext.teamSignal.buildScore} / 退{" "}
                        {analysis.marketContext.teamSignal.exitScore}
                      </strong>
                    </div>
                  </div>

                  <div className="strategy-note">{analysis.strategy.cooldownSummary}</div>
                  <div className="strategy-note subtle-note">
                    <strong>{analysis.marketContext.teamSignal.status === "building" ? "团队侧偏建仓" : analysis.marketContext.teamSignal.status === "exiting" ? "团队侧偏撤退" : "团队侧中性"}</strong>
                    <p>{analysis.marketContext.teamSignal.summary}</p>
                    <p>{analysis.marketContext.priceTier.description}</p>
                  </div>
                </article>

                <article className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>信号解释</h2>
                      <p>把量价、存世量、头部持仓和平台价差拆开解释</p>
                    </div>
                  </div>

                  <div className="reasoning-grid">
                    {analysis.reasoning.map((factor) => (
                      <div className={`factor-card ${factor.tone}`} key={factor.title}>
                        <span>{factor.title}</span>
                        <strong>{factor.value}</strong>
                        <p>{factor.detail}</p>
                      </div>
                    ))}
                  </div>
                </article>
              </section>

              <section className="insight-grid">
                <article className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>提前建仓侦测</h2>
                      <p>优先抓少数席位先堆仓、价格尚未暴力拉升的标的</p>
                    </div>
                    <span className={`signal-pill ${pushSignalTone(analysis.pushSignal.level)}`}>
                      {analysis.earlyAccumulation.state === "early_build"
                        ? "提前建仓"
                        : analysis.earlyAccumulation.state === "crowded_breakout"
                          ? "已被市场看见"
                          : analysis.earlyAccumulation.state === "watch"
                            ? "继续观察"
                            : "暂未触发"}
                    </span>
                  </div>

                  <div className={`strategy-summary-card ${strategyToneClass(analysis.strategy.tone)}`}>
                    <strong>{analysis.earlyAccumulation.title}</strong>
                    <p>{analysis.earlyAccumulation.detail}</p>
                    <div className="delta-row">
                      <span>侦测分 {analysis.earlyAccumulation.score}</span>
                      <span>建仓席位 {analysis.earlyAccumulation.detectedBuilders}</span>
                      <span>覆盖占比 {formatPercent(analysis.earlyAccumulation.totalTrackedSharePct, 2)}</span>
                    </div>
                  </div>

                  <div className="reason-list">
                    {analysis.earlyAccumulation.likelyMotives.map((item) => (
                      <div className="reason-item positive" key={item}>
                        {item}
                      </div>
                    ))}
                  </div>
                </article>

                <article className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>重点席位追踪</h2>
                      <p>公布当前重点持仓人、持仓数量，以及 24h / 7d 快照变化</p>
                    </div>
                  </div>

                  <div className="holder-insight-list">
                    {analysis.holderInsights.slice(0, 6).map((holder) => (
                      <button
                        className={`holder-insight-card holder-insight-action ${holderRoleTone(holder.role)} ${
                          holderDetail?.holder.taskId === holder.taskId ? "active" : ""
                        }`}
                        disabled={!holder.taskId}
                        key={`${holder.steamId ?? holder.steamName}`}
                        type="button"
                        onClick={() => openHolderDetail(holder)}
                      >
                        <div className="holder-insight-head">
                          <strong>{holder.steamName}</strong>
                          <span className={`signal-pill ${holderRoleTone(holder.role)}`}>
                            {holder.role === "builder" ? "加仓中" : holder.role === "exiting" ? "减仓中" : "观察"}
                          </span>
                        </div>
                        <div className="delta-row">
                          <span>当前 {formatNumber(holder.currentNum)} 件</span>
                          <span>24h {holder.change24hAbs == null ? "--" : `${holder.change24hAbs > 0 ? "+" : ""}${holder.change24hAbs}`}</span>
                          <span>7d {holder.change7dAbs == null ? "--" : `${holder.change7dAbs > 0 ? "+" : ""}${holder.change7dAbs}`}</span>
                        </div>
                        <p className="holder-insight-note">{holder.note}</p>
                        <div className="holder-insight-footer">
                          <span>{holder.taskId ? "点击查看库存、动态与快照" : "当前没有可展开的席位详情"}</span>
                          {holder.taskId && <span>查看详情</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                </article>
              </section>

              <section className="panel ai-panel">
                <div className="panel-header">
                  <div>
                    <h2>AI 辅助研判</h2>
                    <p>用本地 gpt-5.4 对规则引擎、持仓和 7 天锁仓窗口做二次解释</p>
                  </div>
                  <span className={`signal-pill ${analysis.llm.status === "ok" ? "positive" : "warning"}`}>
                    {llmDecisionLabel(analysis.llm.alertDecision)}
                  </span>
                </div>

                <div className="ai-grid">
                  <article className={`strategy-summary-card ${analysis.llm.status === "ok" ? "positive" : "neutral"}`}>
                    <strong>{llmRegimeLabel(analysis.llm.regime)}</strong>
                    <p>{analysis.llm.summary}</p>
                    <div className="delta-row">
                      <span>模型 {analysis.llm.model}</span>
                      <span>置信度 {analysis.llm.confidence ?? "--"}%</span>
                      <span>下次检查 {analysis.llm.nextCheckMinutes ?? "--"} 分钟</span>
                    </div>
                  </article>

                  <div className="ai-metric-grid">
                    <div className="factor-card positive">
                      <span>AI 建仓强度</span>
                      <strong>{analysis.llm.buildSignalStrength ?? "--"}</strong>
                      <p>结合规则分、持仓和冷却期后的综合判断。</p>
                    </div>
                    <div className="factor-card negative">
                      <span>AI 跑路强度</span>
                      <strong>{analysis.llm.dumpSignalStrength ?? "--"}</strong>
                      <p>更强调价差、卖压、持仓回落与供给扩张。</p>
                    </div>
                    <div className={`factor-card ${teamStatusClass(analysis.marketContext.teamSignal.status)}`}>
                      <span>团队行为状态</span>
                      <strong>
                        {analysis.marketContext.teamSignal.status === "building"
                          ? "偏建仓"
                          : analysis.marketContext.teamSignal.status === "exiting"
                            ? "偏撤退"
                            : "中性"}
                      </strong>
                      <p>{analysis.marketContext.teamSignal.summary}</p>
                    </div>
                    <div className="factor-card">
                      <span>AI 7天区间</span>
                      <strong>
                        {formatPercent(analysis.llm.expected7dRange.lowPct, 1)} /{" "}
                        {formatPercent(analysis.llm.expected7dRange.basePct, 1)} /{" "}
                        {formatPercent(analysis.llm.expected7dRange.highPct, 1)}
                      </strong>
                      <p>低 / 中 / 高三档预期，用来校验规则引擎的 7 天卖出带。</p>
                    </div>
                  </div>

                  <div className="ai-list-grid">
                    <div className="mini-panel">
                      <span className="mini-title">支持证据</span>
                      <div className="reason-list">
                        {analysis.llm.evidence.map((item) => (
                          <div className="reason-item positive" key={item}>
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mini-panel">
                      <span className="mini-title">反向信号</span>
                      <div className="reason-list">
                        {analysis.llm.counterSignals.map((item) => (
                          <div className="reason-item negative" key={item}>
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mini-panel">
                      <span className="mini-title">行动建议</span>
                      <div className="reason-list">
                        {analysis.llm.actionPlan.map((item) => (
                          <div className="reason-item" key={item}>
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2>历史回放</h2>
                    <p>用本地快照回看多标的自动刷新后的价差、卖压和走势变化</p>
                  </div>
                  <span className="muted-tag">
                    {historyPlayback?.snapshotsAvailable ?? analysis.history.snapshotsAvailable} 条
                  </span>
                </div>

                {historyPlayback && historyPlayback.points.length > 1 ? (
                  <>
                    <div className="delta-row">
                      <span>最近快照 {formatDateTime(historyPlayback.latestAt)}</span>
                      <span>
                        卖压{" "}
                        {historyPlayback.points.at(-1)?.sellPressure != null
                          ? `${historyPlayback.points.at(-1)?.sellPressure?.toFixed(2)}x`
                          : "--"}
                      </span>
                      <span>BUFF {formatMoney(historyPlayback.points.at(-1)?.buffClose ?? null)}</span>
                      <span>悠悠 {formatMoney(historyPlayback.points.at(-1)?.yyypClose ?? null)}</span>
                    </div>
                    <EChartPanel option={buildHistoryOption(historyPlayback)} height={220} />
                  </>
                ) : (
                  <div className="empty-box slim">
                    <strong>历史快照还不够</strong>
                    <p>让后台多跑几轮自动刷新后，这里会回放价格和卖压轨迹。</p>
                  </div>
                )}
              </section>

              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2>CSFloat 在售补充</h2>
                    <p>补充全球市场的公开在售样本，关注 float、模板和卖家分布</p>
                  </div>
                  <span className={`signal-pill ${analysis.csfloat.enabled ? "positive" : "warning"}`}>
                    {analysis.csfloat.enabled ? `${analysis.csfloat.listingCount} 条在售` : "暂未接通"}
                  </span>
                </div>

                <div className="strategy-metric-grid">
                  <div className="book-row">
                    <span>最低价格</span>
                    <strong>{formatMoney(analysis.csfloat.lowestPrice)}</strong>
                  </div>
                  <div className="book-row">
                    <span>最高价格</span>
                    <strong>{formatMoney(analysis.csfloat.highestPrice)}</strong>
                  </div>
                  <div className="book-row">
                    <span>最佳 Float</span>
                    <strong>{analysis.csfloat.bestFloat != null ? analysis.csfloat.bestFloat.toFixed(4) : "--"}</strong>
                  </div>
                  <div className="book-row">
                    <span>查询名</span>
                    <strong>{analysis.csfloat.marketHashName ?? "--"}</strong>
                  </div>
                </div>

                <div className="reason-item">{analysis.csfloat.limitation}</div>

                <div className="holder-insight-list compact-list">
                  {analysis.csfloat.samples.map((sample) => (
                    <article className="holder-insight-card neutral" key={sample.listingId}>
                      <div className="holder-insight-head">
                        <strong>{sample.sellerName}</strong>
                        <span className="muted-tag">Seed {sample.paintSeed ?? "--"}</span>
                      </div>
                      <div className="delta-row">
                        <span>价格 {formatMoney(sample.price)}</span>
                        <span>Float {sample.floatValue != null ? sample.floatValue.toFixed(4) : "--"}</span>
                        <span>{sample.sellerSteamId ?? "未公开 SteamID"}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="panel chart-panel">
                <div className="panel-header">
                  <div>
                    <h2>量价主图</h2>
                    <p>BUFF、悠悠有品、MA7、MA20 与合并成交量</p>
                  </div>
                  <span className="muted-tag">日线 150 样本</span>
                </div>
                <EChartPanel option={buildPriceOption(analysis)} height={360} />
              </section>

              <div className="chart-row">
                <section className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>MACD</h2>
                      <p>{analysis.indicators.macd.summary}</p>
                    </div>
                    <span className={`signal-pill ${analysis.indicators.macd.signal}`}>
                      {analysis.indicators.macd.signal === "buy" ? "偏多" : "偏空"}
                    </span>
                  </div>
                  <EChartPanel option={buildMacdOption(analysis)} height={180} />
                </section>

                <section className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>KDJ</h2>
                      <p>{analysis.indicators.kdj.summary}</p>
                    </div>
                    <span className={`signal-pill ${analysis.indicators.kdj.signal}`}>
                      {analysis.indicators.kdj.signal === "buy"
                        ? "偏多"
                        : analysis.indicators.kdj.signal === "sell"
                          ? "偏空"
                          : "观望"}
                    </span>
                  </div>
                  <EChartPanel option={buildKdjOption(analysis)} height={180} />
                </section>
              </div>
            </>
          ) : (
            <section className="panel panel-fill empty-panel">
              <strong>{loading ? "正在拉取饰品分析..." : "先从左侧监控池选择一个饰品"}</strong>
              <p>如果还没有配置 ApiToken，请先打开“数据源设置”。</p>
            </section>
          )}
        </section>
        <aside className="right-column">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>建仓评分</h2>
                <p>量价、指标、价差与持仓共振</p>
              </div>
            </div>

            <div className="score-ring-block">
              <div
                className="score-ring"
                style={
                  {
                    ["--score" as string]: `${analysis?.scores.entryScore ?? 0}`,
                    ["--ring-color" as string]:
                      (analysis?.scores.entryScore ?? 0) >= 75
                        ? "#38c7b4"
                        : (analysis?.scores.entryScore ?? 0) >= 58
                          ? "#ffb549"
                          : "#7f91a8",
                  } as CSSProperties
                }
              >
                <strong>{analysis?.scores.entryScore ?? 0}</strong>
              </div>

              <div>
                <h3>{analysis?.scores.entryLabel ?? "等待计算"}</h3>
                <p>
                  预测方向 {analysis?.prediction.direction ?? "--"}，置信度{" "}
                  {analysis?.prediction.confidence ?? "--"}%
                </p>
              </div>
            </div>

            <div className="reason-list">
              {(analysis?.scores.entryReasons ?? []).map((reason) => (
                <div className="reason-item positive" key={reason}>
                  {reason}
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>跑路风险</h2>
                <p>价格下挫、卖压与筹码松动综合评估</p>
              </div>
            </div>

            <div className="score-ring-block">
              <div
                className="score-ring risk"
                style={
                  {
                    ["--score" as string]: `${analysis?.scores.dumpRiskScore ?? 0}`,
                    ["--ring-color" as string]:
                      (analysis?.scores.dumpRiskScore ?? 0) >= 72
                        ? "#ff6258"
                        : (analysis?.scores.dumpRiskScore ?? 0) >= 58
                          ? "#ffb549"
                          : "#7f91a8",
                  } as CSSProperties
                }
              >
                <strong>{analysis?.scores.dumpRiskScore ?? 0}</strong>
              </div>

              <div>
                <h3>{analysis?.scores.dumpLabel ?? "等待计算"}</h3>
                <p>锁仓期风险 {analysis?.prediction.cooldownRiskPct ?? "--"}%</p>
              </div>
            </div>

            <div className="reason-list">
              {(analysis?.scores.dumpReasons ?? []).map((reason) => (
                <div className="reason-item negative" key={reason}>
                  {reason}
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>7 天卖出带</h2>
                <p>结合冷却期与近期波动，给出可卖出价格区间</p>
              </div>
            </div>

            <div className="band-grid">
              <div className="band-card">
                <span>下沿</span>
                <strong>{formatMoney(analysis?.prediction.lowBand ?? null)}</strong>
              </div>
              <div className="band-card">
                <span>中位</span>
                <strong>{formatMoney(analysis?.prediction.baseBand ?? null)}</strong>
              </div>
              <div className="band-card">
                <span>上沿</span>
                <strong>{formatMoney(analysis?.prediction.highBand ?? null)}</strong>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>单标的预警</h2>
                <p>把放量下跌、持仓变化、存世量扩张和平台价差转成可执行提醒</p>
              </div>
            </div>

            <div className="alerts-list compact">
              {(analysis?.alerts ?? []).map((alert, index) => (
                <article className={`alert-card ${alertLevelClass(alert.level)}`} key={`${alert.title}-${index}`}>
                  <div className="alert-chip">
                    {alert.level === "entry" ? "建仓" : alert.level === "risk" ? "风险" : "观察"}
                  </div>
                  <strong>{alert.title}</strong>
                  <p>{alert.detail}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="panel panel-fill">
            <div className="panel-header">
              <div>
                <h2>持仓排行</h2>
                <p>
                  Top5 {formatNumber(analysis?.holders.top5 ?? null)}，Top10{" "}
                  {formatNumber(analysis?.holders.top10 ?? null)}
                </p>
              </div>
            </div>

            {analysis && analysis.holders.rows.length > 0 ? (
              <>
                <div className="delta-row">
                  <span>24h 变化 {formatPercent(analysis.holders.delta24h?.changePct ?? null)}</span>
                  <span>7d 变化 {formatPercent(analysis.holders.delta7d?.changePct ?? null)}</span>
                  <span>Top10 占比 {formatPercent(analysis.holders.top10SharePct ?? null)}</span>
                </div>
                <EChartPanel option={buildHolderOption(analysis)} height={210} />
              </>
            ) : (
              <div className="empty-box slim">
                <strong>持仓排行待拉取</strong>
                <p>首次访问或接口暂时受限时，这里会在后续刷新后补齐。</p>
              </div>
            )}
          </section>
        </aside>
      </main>
      )}
      {activePage === "recommendations" && (
        <main className="page-layout recommendation-page">
          <section className="panel recommendation-panel">
            <div className="panel-header">
              <div>
                <h2>自主推荐前十五</h2>
                <p>按建仓推荐评分从高到低展示当前最值得跟踪的前十五个标的，前三名会作为轮播焦点持续刷新。</p>
              </div>
              <div className="toolbar-actions">
                <span className="muted-tag">{topRecommendedCards.length} / {recommendationLimit}</span>
                <button
                  className="ghost-button"
                  disabled={!config?.configured || recommendationsLoading}
                  type="button"
                  onClick={() => void refreshRecommendations({ sync: true })}
                >
                  同步当前结果
                </button>
              </div>
            </div>

            <div className="scanner-summary-grid scanner-summary-grid-wide">
              <div className="scanner-card">
                <span>前三轮播焦点</span>
                <strong>{rotatingCards.length}</strong>
                <small>默认取前 {featuredLimit} 个推荐标的</small>
              </div>
              <div className="scanner-card">
                <span>热门窗口</span>
                <strong>{scannerStatus?.hotWindowSize ?? config?.scanner?.hotWindowSize ?? 20}</strong>
                <small>当前窗口 {scannerWindowLabel}</small>
              </div>
              <div className="scanner-card">
                <span>随机抽样</span>
                <strong>{scannerStatus?.randomSampleSize ?? config?.scanner?.randomSampleSize ?? 10}</strong>
                <small>上一轮时间 {formatDateTime(scannerStatus?.lastRoundAt)}</small>
              </div>
              <div className="scanner-card">
                <span>循环进度</span>
                <strong>
                  {scannerStatus?.completedRoundsInCycle ?? 0}/{scannerStatus?.maxRoundsPerCycle ?? config?.scanner?.maxRoundsPerCycle ?? 15}
                </strong>
                <small>{scannerStatus?.paused ? "已暂停，等待继续" : "仍在自动推进"}</small>
              </div>
            </div>

            <div className="holder-insight-list">
              {topRecommendedCards.map((card, index) => (
                <button
                  className={`holder-insight-card ${card.recommendationType === "risk_avoid" ? "negative" : card.recommendationType === "early_build" || card.recommendationType === "bottom_reversal" ? "positive" : "neutral"}`}
                  key={`featured-${card.goodId}`}
                  type="button"
                  onClick={() => openItemAnalysis(card.goodId)}
                >
                  <div className="holder-insight-head">
                    <div>
                      <strong>
                        #{index + 1} {card.name}
                      </strong>
                      {shouldShowMarketHashAlias(card.name, card.marketHashName) && (
                        <small className="item-market-hash">{card.marketHashName}</small>
                      )}
                    </div>
                    <span
                      className={`signal-pill ${
                        card.recommendationType === "risk_avoid"
                          ? "negative"
                          : card.recommendationType === "early_build" || card.recommendationType === "bottom_reversal"
                            ? "positive"
                            : "warning"
                      }`}
                    >
                      {recommendationTypeLabel(card.recommendationType)}
                    </span>
                  </div>
                  <div className="delta-row">
                    <span>建仓推荐 {card.entryScore}</span>
                    <span>综合 {card.score}</span>
                    <span>7天 {formatPercent(card.expected7dPct, 1)}</span>
                  </div>
                  <p className="holder-insight-note">{card.reason}</p>
                  <div className="chip-row secondary">
                    {(card.triggerTags ?? []).slice(0, 3).map((tag) => (
                      <span className="muted-tag" key={`${card.goodId}-${tag}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <div className="delta-row">
                    <span>团队 建 {card.teamBuildScore}</span>
                    <span>团队 退 {card.teamExitScore}</span>
                    <span>风险 {card.dumpRiskScore}</span>
                  </div>
                  <p className="holder-insight-note">
                    {(card.dataPoints ?? []).slice(0, 3).join(" / ") || "等待这一轮细分信号回填"}
                  </p>
                </button>
              ))}
              {topRecommendedCards.length === 0 && (
                <div className="empty-box slim">
                  <strong>推荐池正在回填</strong>
                  <p>扫描会受 CSQAQ 限频影响，先让扫描器跑完一轮，前十五会自动补齐。</p>
                </div>
              )}
            </div>
          </section>

          <aside className="panel panel-fill">
            <div className="panel-header">
              <div>
                <h2>扫描侧写</h2>
                <p>这里会告诉你当前推荐池是从哪一段热门窗口里抽出来的，以及这轮候选是怎么跑的。</p>
              </div>
            </div>

            <div className="board-summary-grid">
              <article className="board-summary-card">
                <span>候选来源</span>
                <strong>{scannerStatus?.source ?? "scanner"}</strong>
                <small>{scannerStatus?.fallbackSource ? "热门榜不可用，已回退公开列表" : "优先使用热门榜窗口"}</small>
              </article>
              <article className="board-summary-card">
                <span>累计候选</span>
                <strong>{scannerStatus?.scannedCandidateCount ?? 0}</strong>
                <small>推荐池保留 {scannerStatus?.poolSize ?? 0} 个合格标的</small>
              </article>
              <article className="board-summary-card">
                <span>深度分析</span>
                <strong>{scannerStatus?.deepAnalyzedCount ?? 0}</strong>
                <small>每轮最多 {config?.scanner?.deepAnalyzeLimit ?? 15} 个</small>
              </article>
            </div>

            {scannerStatus?.lastBatchCandidates?.length ? (
              <div className="board-spotlight">
                <strong>当前轮次抽样</strong>
                <p>{scannerStatus.lastBatchCandidates.join(" / ")}</p>
              </div>
            ) : null}

            <div className="board-summary-grid">
              {(recommendations?.boards ?? []).map((board) => (
                <article className="board-summary-card" key={`board-summary-${board.key}`}>
                  <span>{board.label}</span>
                  <strong>{board.count}</strong>
                  <small>
                    {((board.segments ?? []).slice(0, 2).map((segment) => `${segment.label} ${segment.count}`).join(" / ")) || "暂无细分命中"}
                  </small>
                </article>
              ))}
            </div>

            <div className="board-spotlight">
              <strong>当前规则重点</strong>
              <p>仅保留枪皮、手套、探员与全息战队贴纸；StatTrak™ 和非全息贴纸不会进入自主推荐池。底部蓄势预警要求 MACD 双线位于零轴下方、连续粘合、绿柱缩短且价格不再创新低。</p>
            </div>
          </aside>
        </main>
      )}
      {activePage === "holders" && (
        <main className="page-layout market-layout">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>库存席位</h2>
                <p>单独看重点持仓人、快照变化和当前在售样本，不和建仓建议挤在一起。</p>
              </div>
              <span className="muted-tag">{analysis?.holderInsights.length ?? 0} 个重点席位</span>
            </div>

            <div className="chip-row">
              {filteredWatchlist.slice(0, 8).map((item) => (
                <button
                  className={`filter-chip ${selectedId === item.goodId ? "active" : ""}`}
                  key={`holder-switch-${item.goodId}`}
                  type="button"
                  onClick={() => handleSelectItem(item.goodId)}
                >
                  {item.name}
                </button>
              ))}
            </div>

            {analysis ? (
              <>
                <div className="holder-insight-list">
                  {analysis.holderInsights.slice(0, 10).map((holder) => (
                    <button
                      className={`holder-insight-card holder-insight-action ${holderRoleTone(holder.role)} ${
                        holderDetail?.holder.taskId === holder.taskId ? "active" : ""
                      }`}
                      disabled={!holder.taskId}
                      key={`holders-page-${holder.steamId ?? holder.steamName}`}
                      type="button"
                      onClick={() => openHolderDetail(holder)}
                    >
                      <div className="holder-insight-head">
                        <strong>{holder.steamName}</strong>
                        <span className={`signal-pill ${holderRoleTone(holder.role)}`}>
                          {holder.role === "builder" ? "加仓中" : holder.role === "exiting" ? "减仓中" : "观察"}
                        </span>
                      </div>
                      <div className="delta-row">
                        <span>当前 {formatNumber(holder.currentNum)} 件</span>
                        <span>24h {formatSignedCount(holder.change24hAbs)}</span>
                        <span>7d {formatSignedCount(holder.change7dAbs)}</span>
                      </div>
                      <p className="holder-insight-note">{holder.note}</p>
                      <div className="holder-insight-footer">
                        <span>{holder.taskId ? "点击查看该席位的库存、异动和快照" : "当前没有可展开的席位详情"}</span>
                        {holder.taskId && <span>查看详情</span>}
                      </div>
                    </button>
                  ))}
                </div>

                {analysis.holders.rows.length > 0 && (
                  <section className="holder-detail-section">
                    <div className="compact-panel-header">
                      <h3>持仓排行</h3>
                      <p>看当前标的 Top 持仓人数量和排名分布。</p>
                    </div>
                    <EChartPanel option={buildHolderOption(analysis)} height={260} />
                  </section>
                )}
              </>
            ) : (
              <div className="empty-box slim">
                <strong>先从监控分析里选一个标的</strong>
                <p>这里会单独展示该标的的席位变化和库存侧线索。</p>
              </div>
            )}
          </section>

          <aside className="panel panel-fill">
            {analysis ? (
              <>
                <div className="panel-header">
                  <div>
                    <h2>席位摘要</h2>
                    <p>把建仓前兆、Top10 占比和 CSFloat 样本一起看。</p>
                  </div>
                </div>

                <div className="holder-summary-grid holder-summary-compact">
                  <div className="holder-summary-card">
                    <span>提前建仓侦测</span>
                    <strong>{analysis.earlyAccumulation.score}</strong>
                    <small>{analysis.earlyAccumulation.title}</small>
                  </div>
                  <div className="holder-summary-card">
                    <span>Top10 占比</span>
                    <strong>{formatPercent(analysis.holders.top10SharePct, 2)}</strong>
                    <small>24h {formatPercent(analysis.holders.delta24h?.changePct ?? null)}</small>
                  </div>
                  <div className="holder-summary-card">
                    <span>公开卖家</span>
                    <strong>{formatNumber(analysis.csfloat.publicSellerCount)}</strong>
                    <small>CSFloat 在售样本</small>
                  </div>
                </div>

                <div className="reason-item">{analysis.earlyAccumulation.detail}</div>

                <div className="holder-insight-list compact-list">
                  {analysis.csfloat.samples.slice(0, 5).map((sample) => (
                    <article className="holder-insight-card neutral" key={`holders-csfloat-${sample.listingId}`}>
                      <div className="holder-insight-head">
                        <strong>{sample.sellerName}</strong>
                        <span className="muted-tag">Seed {sample.paintSeed ?? "--"}</span>
                      </div>
                      <div className="delta-row">
                        <span>价格 {formatMoney(sample.price)}</span>
                        <span>Float {sample.floatValue != null ? sample.floatValue.toFixed(4) : "--"}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div className="empty-box slim">
                <strong>当前没有席位数据</strong>
                <p>先选中一个监控标的，这里再展示对应的库存侧信息。</p>
              </div>
            )}
          </aside>
        </main>
      )}
      {activePage === "portfolio" && (
        <main className="page-layout portfolio-layout">
          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>我的持仓</h2>
                <p>登记你的买入成本和数量，再结合 AI 给出加仓、减仓和卖出建议。</p>
              </div>
              {analysis && (
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() =>
                    setPortfolioForm((current) => ({
                      ...current,
                      goodId: analysis.item.goodId,
                      name: analysis.item.name,
                    }))
                  }
                >
                  使用当前标的
                </button>
              )}
            </div>

            <div className="portfolio-form-grid">
              <label className="field-block">
                <span>饰品 ID</span>
                <input
                  value={portfolioForm.goodId}
                  onChange={(event) => setPortfolioForm((current) => ({ ...current, goodId: event.target.value }))}
                  placeholder="例如 14208"
                />
              </label>
              <label className="field-block">
                <span>饰品名称</span>
                <input
                  value={portfolioForm.name}
                  onChange={(event) => setPortfolioForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="填写你买入的饰品名称"
                />
              </label>
              <label className="field-block">
                <span>买入均价</span>
                <input
                  value={portfolioForm.averageCost}
                  onChange={(event) => setPortfolioForm((current) => ({ ...current, averageCost: event.target.value }))}
                  placeholder="例如 63"
                />
              </label>
              <label className="field-block">
                <span>持仓数量</span>
                <input
                  value={portfolioForm.quantity}
                  onChange={(event) => setPortfolioForm((current) => ({ ...current, quantity: event.target.value }))}
                  placeholder="例如 10"
                />
              </label>
              <label className="field-block portfolio-note-field">
                <span>备注</span>
                <textarea
                  value={portfolioForm.note}
                  onChange={(event) => setPortfolioForm((current) => ({ ...current, note: event.target.value }))}
                  placeholder="可选：记录你的买入原因或计划"
                  rows={4}
                />
              </label>
            </div>

            <div className="toolbar-actions">
              <button className="primary-button" type="button" onClick={() => void handleSavePortfolio()}>
                保存持仓
              </button>
            </div>
          </section>

          <aside className="panel panel-fill">
            <div className="panel-header">
              <div>
                <h2>AI 建议</h2>
                <p>把你的持仓成本和实时分析结果叠加，直接给出动作建议。</p>
              </div>
              <span className="muted-tag">{portfolioAdvice.length} 条</span>
            </div>

            <div className="portfolio-advice-list">
              {portfolioAdviceLoading && (
                <div className="empty-box slim">
                  <strong>正在计算持仓建议</strong>
                  <p>后台正在用当前市场数据更新你的持仓动作分数。</p>
                </div>
              )}

              {!portfolioAdviceLoading &&
                portfolioAdvice.map((item) => (
                  <article className="portfolio-advice-card" key={`portfolio-advice-${item.holdingId}`}>
                    <div className="holder-insight-head">
                      <strong>{item.name}</strong>
                      <span className={`signal-pill ${portfolioActionTone(item.action)}`}>
                        {portfolioActionLabel(item.action)}
                      </span>
                    </div>
                    <div className="delta-row">
                      <span>成本 {formatMoney(item.averageCost)}</span>
                      <span>现价 {formatMoney(item.currentPrice)}</span>
                      <span>盈亏 {formatMoney(item.unrealizedPnL)}</span>
                    </div>
                    <div className="holder-summary-grid portfolio-score-grid">
                      <div className="holder-summary-card">
                        <span>加仓分</span>
                        <strong>{item.addScore}</strong>
                      </div>
                      <div className="holder-summary-card">
                        <span>持有分</span>
                        <strong>{item.holdScore}</strong>
                      </div>
                      <div className="holder-summary-card">
                        <span>卖出分</span>
                        <strong>{item.sellScore}</strong>
                      </div>
                    </div>
                    <p className="holder-insight-note">{item.summary}</p>
                  </article>
                ))}

              {!portfolioAdviceLoading && portfolioAdvice.length === 0 && (
                <div className="empty-box slim">
                  <strong>还没有持仓建议</strong>
                  <p>先登记一笔自己的持仓，系统才会开始给出加仓和卖出意见。</p>
                </div>
              )}
            </div>

            <div className="portfolio-list">
              {portfolioLoading && (
                <div className="empty-box slim">
                  <strong>正在加载持仓列表</strong>
                  <p>稍等一下，这里会回填你保存过的持仓记录。</p>
                </div>
              )}

              {!portfolioLoading &&
                portfolio.map((item) => (
                  <article className="portfolio-card" key={`portfolio-${item.id}`}>
                    <div className="holder-insight-head">
                      <strong>{item.name}</strong>
                      <button
                        className="mini-text-button"
                        type="button"
                        onClick={() => void handleDeletePortfolio(item.id)}
                      >
                        删除
                      </button>
                    </div>
                    <div className="delta-row">
                      <span>ID {item.goodId}</span>
                      <span>均价 {formatMoney(item.averageCost)}</span>
                      <span>数量 {formatNumber(item.quantity)}</span>
                    </div>
                    {item.note && <p className="holder-insight-note">{item.note}</p>}
                  </article>
                ))}
            </div>
          </aside>
        </main>
      )}
      {(holderDetail || holderDetailLoading || holderDetailError) && (
        <div className="modal-mask" onClick={closeHolderDetail}>
          <div
            className="modal-card holder-detail-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="panel-header">
              <div>
                <h2>席位详情</h2>
                <p>查看该席位的公开库存、当前标的异动和历史快照。</p>
              </div>
              <button className="mini-text-button" type="button" onClick={closeHolderDetail}>
                关闭
              </button>
            </div>

            {holderDetailLoading && !holderDetail && (
              <div className="empty-box slim">
                <strong>正在加载席位详情</strong>
                <p>后端正在补齐该席位的库存、动态和快照。</p>
              </div>
            )}

            {holderDetailError && !holderDetail && (
              <div className="empty-box slim">
                <strong>席位详情暂时不可用</strong>
                <p>{holderDetailError}</p>
              </div>
            )}

            {holderDetail && (
              <div className="holder-detail-layout">
                <section className="holder-detail-hero">
                  <div className="holder-detail-identity">
                    {holderDetail.profile.avatar ? (
                      <img
                        alt={holderDetail.profile.steamName}
                        className="holder-avatar"
                        src={holderDetail.profile.avatar}
                      />
                    ) : (
                      <div className="holder-avatar" />
                    )}
                    <div>
                      <strong>{holderDetail.profile.steamName}</strong>
                      <p>
                        SteamID {holderDetail.profile.steamId ?? "--"} · 角色
                        {" "}
                        {holderDetail.holder.role === "builder"
                          ? "加仓中"
                          : holderDetail.holder.role === "exiting"
                            ? "减仓中"
                            : "观察"}
                      </p>
                      <p>{holderDetail.holder.note}</p>
                    </div>
                  </div>

                  <div className="holder-summary-grid">
                    <div className="holder-summary-card">
                      <span>当前持仓</span>
                      <strong>{formatNumber(holderDetail.holder.currentNum)}</strong>
                      <small>占比 {formatPercent(holderDetail.holder.sharePct, 2)}</small>
                    </div>
                    <div className="holder-summary-card">
                      <span>24h / 7d 变化</span>
                      <strong>
                        {formatSignedCount(holderDetail.holder.change24hAbs)} /{" "}
                        {formatSignedCount(holderDetail.holder.change7dAbs)}
                      </strong>
                      <small>用于判断建仓、减仓和撤退节奏</small>
                    </div>
                    <div className="holder-summary-card">
                      <span>库存概况</span>
                      <strong>
                        {formatNumber(holderDetail.profile.inventoryCount)}
                        {" "}
                        件
                      </strong>
                      <small>可露出 {formatNumber(holderDetail.profile.visibleAssetCount)} 件</small>
                    </div>
                    <div className="holder-summary-card">
                      <span>活跃时间</span>
                      <strong>{holderDetail.profile.activeDays ?? "--"} 天</strong>
                      <small>更新时间 {formatDateTime(holderDetail.profile.updatedAt)}</small>
                    </div>
                  </div>
                </section>

                <div className="holder-detail-grid">
                  <section className="holder-detail-section">
                    <div className="compact-panel-header">
                      <h3>该席位公开库存</h3>
                      <p>分页查看这个席位当前公开库存里的饰品与数量。</p>
                    </div>

                    <div className="inventory-grid">
                      {holderDetail.inventory.items.map((item, index) => (
                        <article className="inventory-card" key={`${item.marketName}-${index}`}>
                          {item.iconUrl ? (
                            <img
                              alt={item.marketName}
                              className="inventory-card-image"
                              src={item.iconUrl}
                            />
                          ) : (
                            <div className="inventory-card-image" />
                          )}
                          <div className="inventory-card-copy">
                            <strong>{item.marketName}</strong>
                            <p>
                              分类 {item.categoryName} · 数量 {formatNumber(item.count)}
                            </p>
                            <p>
                              价格 {formatMoney(item.price)} ·
                              {" "}
                              {item.tradable ? "可交易" : "交易冷却中"}
                            </p>
                          </div>
                        </article>
                      ))}
                    </div>

                    <div className="holder-insight-footer">
                      <div className="holder-detail-pagination">
                        <button
                          className="ghost-button"
                          disabled={holderDetailLoading || holderDetail.inventory.pageIndex <= 1}
                          type="button"
                          onClick={() =>
                            void loadHolderDetail(
                              {
                                goodId: holderDetail.goodId,
                                taskId: holderDetail.holder.taskId,
                                steamId: holderDetail.holder.steamId,
                              },
                              holderDetail.inventory.pageIndex - 1,
                            )
                          }
                        >
                          上一页
                        </button>
                        <span>
                          第 {holderDetail.inventory.pageIndex} 页 · 每页 {holderDetail.inventory.pageSize} 条
                        </span>
                        <button
                          className="ghost-button"
                          disabled={holderDetailLoading || !holderDetail.inventory.hasMore}
                          type="button"
                          onClick={() =>
                            void loadHolderDetail(
                              {
                                goodId: holderDetail.goodId,
                                taskId: holderDetail.holder.taskId,
                                steamId: holderDetail.holder.steamId,
                              },
                              holderDetail.inventory.pageIndex + 1,
                            )
                          }
                        >
                          下一页
                        </button>
                      </div>
                      {holderDetailError && <span>{holderDetailError}</span>}
                    </div>
                  </section>

                  <section className="holder-detail-section">
                    <div className="compact-panel-header">
                      <h3>当前标的相关动态</h3>
                      <p>优先展示和当前饰品相关的库存动作，再补最近公开动态。</p>
                    </div>

                    <div className="detail-card-list">
                      {holderDetail.focusActivities.map((item, index) => (
                        <article className="detail-activity-card focused" key={`focus-${index}`}>
                          <div className="detail-activity-main">
                            {item.iconUrl ? (
                              <img
                                alt={item.marketName}
                                className="detail-activity-image"
                                src={item.iconUrl}
                              />
                            ) : (
                              <div className="detail-activity-image" />
                            )}
                            <div>
                              <strong>{item.marketName}</strong>
                              <p>
                                数量 {formatNumber(item.count)} · 类型 {item.type ?? "--"} ·
                                {" "}
                                {item.tradable ? "可交易" : "冷却中"}
                              </p>
                            </div>
                          </div>
                          <span>{formatDateTime(item.createdAt)}</span>
                        </article>
                      ))}

                      {holderDetail.focusActivities.length === 0 && (
                        <div className="empty-box slim">
                          <strong>当前标的暂无额外动态</strong>
                          <p>可以结合下方最近动态和快照继续判断。</p>
                        </div>
                      )}
                    </div>

                    <div className="compact-panel-header">
                      <h3>最近公开动态</h3>
                      <p>按时间看最近露出的库存动作。</p>
                    </div>
                    <div className="detail-card-list">
                      {holderDetail.latestActivities.map((item, index) => (
                        <article className="detail-activity-card" key={`latest-${index}`}>
                          <div className="detail-activity-main">
                            {item.iconUrl ? (
                              <img
                                alt={item.marketName}
                                className="detail-activity-image"
                                src={item.iconUrl}
                              />
                            ) : (
                              <div className="detail-activity-image" />
                            )}
                            <div>
                              <strong>{item.marketName}</strong>
                              <p>
                                数量 {formatNumber(item.count)} · 类型 {item.type ?? "--"} ·{" "}
                                {item.tradable ? "可交易" : "冷却中"}
                              </p>
                            </div>
                          </div>
                          <span>{formatDateTime(item.createdAt)}</span>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>

                <section className="holder-detail-section">
                  <div className="compact-panel-header">
                    <h3>快照列表</h3>
                    <p>按时间回看这个席位的库存快照刷新节奏。</p>
                  </div>
                  <div className="snapshot-list">
                    {holderDetail.snapshots.map((snapshot) => (
                      <article className="snapshot-card" key={snapshot.snapshotId}>
                        <strong>{formatDateTime(snapshot.createdAt)}</strong>
                        <span>快照 ID {snapshot.snapshotId}</span>
                      </article>
                    ))}
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      )}
      {settingsOpen && (
        <div className="modal-mask" onClick={() => setSettingsOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <h2>数据源设置</h2>
                <p>CSQAQ 文档要求使用 ApiToken，并绑定本机白名单 IP</p>
              </div>
              <button className="mini-text-button" type="button" onClick={() => setSettingsOpen(false)}>
                关闭
              </button>
            </div>

            <div className="settings-note">
              <strong>操作路径</strong>
              <p>
                打开 CSQAQ 登录后，点击头像复制 ApiToken，再回到这里保存。你也可以直接点“保存并绑定 IP”，
                系统会调用官方的 <code>bind_local_ip</code> 接口为本机绑定白名单。
              </p>
            </div>

            <label className="field-block">
              <span>ApiToken</span>
              <input
                type="password"
                value={tokenInput}
                onChange={(event) => setTokenInput(event.target.value)}
                placeholder="粘贴你在 CSQAQ 个人中心复制出来的 ApiToken"
              />
            </label>

            <div className="modal-actions">
              <button className="ghost-button" type="button" onClick={() => void handleSaveToken(false)}>
                仅保存 Token
              </button>
              <button className="primary-button" type="button" onClick={() => void handleSaveToken(true)}>
                保存并绑定 IP
              </button>
            </div>

            <label className="field-block">
              <span>CSFloat Developer Key</span>
              <input
                type="password"
                value={csfloatKeyInput}
                onChange={(event) => setCsfloatKeyInput(event.target.value)}
                placeholder="可选：粘贴你在 CSFloat Developer 页面生成的 API Key"
              />
            </label>

            <div className="modal-actions">
              <button className="ghost-button" type="button" onClick={() => void handleSaveCsfloatKey()}>
                保存 CSFloat Key
              </button>
            </div>

            <div className="settings-note">
              <strong>自主推荐扫描器</strong>
              <p>
                默认按“热门列表前 20 个 + 随机分析 10 个 + 连续跑 15 轮”推进；如果热门榜接口不可用，会自动退回公开饰品列表继续扫描。
              </p>
            </div>

            <div className="scanner-form-grid">
              <label className="field-block checkbox-field">
                <span>启用扫描器</span>
                <input
                  checked={scannerForm.enabled}
                  type="checkbox"
                  onChange={(event) =>
                    setScannerForm((current) => ({
                      ...current,
                      enabled: event.target.checked,
                    }))
                  }
                />
              </label>

              <label className="field-block">
                <span>热门窗口</span>
                <input
                  type="number"
                  value={scannerForm.hotWindowSize}
                  min={10}
                  max={60}
                  onChange={(event) =>
                    setScannerForm((current) => ({
                      ...current,
                      hotWindowSize: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="field-block">
                <span>随机抽样</span>
                <input
                  type="number"
                  value={scannerForm.randomSampleSize}
                  min={4}
                  max={20}
                  onChange={(event) =>
                    setScannerForm((current) => ({
                      ...current,
                      randomSampleSize: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="field-block">
                <span>每轮深度分析</span>
                <input
                  type="number"
                  value={scannerForm.deepAnalyzeLimit}
                  min={3}
                  max={20}
                  onChange={(event) =>
                    setScannerForm((current) => ({
                      ...current,
                      deepAnalyzeLimit: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="field-block">
                <span>前十五上限</span>
                <input
                  type="number"
                  value={scannerForm.recommendationLimit}
                  min={6}
                  max={20}
                  onChange={(event) =>
                    setScannerForm((current) => ({
                      ...current,
                      recommendationLimit: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="field-block">
                <span>轮播数量</span>
                <input
                  type="number"
                  value={scannerForm.featuredLimit}
                  min={3}
                  max={6}
                  onChange={(event) =>
                    setScannerForm((current) => ({
                      ...current,
                      featuredLimit: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="field-block">
                <span>循环轮数</span>
                <input
                  type="number"
                  value={scannerForm.maxRoundsPerCycle}
                  min={1}
                  max={30}
                  onChange={(event) =>
                    setScannerForm((current) => ({
                      ...current,
                      maxRoundsPerCycle: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="modal-actions">
              <button className="ghost-button" type="button" onClick={() => void handleSaveScannerConfig()}>
                保存扫描设置
              </button>
              <button className="primary-button" type="button" onClick={() => void handleContinueRecommendations()}>
                {scannerStatus?.paused ? "继续分析推品" : "立即推进一轮"}
              </button>
            </div>

            <div className="sub-actions">
              <button className="mini-text-button" type="button" onClick={() => void handleBindIpOnly()}>
                使用当前 Token 重新绑定本机 IP
              </button>
            </div>

            <div className="settings-meta">
              <div>当前状态：{config?.configured ? `已配置 ${config.maskedToken ?? ""}` : "未配置"}</div>
              <div>CSFloat：{config?.maskedCsfloatApiKey ? `已配置 ${config.maskedCsfloatApiKey}` : "未配置"}</div>
              <div>
                平台映射：
                {config?.platformMap?.buff && config.platformMap.yyyp
                  ? ` BUFF=${config.platformMap.buff} / 悠悠=${config.platformMap.yyyp}`
                  : " 首次分析时自动解析"}
              </div>
            </div>
          </div>
        </div>
      )}
      {(watchlistLoading || refreshStatus?.running) && (
        <div className="floating-state">
          {refreshStatus?.running
            ? `后台正在定时刷新 ${refreshStatus.lastRunSummaryCount} 个监控项 / ${refreshStatus.lastRunDeepCount} 个深度项，结果会自动回填。`
            : "正在串行刷新监控池，CSQAQ 官方限频为单 IP 每秒 1 次请求。"}
        </div>
      )}
    </div>
  );
}

export default App;
