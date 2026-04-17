import { useDeferredValue, useEffect, useRef, useState, type CSSProperties } from "react";
import * as echarts from "echarts";
import type { EChartsOption } from "echarts";
import type {
  AnalysisResponse,
  ConfigResponse,
  HistoryPlaybackResponse,
  MarketIndex,
  RecommendationResponse,
  RefreshRuntimeStatus,
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
    throw new Error(json.error || "请求失败");
  }

  return json.data as T;
}

function formatMoney(value: number | null) {
  if (value == null) {
    return "--";
  }

  return `¥${value.toLocaleString("zh-CN", {
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
    return "推送预警";
  }

  if (decision === "watch_closely") {
    return "重点盯盘";
  }

  if (decision === "observe_only") {
    return "保持观察";
  }

  return "AI 暂不可用";
}

function llmRegimeLabel(regime: AnalysisResponse["llm"]["regime"]) {
  if (regime === "accumulation") {
    return "偏建仓";
  }

  if (regime === "distribution") {
    return "偏派发";
  }

  if (regime === "breakout_watch") {
    return "突破观察";
  }

  if (regime === "panic") {
    return "恐慌阶段";
  }

  return "中性震荡";
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
    return "AI 寤轰粨鎺ㄩ€?";
  }

  if (level === "push_risk") {
    return "AI 璺戦闄╂帹閫?";
  }

  if (level === "watch") {
    return "閲嶇偣瑙傚療";
  }

  return "鏆傛棤淇″彿";
}

function refreshStatusLabel(status: RefreshRuntimeStatus | null) {
  if (!status) {
    return "鑷姩鍒锋柊鏈垵濮嬪寲";
  }

  if (!status.enabled) {
    return "鑷姩鍒锋柊宸插叧闂?";
  }

  if (status.running) {
    return `鑷姩鍒锋柊杩涜涓?${status.lastRunSummaryCount}/${status.lastRunDeepCount}`;
  }

  if (status.lastError) {
    return `鑷姩鍒锋柊寮傚父: ${status.lastError}`;
  }

  return `鑷姩鍒锋柊 ${status.intervalMinutes}m 涓€娆★紝涓嬫 ${formatDateTime(status.nextRunAt)}`;
}

function recommendationTypeLabel(type: RecommendationResponse["positive"][number]["recommendationType"]) {
  if (type === "early_build") {
    return "提前建仓";
  }

  if (type === "rotation") {
    return "题材轮动";
  }

  if (type === "risk_avoid") {
    return "风险回避";
  }

  return "趋势跟随";
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
      data: ["BUFF", "鎮犳偁", "鍗栧帇"],
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
          formatter: (value: number) => `楼${Math.round(value)}`,
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
        name: "鎮犳偁",
        type: "line",
        showSymbol: false,
        smooth: true,
        data: historyPlayback.points.map((point) => point.yyypClose),
        lineStyle: { color: "#38c7b4", width: 2 },
      },
      {
        name: "鍗栧帇",
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

  useEffect(() => {
    if (!ref.current) {
      return;
    }

    const chart = echarts.init(ref.current, undefined, { renderer: "canvas" });
    chart.setOption(option, true);

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(ref.current);

    return () => {
      resizeObserver.disconnect();
      chart.dispose();
    };
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
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [market, setMarket] = useState<MarketIndex[]>([]);
  const [watchlist, setWatchlist] = useState<WatchlistSummary[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [historyPlayback, setHistoryPlayback] = useState<HistoryPlaybackResponse | null>(null);
  const [recommendations, setRecommendations] = useState<RecommendationResponse | null>(null);
  const [refreshStatus, setRefreshStatus] = useState<RefreshRuntimeStatus | null>(null);
  const [boardKey, setBoardKey] = useState("all");
  const [segmentKey, setSegmentKey] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState("");
  const [csfloatKeyInput, setCsfloatKeyInput] = useState("");
  const [searchText, setSearchText] = useState("");
  const [searchResults, setSearchResults] = useState<SearchSuggestion[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const deferredQuery = useDeferredValue(searchText.trim());
  const llmPollAttemptsRef = useRef<Record<string, number>>({});

  async function refreshConfig() {
    const next = await requestJson<ConfigResponse>("/api/config");
    setConfig(next);

    if (!selectedId && next.watchlist.length > 0) {
      setSelectedId(next.watchlist[0].goodId);
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

  async function refreshRecommendations(force = false) {
    const next = await requestJson<RecommendationResponse>(
      `/api/recommendations${force ? "?force=1" : ""}`,
    );
    setRecommendations(next);
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
    if (selectedId && config?.configured) {
      llmPollAttemptsRef.current[selectedId] = 0;
      void refreshAnalysis(selectedId);
      void refreshHistory(selectedId);
    } else if (!selectedId) {
      setHistoryPlayback(null);
    }
  }, [selectedId, config?.configured]);

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
      void refreshAnalysis(selectedId);
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
      void refreshAnalysis(selectedId);
      void refreshHistory(selectedId);
    }
  }, [config?.configured, refreshStatus?.lastRunAt, selectedId]);

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
      await refreshRecommendations(true);
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
      await refreshRecommendations(true);
      if (selectedId) {
        await refreshAnalysis(selectedId, true);
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
          await refreshAnalysis(selectedId);
          await refreshHistory(selectedId);
        }

        setMessage("宸茶Е鍙戝悗鍙版壒閲忓埛鏂帮紝缁撴灉浼氶殢瀹氭椂浠诲姟鑷姩鍥炲～");
        return;
      }

      setMessage("甯傚満鎸囨暟宸插埛鏂?");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "鍒锋柊鐩戞帶澶辫触");
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
      await refreshWatchlist(true);
      await refreshRecommendations(true);
      setSelectedId(item.id);
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
        item.alertSignal.sources.length > 0 ? ` 路 ${item.alertSignal.sources.slice(0, 2).join(" / ")}` : "";

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
      {(message || error) && (
        <div className={`feedback-bar ${error ? "error" : "success"}`}>{error || message}</div>
      )}
      <section className="board-toolbar">
        <div className="panel board-panel">
          <div className="panel-header">
            <div>
              <h2>板块导航</h2>
              <p>按大板块和价格带/系列筛选监控池与推荐池</p>
            </div>
            <span className="muted-tag">{recommendations?.universeCount ?? 0} 个标的</span>
          </div>

          <div className="chip-row">
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
                {board.label} {board.count}
              </button>
            ))}
          </div>

          {activeBoard && activeBoard.segments.length > 0 && (
            <div className="chip-row secondary">
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
                  {segment.label} {segment.count}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="panel recommendation-panel">
          <div className="panel-header">
            <div>
              <h2>自主推荐池</h2>
              <p>优先识别少数席位提前建仓、趋势跟随和高风险回避标的</p>
            </div>
          </div>

          <div className="recommend-grid">
            <div className="recommend-column">
              <div className="recommend-title-row">
                <strong>重点推荐</strong>
                <span className="muted-tag">{filteredPositive.length}</span>
              </div>
              <div className="recommend-list">
                {filteredPositive.slice(0, 4).map((card) => (
                  <article className="recommend-card positive" key={`positive-${card.goodId}`}>
                    <div className="recommend-meta">
                      <span className="signal-pill positive">{recommendationTypeLabel(card.recommendationType)}</span>
                      <span className="muted-tag">{card.taxonomy.segmentLabel}</span>
                    </div>
                    <strong>{card.name}</strong>
                    <p>{card.reason}</p>
                    <div className="delta-row">
                      <span>评分 {card.score}</span>
                      <span>7天 {formatPercent(card.expected7dPct, 1)}</span>
                      <span>建 {card.teamBuildScore} / 退 {card.teamExitScore}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="recommend-column">
              <div className="recommend-title-row">
                <strong>提前观察</strong>
                <span className="muted-tag">{filteredWatch.length}</span>
              </div>
              <div className="recommend-list">
                {filteredWatch.slice(0, 4).map((card) => (
                  <article className="recommend-card watch" key={`watch-${card.goodId}`}>
                    <div className="recommend-meta">
                      <span className="signal-pill warning">{recommendationTypeLabel(card.recommendationType)}</span>
                      <span className="muted-tag">{card.taxonomy.segmentLabel}</span>
                    </div>
                    <strong>{card.name}</strong>
                    <p>{card.reason}</p>
                    <div className="delta-row">
                      <span>评分 {card.score}</span>
                      <span>建仓 {card.entryScore}</span>
                      <span>风险 {card.dumpRiskScore}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="recommend-column">
              <div className="recommend-title-row">
                <strong>风险回避</strong>
                <span className="muted-tag">{filteredRisk.length}</span>
              </div>
              <div className="recommend-list">
                {filteredRisk.slice(0, 4).map((card) => (
                  <article className="recommend-card risk" key={`risk-${card.goodId}`}>
                    <div className="recommend-meta">
                      <span className="signal-pill negative">{recommendationTypeLabel(card.recommendationType)}</span>
                      <span className="muted-tag">{card.taxonomy.segmentLabel}</span>
                    </div>
                    <strong>{card.name}</strong>
                    <p>{card.reason}</p>
                    <div className="delta-row">
                      <span>评分 {card.score}</span>
                      <span>风险 {card.dumpRiskScore}</span>
                      <span>警报 {pushSignalLabel(card.alertLevel)}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>
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
                <button
                  className={`watch-card ${selectedId === item.goodId ? "active" : ""}`}
                  key={item.goodId}
                  type="button"
                  onClick={() => setSelectedId(item.goodId)}
                >
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
                    <button
                      className="mini-text-button"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleRemoveWatch(item.goodId);
                      }}
                    >
                      移除
                    </button>
                  </div>
                </button>
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
                    </div>
                    <h2>{analysis.item.name}</h2>
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
                      <article className={`holder-insight-card ${holderRoleTone(holder.role)}`} key={`${holder.steamId ?? holder.steamName}`}>
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
                      </article>
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
