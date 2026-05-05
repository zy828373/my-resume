import { useDeferredValue, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useAnalysisData } from "./hooks/useAnalysisData";
import { useConfig } from "./hooks/useConfig";
import { useHolderDetail } from "./hooks/useHolderDetail";
import { useMarket } from "./hooks/useMarket";
import { usePortfolio } from "./hooks/usePortfolio";
import { useRecommendations } from "./hooks/useRecommendations";
import { useRuntimeStatus } from "./hooks/useRuntimeStatus";
import { useSearchSuggestions } from "./hooks/useSearchSuggestions";
import { useWatchlist } from "./hooks/useWatchlist";
import { Playground } from "./components/Playground";
import { setMotionPreference } from "./hooks/useReducedMotion";
import {
  EChartPanel,
  buildHistoryOption,
  buildPriceOption,
  buildMacdOption,
  buildKdjOption,
  buildHolderOption,
} from "./components/charts";
import { AppShell } from "./components/layout";
import type { StatusPillTone } from "./components/layout";
import { MarketCard } from "./components/cards/MarketCard";
import { HolderDetailModal } from "./components/cards/HolderDetailModal";
import { HoldersPage } from "./components/pages/HoldersPage";
import { MarketPage } from "./components/pages/MarketPage";
import { PortfolioPage } from "./components/pages/PortfolioPage";
import { RecommendationsPage } from "./components/pages/RecommendationsPage";
import { WatchlistPage } from "./components/pages/WatchlistPage";
import { formatDateTime } from "./utils/format";
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
    throw new Error(json.error || "请求失败");
  }

  return json.data as T;
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

function formatSignedCount(value: number | null | undefined) {
  if (value == null) {
    return "--";
  }

  return `${value > 0 ? "+" : ""}${value}`;
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
    return "继续加仓";
  }

  if (action === "reduce") {
    return "减仓观察";
  }

  if (action === "exit") {
    return "优先卖出";
  }

  return "继续持有";
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
    return "AI 建仓推送";
  }

  if (level === "push_risk") {
    return "AI 风险推送";
  }

  if (level === "watch") {
    return "重点观察";
  }

  return "暂无信号";
}

function refreshStatusLabel(status: RefreshRuntimeStatus | null) {
  if (!status) {
    return "自动刷新未初始化";
  }

  if (!status.enabled) {
    return "自动刷新已关闭";
  }

  if (status.running) {
    return `自动刷新进行中 ${status.lastRunSummaryCount}/${status.lastRunDeepCount}`;
  }

  if (status.lastError) {
    return `自动刷新异常: ${status.lastError}`;
  }

  return `自动刷新 ${status.intervalMinutes}m 一次，下次 ${formatDateTime(status.nextRunAt)}`;
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

function subscribeHash(cb: () => void) {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
}
function getHash() {
  return typeof window === "undefined" ? "" : window.location.hash;
}

function App() {
  const [activePage, setActivePage] = useState<
    "market" | "watchlist" | "holders" | "recommendations" | "portfolio"
  >("watchlist");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const {
    market,
    marketAnalysis,
    marketAnalysisLoading,
    marketAnalysisError,
    refreshMarketOverview,
    refreshMarketAnalysis,
  } = useMarket();
  const {
    config,
    tokenInput,
    setTokenInput,
    csfloatKeyInput,
    setCsfloatKeyInput,
    scannerForm,
    setScannerForm,
    refreshConfig,
    saveToken,
    bindIpOnly,
    saveCsfloatKey,
    saveScannerConfig,
  } = useConfig({ onMessage: setMessage, onError: setError });
  const {
    holderDetail,
    holderDetailLoading,
    holderDetailError,
    loadHolderDetail,
    openHolderDetail: openHolderDetailRaw,
    closeHolderDetail,
  } = useHolderDetail();
  const { refreshStatus, refreshRuntimeStatus } = useRuntimeStatus({
    configured: Boolean(config?.configured),
  });

  const {
    recommendations,
    recommendationsLoading,
    refreshRecommendations,
    continueRecommendations,
    resetRecommendations,
  } = useRecommendations({
    configured: Boolean(config?.configured),
    active: activePage === "recommendations",
  });

  const {
    watchlist,
    watchlistLoading,
    refreshWatchlist,
    addWatch,
    removeWatch,
  } = useWatchlist({ onError: setError });
  const [boardKey, setBoardKey] = useState("all");
  const [segmentKey, setSegmentKey] = useState("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [motionDisabled, setMotionDisabled] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("ui:motion") === "off";
    } catch {
      return false;
    }
  });
  const [searchText, setSearchText] = useState("");
  const deferredQuery = useDeferredValue(searchText.trim());
  const searchResults = useSearchSuggestions({
    query: deferredQuery,
    configured: Boolean(config?.configured),
  });

  const {
    analysis,
    historyPlayback,
    loading,
    analysisSyncing,
    isSwitchPending,
    selectedId,
    selectItem: handleSelectItem,
    reloadAnalysis,
    reloadHistory,
    setSelectedId,
  } = useAnalysisData({
    configured: Boolean(config?.configured),
    watchlist,
    refreshTick: refreshStatus?.lastRunAt ?? null,
    onError: setError,
    onSelectionChange: () => closeHolderDetail(),
  });

  const openHolderDetail = (holder: AnalysisResponse["holderInsights"][number]) => {
    openHolderDetailRaw(holder, analysis?.item.goodId);
  };

  const {
    portfolio,
    portfolioAdvice,
    portfolioLoading,
    portfolioAdviceLoading,
    portfolioForm,
    setPortfolioForm,
    savePortfolio,
    deletePortfolio,
    refreshPortfolio,
    refreshPortfolioAdvice,
  } = usePortfolio({
    configured: Boolean(config?.configured),
    active: activePage === "portfolio",
    onMessage: setMessage,
    onError: setError,
  });

  async function bootstrap() {
    try {
      await Promise.all([refreshConfig(), refreshMarketOverview(), refreshRuntimeStatus()]);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "初始化失败");
    }
  }

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    if (activePage !== "market" || marketAnalysis || marketAnalysisLoading || marketAnalysisError) {
      return;
    }

    void refreshMarketAnalysis();
  }, [
    activePage,
    marketAnalysis,
    marketAnalysisLoading,
    marketAnalysisError,
    refreshMarketAnalysis,
  ]);

  useEffect(() => {
    if (config?.configured && config.watchlist.length > 0) {
      void refreshWatchlist();
      void refreshRecommendations();
    }
  }, [config?.configured, config?.watchlist.length]);

  // Auto-select first watchlist item on initial config load.
  useEffect(() => {
    if (!selectedId && config?.watchlist.length) {
      handleSelectItem(config.watchlist[0].goodId);
    }
  }, [config?.watchlist.length]);



  useEffect(() => {
    if (!config?.configured || !refreshStatus?.lastRunAt) {
      return;
    }

    void refreshWatchlist();
    void refreshRecommendations();
    // Analysis + history reload on refresh tick is handled by useAnalysisData.
  }, [config?.configured, refreshStatus?.lastRunAt]);

  async function handleSaveToken(bindIp: boolean) {
    const next = await saveToken(bindIp);
    if (next) {
      await refreshWatchlist(true);
      await refreshRecommendations({ force: true, sync: true, advance: true });
    }
  }

  async function handleSaveCsfloatKey() {
    const next = await saveCsfloatKey();
    if (next) {
      await refreshRecommendations({ force: true, sync: true });
      if (selectedId) await reloadAnalysis(true);
    }
  }

  async function handleSaveScannerConfig() {
    const next = await saveScannerConfig();
    if (next) {
      await refreshRecommendations({ force: true, sync: true, advance: true });
    }
  }

  async function handleRunRefresh() {
    setError(null);
    setMessage(null);

    try {
      await refreshMarketOverview();
      if (activePage === "market") {
        void refreshMarketAnalysis();
      }

      if (config?.configured) {
        await requestJson<{ started: boolean; running: boolean }>("/api/refresh/run", {
          method: "POST",
        });
        await refreshRuntimeStatus();
        await refreshWatchlist();
        await refreshRecommendations();

        if (selectedId) {
          await reloadAnalysis();
          await reloadHistory();
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
    await addWatch(item.id, item.value);
    setSearchText("");
    await refreshConfig();
    handleSelectItem(item.id);
  }

  async function handleRemoveWatch(goodId: string) {
    await removeWatch(goodId);
    if (selectedId === goodId) {
      setSelectedId(null);
    }
    await refreshConfig();
    await refreshWatchlist();
    await refreshRecommendations();
  }

  const handleSavePortfolio = () => {
    setError(null);
    void savePortfolio({ goodId: analysis?.item.goodId, name: analysis?.item.name });
  };

  async function handleContinueRecommendations() {
    setError(null);
    setMessage(null);

    try {
      if (recommendations?.scanner.paused) {
        const next = await continueRecommendations();
        if (next) {
          setMessage(
            `已继续自主推荐扫描，后台会至少补到 ${next.scanner.minimumTargetCount} 个候选或跑完整轮循环`,
          );
        }
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
    }
  }

  async function handleResetRecommendations() {
    setError(null);
    setMessage(null);

    const confirmed = window.confirm(
      "确定清空当前自主推荐池，并从第 1 个窗口重新开始抽样分析吗？",
    );
    if (!confirmed) return;

    try {
      const next = await resetRecommendations();
      if (next) {
        setMessage(
          next.scanner.resetNotice ??
            `已清空推荐池并重新开始分析，后台会至少补到 ${next.scanner.minimumTargetCount} 个候选`,
        );
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "清空重新分析失败");
    }
  }

  const handleDeletePortfolio = (holdingId: string) => {
    void deletePortfolio(holdingId);
  };

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
  const scannerStateText =
    config?.scanner?.enabled === false
      ? "扫描器已关闭，可在下方开启后保存"
      : scannerStatus
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

      const type: "dump" | "entry" | "watch" =
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

  const refreshPillTone: StatusPillTone = refreshStatus
    ? refreshStatus.running
      ? "warning"
      : refreshStatus.lastError
        ? "negative"
        : "positive"
    : "neutral";

  return (
    <AppShell
      config={config}
      refreshStatus={refreshStatus}
      refreshStatusText={refreshStatusLabel(refreshStatus)}
      refreshStatusTone={refreshPillTone}
      onOpenSettings={() => setSettingsOpen(true)}
      onRefresh={() => void handleRunRefresh()}
      tabs={pageTabs}
      activePage={activePage}
      onChangePage={setActivePage}
      message={message}
      error={error}
      marketStrip={
        activePage === "market" ? (
          <section className="market-strip">
            {marketCards.map((card, i) => (
              <MarketCard key={card.id} card={card} index={i} />
            ))}
          </section>
        ) : null
      }
    >
      {activePage === "market" && (
        <MarketPage
          marketAnalysis={marketAnalysis}
          marketAnalysisLoading={marketAnalysisLoading}
          marketAnalysisError={marketAnalysisError}
          recommendations={recommendations}
          rotatingCards={rotatingCards}
          liveAlerts={liveAlerts}
          onRefreshAnalysis={() => void refreshMarketAnalysis()}
          onOpenItem={openItemAnalysis}
        />
      )}
      {activePage === "recommendations" && (
        <RecommendationsPage
          config={config}
          recommendations={recommendations}
          recommendationsLoading={recommendationsLoading}
          scannerForm={scannerForm}
          setScannerForm={setScannerForm}
          scannerStateText={scannerStateText}
          scannerWindowLabel={scannerWindowLabel}
          actionableRecommendationCount={actionableRecommendationCount}
          minimumRecommendationCount={minimumRecommendationCount}
          recommendationLimit={recommendationLimit}
          featuredLimit={featuredLimit}
          boards={recommendations?.boards ?? []}
          boardKey={boardKey}
          segmentKey={segmentKey}
          activeBoard={activeBoard ?? null}
          onBoardChange={(key) => {
            setBoardKey(key);
            setSegmentKey("all");
          }}
          onSegmentChange={setSegmentKey}
          topRecommendedCards={topRecommendedCards}
          rotatingCards={rotatingCards}
          recommendationFocusCards={recommendationFocusCards}
          watchPreviewCards={watchPreviewCards}
          riskPreviewCards={riskPreviewCards}
          filteredWatchCount={filteredWatch.length}
          filteredRiskCount={filteredRisk.length}
          onContinueScan={() => void handleContinueRecommendations()}
          onResetScan={() => void handleResetRecommendations()}
          onSyncScan={() => void refreshRecommendations({ sync: true })}
          onSaveScannerConfig={() => void handleSaveScannerConfig()}
          onOpenItem={openItemAnalysis}
        />
      )}
      {activePage === "watchlist" && (
        <WatchlistPage
          config={config}
          analysis={analysis}
          historyPlayback={historyPlayback}
          holderDetail={holderDetail}
          searchText={searchText}
          onSearchTextChange={setSearchText}
          searchResults={searchResults}
          onAddWatch={(item) => void handleAddWatch(item)}
          watchlist={watchlist}
          filteredWatchlist={filteredWatchlist}
          selectedId={selectedId}
          onSelectItem={handleSelectItem}
          onRemoveWatch={(goodId) => void handleRemoveWatch(goodId)}
          liveAlerts={liveAlerts}
          onOpenHolderDetail={openHolderDetail}
          loading={loading}
          isSwitchPending={isSwitchPending}
          analysisSyncing={analysisSyncing}
        />
      )}
      {activePage === "holders" && (
        <HoldersPage
          analysis={analysis}
          filteredWatchlist={filteredWatchlist}
          selectedId={selectedId}
          holderDetail={holderDetail}
          onSelectItem={handleSelectItem}
          onOpenHolderDetail={openHolderDetail}
        />
      )}
      {activePage === "portfolio" && (
        <PortfolioPage
          analysis={analysis}
          portfolio={portfolio}
          portfolioAdvice={portfolioAdvice}
          portfolioLoading={portfolioLoading}
          portfolioAdviceLoading={portfolioAdviceLoading}
          portfolioForm={portfolioForm}
          setPortfolioForm={setPortfolioForm}
          onSavePortfolio={() => void handleSavePortfolio()}
          onDeletePortfolio={(id) => void handleDeletePortfolio(id)}
        />
      )}
      <HolderDetailModal
        detail={holderDetail}
        loading={holderDetailLoading}
        error={holderDetailError}
        onClose={closeHolderDetail}
        onLoadPage={(pageIndex) => {
          if (!holderDetail) return;
          void loadHolderDetail(
            {
              goodId: holderDetail.goodId,
              taskId: holderDetail.holder.taskId,
              steamId: holderDetail.holder.steamId,
            },
            pageIndex,
          );
        }}
      />
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
              <strong>界面动效</strong>
              <p>
                默认启用卡片光斑、3D 倾斜、数字滚动等动效。长时间盯盘或低配设备可关闭，切换会立即生效。
              </p>
              <label className="checkbox-field" style={{ marginTop: 8 }}>
                <span>关闭所有动效（等同 prefers-reduced-motion）</span>
                <input
                  type="checkbox"
                  checked={motionDisabled}
                  onChange={(event) => {
                    const enabled = !event.target.checked;
                    setMotionDisabled(!enabled);
                    setMotionPreference(enabled);
                  }}
                />
              </label>
            </div>

            <div className="sub-actions">
              <button className="mini-text-button" type="button" onClick={() => void bindIpOnly()}>
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
    </AppShell>
  );
}

function AppRouter() {
  const hash = useSyncExternalStore(subscribeHash, getHash, () => "");
  if (hash === "#playground") return <Playground />;
  return <App />;
}

export default AppRouter;
