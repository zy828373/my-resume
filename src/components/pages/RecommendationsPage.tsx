import type { Dispatch, SetStateAction } from "react";
import type {
  ConfigResponse,
  RecommendationResponse,
  RecommendationScopeKey,
  StickerSeriesKey,
} from "../../types";
import type { ScannerForm } from "../../hooks/useConfig";
import { AuroraBackground } from "../primitives/AuroraBackground";
import { EmptyBox } from "../primitives/EmptyBox";
import { MagneticButton } from "../primitives/MagneticButton";
import { SignalPill } from "../primitives/SignalPill";
import { SpotlightCard } from "../primitives/SpotlightCard";
import { StaggerItem, StaggerList } from "../primitives/StaggerList";
import { StatusPill } from "../layout/StatusPill";
import { BoardSummaryCard } from "../cards/BoardSummaryCard";
import { MiniRecommendCard } from "../cards/MiniRecommendCard";
import { RecommendationFilterCard } from "../cards/RecommendationFilterCard";
import { ScannerCard } from "../cards/ScannerCard";
import { SpotlightRecommendCard } from "../cards/SpotlightRecommendCard";
import { StageMetricCard } from "../cards/StageMetricCard";
import { StageNoteCard } from "../cards/StageNoteCard";
import { StageStreamCard } from "../cards/StageStreamCard";
import { formatDateTime, formatPercent } from "../../utils/format";
import {
  recommendationTypeLabel,
  shouldShowMarketHashAlias,
} from "../../utils/tone";

type RecommendationCard = RecommendationResponse["positive"][number];
type Board = RecommendationResponse["boards"][number];

const ANALYSIS_SCOPE_OPTIONS: Array<{
  key: RecommendationScopeKey;
  label: string;
  hint: string;
}> = [
  { key: "agent", label: "探员板块", hint: "大行动探员、题材轮动" },
  { key: "holo_team_sticker", label: "全息战队贴纸", hint: "按年份/赛事细分" },
  { key: "gun_skin", label: "枪皮板块", hint: "普通非 ST，供给分级" },
  { key: "discontinued_collection_skin", label: "绝版收藏品枪皮", hint: "大行动/稀有来源" },
  { key: "knife_glove", label: "刀手套", hint: "低流通高单价" },
  { key: "covert_tradeup", label: "红皮炼金", hint: "EV 数据不足先降级" },
  { key: "weapon_case", label: "武器箱", hint: "仅保留稀有/停产候选" },
  { key: "capsule", label: "胶囊", hint: "看消耗和内含贴纸" },
  { key: "collectible", label: "收藏品", hint: "稀缺叙事和成交" },
];

const HOLO_SERIES_OPTIONS: Array<{ key: StickerSeriesKey; label: string }> = [
  { key: "stockholm_2021", label: "Stockholm 2021" },
  { key: "antwerp_2022", label: "Antwerp 2022" },
  { key: "rio_2022", label: "Rio 2022" },
  { key: "paris_2023", label: "Paris 2023" },
  { key: "copenhagen_2024", label: "Copenhagen 2024" },
  { key: "shanghai_2024", label: "Shanghai 2024" },
  { key: "other", label: "其他年份" },
];

const POOL_LABELS = {
  candidate_core: "核心候选",
  candidate_low_weight: "低权重候选",
  watchlist: "观察池",
  risk_only: "仅风险",
  excluded: "已剔除",
} as const;

function poolLabel(pool: RecommendationCard["autonomousPool"]["pool"]) {
  return POOL_LABELS[pool] ?? pool;
}

export interface RecommendationsPageProps {
  config: ConfigResponse | null;
  recommendations: RecommendationResponse | null;
  recommendationsLoading: boolean;
  scannerForm: ScannerForm;
  setScannerForm: Dispatch<SetStateAction<ScannerForm>>;

  // scanner-derived scalars
  scannerStateText: string;
  scannerWindowLabel: string;
  actionableRecommendationCount: number;
  minimumRecommendationCount: number;
  recommendationLimit: number;
  featuredLimit: number;

  // filter
  boards: Board[];
  boardKey: string;
  segmentKey: string;
  activeBoard: Board | null;
  onBoardChange: (key: string) => void;
  onSegmentChange: (key: string) => void;

  // data
  topRecommendedCards: RecommendationCard[];
  rotatingCards: RecommendationCard[];
  recommendationFocusCards: RecommendationCard[];
  watchPreviewCards: RecommendationCard[];
  riskPreviewCards: RecommendationCard[];
  filteredWatchCount: number;
  filteredRiskCount: number;

  // actions
  onContinueScan: () => void;
  onResetScan: () => void;
  onSyncScan: () => void;
  onSaveScannerConfig: () => void;
  onOpenItem: (goodId: string) => void;
}

function toNumber(value: string | number | null | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toggleSelectedValue<T extends string>(values: T[], value: T) {
  if (values.includes(value)) {
    return values.length > 1 ? values.filter((item) => item !== value) : values;
  }
  return [...values, value];
}

function ScannerNumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field-block">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function RecommendationsPage({
  config,
  recommendations,
  recommendationsLoading,
  scannerForm,
  setScannerForm,
  scannerStateText,
  scannerWindowLabel,
  actionableRecommendationCount,
  minimumRecommendationCount,
  recommendationLimit,
  featuredLimit,
  boards,
  boardKey,
  segmentKey,
  activeBoard,
  onBoardChange,
  onSegmentChange,
  topRecommendedCards,
  rotatingCards,
  recommendationFocusCards,
  watchPreviewCards,
  riskPreviewCards,
  filteredWatchCount,
  filteredRiskCount,
  onContinueScan,
  onResetScan,
  onSyncScan,
  onSaveScannerConfig,
  onOpenItem,
}: RecommendationsPageProps) {
  const scannerStatus = recommendations?.scanner ?? null;
  const scannerMaxRounds = toNumber(
    scannerStatus?.maxRoundsPerCycle ?? scannerForm.maxRoundsPerCycle,
    config?.scanner?.maxRoundsPerCycle ?? 15,
  );
  const scannerCompletedRounds = Math.min(
    scannerMaxRounds,
    Math.max(0, scannerStatus?.completedRoundsInCycle ?? 0),
  );
  const scannerProgressPct =
    scannerMaxRounds > 0 ? Math.round((scannerCompletedRounds / scannerMaxRounds) * 100) : 0;
  const scannerProgressText = !scannerForm.enabled
    ? "扫描器已关闭"
    : !scannerStatus
      ? "等待首次扫描"
      : scannerStatus.autofilling
        ? "自动补扫中"
        : scannerStatus.paused
          ? "本轮已暂停"
          : "按窗口筛选中";
  const selectedScopeLabels = ANALYSIS_SCOPE_OPTIONS.filter((option) =>
    scannerForm.analysisScopes.includes(option.key),
  ).map((option) => option.label);
  const hasHoloScope = scannerForm.analysisScopes.includes("holo_team_sticker");
  const preFilter = scannerStatus?.preFilter ?? null;
  const rejectReasons = preFilter
    ? Object.entries(preFilter.rejectReasonCounts)
        .sort((left, right) => right[1] - left[1])
        .slice(0, 4)
    : [];
  const poolDistribution = preFilter?.poolDistribution ?? null;
  const hasNotes =
    (scannerStatus &&
      actionableRecommendationCount < minimumRecommendationCount &&
      !scannerStatus.paused) ||
    (scannerStatus?.lastBatchCandidates?.length ?? 0) > 0 ||
    Boolean(scannerStatus?.fallbackSource) ||
    Boolean(preFilter?.candidateShortage);

  return (
    <>
      <section className="panel recommendation-stage">
        <AuroraBackground intensity="soft">
          <div className="recommendation-stage-top" style={{ padding: "4px 0" }}>
            <div className="recommendation-stage-copy">
              <span className="stage-eyebrow">Autonomous Recommendation Deck</span>
              <h2>自主推荐工作台</h2>
              <p>
                先用板块过滤收窄范围，再看当前扫描状态和这一轮最值得优先处理的推荐焦点。
              </p>
            </div>
            <div className="recommendation-stage-actions">
              <StatusPill wide>{scannerStateText}</StatusPill>
              <MagneticButton
                className="ghost-button"
                type="button"
                disabled={!config?.configured || recommendationsLoading}
                onClick={onContinueScan}
              >
                {scannerStatus?.paused ? "继续分析推品" : "手动推进一轮"}
              </MagneticButton>
              <MagneticButton
                className="ghost-button danger-button"
                type="button"
                disabled={!config?.configured || recommendationsLoading}
                onClick={onResetScan}
              >
                清空重新分析
              </MagneticButton>
            </div>
          </div>
        </AuroraBackground>

        <RecommendationFilterCard
          boards={boards}
          boardKey={boardKey}
          segmentKey={segmentKey}
          activeBoard={activeBoard}
          onBoardChange={onBoardChange}
          onSegmentChange={onSegmentChange}
        />

        <section className="scanner-inline-panel">
          <div className="scanner-inline-head">
            <div>
              <strong>自主推荐池扫描参数</strong>
              <p>
                直接在推荐池里调整筛选窗口、抽样深度和循环轮数，保存后会从最新参数重新推进。
              </p>
            </div>
            <span className="muted-tag">{scannerProgressText}</span>
          </div>

          <div className="scanner-progress-panel">
            <div className="scanner-progress-copy">
              <span>
                筛选过程 {scannerCompletedRounds}/{scannerMaxRounds} 轮
              </span>
              <strong>{scannerProgressPct}%</strong>
            </div>
            <div
              className="scanner-progress-track"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={scannerProgressPct}
            >
              <span style={{ width: `${scannerProgressPct}%` }} />
            </div>
            <div className="scanner-progress-meta">
              <span>当前窗口 {scannerWindowLabel}</span>
              <span>已抽样 {scannerStatus?.scannedCandidateCount ?? 0}</span>
              <span>深度分析 {scannerStatus?.deepAnalyzedCount ?? 0}</span>
              <span>推荐池 {scannerStatus?.poolSize ?? topRecommendedCards.length}</span>
              <span>剩余 {scannerStatus?.roundsRemaining ?? scannerMaxRounds} 轮</span>
            </div>
          </div>

          <div className="scanner-summary-grid scanner-summary-grid-wide">
            <ScannerCard
              label="预筛原始候选"
              value={preFilter?.rawCandidateCount ?? 0}
              hint={`候选页 ${scannerStatus?.candidatePages ?? config?.scanner?.candidatePages ?? 2} / 每页 ${scannerStatus?.candidatePageSize ?? config?.scanner?.candidatePageSize ?? 24}`}
            />
            <ScannerCard
              label="预筛通过"
              value={preFilter?.acceptedCandidateCount ?? 0}
              hint={`本轮抽样 ${preFilter?.sampledCandidateCount ?? 0} 个`}
              color="var(--spot-accent)"
            />
            <ScannerCard
              label="预筛剔除"
              value={preFilter?.rejectedCandidateCount ?? 0}
              hint={
                rejectReasons.length
                  ? rejectReasons.map(([reason, count]) => `${reason} ${count}`).join(" / ")
                  : "暂无剔除原因"
              }
              color="var(--spot-danger)"
            />
            <ScannerCard
              label="池子分布"
              display={
                poolDistribution
                  ? `${poolDistribution.candidate_core}/${poolDistribution.candidate_low_weight}/${poolDistribution.watchlist}/${poolDistribution.risk_only}/${poolDistribution.excluded}`
                  : "0/0/0/0/0"
              }
              hint="核心 / 低权重 / 观察 / 风险 / 剔除"
              color="var(--spot-blue)"
            />
          </div>

          <div className="scanner-scope-panel">
            <div className="scanner-scope-head">
              <div>
                <strong>筛选分析范围</strong>
                <p>这里控制扫描器先抽哪些板块，不只是结果展示过滤。</p>
              </div>
              <span className="muted-tag">
                {selectedScopeLabels.join(" / ") || "未选择范围"}
              </span>
            </div>
            <div className="chip-row compact">
              {ANALYSIS_SCOPE_OPTIONS.map((option) => {
                const active = scannerForm.analysisScopes.includes(option.key);
                return (
                  <button
                    className={`filter-chip scope-chip ${active ? "active" : ""}`.trim()}
                    key={option.key}
                    type="button"
                    onClick={() =>
                      setScannerForm((current) => ({
                        ...current,
                        analysisScopes: toggleSelectedValue(
                          current.analysisScopes,
                          option.key,
                        ),
                      }))
                    }
                  >
                    {option.label}
                    <span>{option.hint}</span>
                  </button>
                );
              })}
            </div>
            {hasHoloScope ? (
              <div className="scanner-series-block">
                <span className="stage-filter-label">全息战队贴纸年份</span>
                <div className="chip-row compact secondary">
                  {HOLO_SERIES_OPTIONS.map((option) => {
                    const active = scannerForm.holoStickerSeries.includes(option.key);
                    return (
                      <button
                        className={`filter-chip ${active ? "active" : ""}`.trim()}
                        key={option.key}
                        type="button"
                        onClick={() =>
                          setScannerForm((current) => ({
                            ...current,
                            holoStickerSeries: toggleSelectedValue(
                              current.holoStickerSeries,
                              option.key,
                            ),
                          }))
                        }
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <div className="scanner-form-grid scanner-inline-form">
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
            <ScannerNumberField
              label="候选页数"
              value={scannerForm.candidatePages}
              min={1}
              max={6}
              onChange={(value) =>
                setScannerForm((current) => ({ ...current, candidatePages: value }))
              }
            />
            <ScannerNumberField
              label="每页候选"
              value={scannerForm.candidatePageSize}
              min={12}
              max={36}
              onChange={(value) =>
                setScannerForm((current) => ({ ...current, candidatePageSize: value }))
              }
            />
            <ScannerNumberField
              label="热门窗口"
              value={scannerForm.hotWindowSize}
              min={10}
              max={60}
              onChange={(value) =>
                setScannerForm((current) => ({ ...current, hotWindowSize: value }))
              }
            />
            <ScannerNumberField
              label="随机抽样"
              value={scannerForm.randomSampleSize}
              min={4}
              max={20}
              onChange={(value) =>
                setScannerForm((current) => ({ ...current, randomSampleSize: value }))
              }
            />
            <ScannerNumberField
              label="每轮深度分析"
              value={scannerForm.deepAnalyzeLimit}
              min={3}
              max={20}
              onChange={(value) =>
                setScannerForm((current) => ({ ...current, deepAnalyzeLimit: value }))
              }
            />
            <ScannerNumberField
              label="前十五上限"
              value={scannerForm.recommendationLimit}
              min={6}
              max={20}
              onChange={(value) =>
                setScannerForm((current) => ({ ...current, recommendationLimit: value }))
              }
            />
            <ScannerNumberField
              label="轮播数量"
              value={scannerForm.featuredLimit}
              min={3}
              max={6}
              onChange={(value) =>
                setScannerForm((current) => ({ ...current, featuredLimit: value }))
              }
            />
            <ScannerNumberField
              label="循环轮数"
              value={scannerForm.maxRoundsPerCycle}
              min={1}
              max={30}
              onChange={(value) =>
                setScannerForm((current) => ({ ...current, maxRoundsPerCycle: value }))
              }
            />
          </div>

          <div className="scanner-inline-actions">
            <MagneticButton
              className="primary-button"
              type="button"
              disabled={!config?.configured || recommendationsLoading}
              onClick={onSaveScannerConfig}
            >
              保存扫描设置
            </MagneticButton>
          </div>
        </section>

        <div className="recommendation-stage-metrics">
          <StageMetricCard
            label="当前窗口"
            display={scannerWindowLabel}
            hint={`热门窗口 ${scannerStatus?.hotWindowSize ?? config?.scanner?.hotWindowSize ?? 20} 个`}
          />
          <StageMetricCard
            label="轮次进度"
            display={`${scannerStatus?.completedRoundsInCycle ?? 0}/${scannerStatus?.maxRoundsPerCycle ?? config?.scanner?.maxRoundsPerCycle ?? 15}`}
            hint={`剩余 ${scannerStatus?.roundsRemaining ?? config?.scanner?.maxRoundsPerCycle ?? 15} 次`}
          />
          <StageMetricCard
            label="候选与抽样"
            value={scannerStatus?.scannedCandidateCount ?? 0}
            hint={`本轮抽样 ${scannerStatus?.randomSampleSize ?? config?.scanner?.randomSampleSize ?? 10} 个`}
          />
          <StageMetricCard
            label="推荐池深度"
            value={topRecommendedCards.length}
            hint={`深度分析 ${scannerStatus?.deepAnalyzedCount ?? 0} 个`}
          />
        </div>

        {hasNotes ? (
          <div className="recommendation-stage-notes">
            {scannerStatus &&
            actionableRecommendationCount < minimumRecommendationCount &&
            !scannerStatus.paused ? (
              <StageNoteCard
                title={
                  scannerStatus.autofilling ? "正在自动补扫候选" : "准备补扫候选"
                }
              >
                当前仅有 {actionableRecommendationCount} 个可推荐候选，系统会继续推进窗口，直到至少补出 {minimumRecommendationCount} 个候选或本轮循环耗尽。
              </StageNoteCard>
            ) : null}

            {preFilter?.candidateShortage ? (
              <StageNoteCard title="候选不足" tone="warning">
                {preFilter.shortageReason ?? "预筛后候选不足，系统没有回退低质量候选。"}
              </StageNoteCard>
            ) : null}

            {scannerStatus?.lastBatchCandidates?.length ? (
              <StageNoteCard title="上一轮抽样">
                {scannerStatus.lastBatchCandidates.join(" / ")}
              </StageNoteCard>
            ) : null}

            {scannerStatus?.fallbackSource ? (
              <StageNoteCard title="候选池回退" tone="warning">
                {scannerStatus.fallbackSource}
              </StageNoteCard>
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
              <span className="muted-tag">
                {recommendationFocusCards.length} 张焦点卡
              </span>
            </div>

            <div className="spotlight-card-grid">
              {recommendationFocusCards.map((card, index) => (
                <SpotlightRecommendCard
                  key={`spotlight-${card.goodId}`}
                  card={card}
                  rank={index + 1}
                  onOpen={onOpenItem}
                />
              ))}
              {recommendationFocusCards.length === 0 ? (
                <div className="recommend-empty">
                  <strong>当前还没有命中推荐</strong>
                  <p>先让扫描器至少跑完一轮，再看哪些标的进入前排。</p>
                </div>
              ) : null}
            </div>
          </section>

          <aside className="stage-side-rail">
            <StageStreamCard
              title="提前观察"
              hint="刚起势但还没完全走出来的标的。"
              count={filteredWatchCount}
            >
              <StaggerList as="div" className="mini-recommend-list" key={`watch-${watchPreviewCards.length}`}>
                {watchPreviewCards.map((card) => (
                  <StaggerItem key={`watch-preview-${card.goodId}`}>
                    <MiniRecommendCard card={card} variant="watch" onOpen={onOpenItem} />
                  </StaggerItem>
                ))}
                {watchPreviewCards.length === 0 ? (
                  <div className="recommend-empty compact">
                    <strong>当前没有提前观察项</strong>
                    <p>这一轮还没看到明显转强但尚未爆发的标的。</p>
                  </div>
                ) : null}
              </StaggerList>
            </StageStreamCard>

            <StageStreamCard
              title="风险回避"
              hint="优先提醒需要减仓或回避的高风险信号。"
              count={filteredRiskCount}
            >
              <StaggerList as="div" className="mini-recommend-list" key={`risk-${riskPreviewCards.length}`}>
                {riskPreviewCards.map((card) => (
                  <StaggerItem key={`risk-preview-${card.goodId}`}>
                    <MiniRecommendCard card={card} variant="risk" onOpen={onOpenItem} />
                  </StaggerItem>
                ))}
                {riskPreviewCards.length === 0 ? (
                  <div className="recommend-empty compact">
                    <strong>当前没有高风险回避项</strong>
                    <p>当前没有需要你优先避开的强风险标的。</p>
                  </div>
                ) : null}
              </StaggerList>
            </StageStreamCard>
          </aside>
        </div>
      </section>

      <main className="page-layout recommendation-page">
        <section className="panel recommendation-panel">
          <div className="panel-header">
            <div>
              <h2>自主推荐前十五</h2>
              <p>
                按建仓推荐评分从高到低展示当前最值得跟踪的前十五个标的，前三名会作为轮播焦点持续刷新。
              </p>
            </div>
            <div className="toolbar-actions">
              <span className="muted-tag">
                {topRecommendedCards.length} / {recommendationLimit}
              </span>
              <MagneticButton
                className="ghost-button"
                type="button"
                disabled={!config?.configured || recommendationsLoading}
                onClick={onSyncScan}
              >
                同步当前结果
              </MagneticButton>
            </div>
          </div>

          <div className="scanner-summary-grid scanner-summary-grid-wide">
            <ScannerCard
              label="前三轮播焦点"
              value={rotatingCards.length}
              hint={`默认取前 ${featuredLimit} 个推荐标的`}
            />
            <ScannerCard
              label="热门窗口"
              value={
                scannerStatus?.hotWindowSize ?? config?.scanner?.hotWindowSize ?? 20
              }
              hint={`当前窗口 ${scannerWindowLabel}`}
            />
            <ScannerCard
              label="随机抽样"
              value={
                scannerStatus?.randomSampleSize ?? config?.scanner?.randomSampleSize ?? 10
              }
              hint={`上一轮时间 ${formatDateTime(scannerStatus?.lastRoundAt)}`}
            />
            <ScannerCard
              label="循环进度"
              value={scannerStatus?.completedRoundsInCycle ?? 0}
              hint={
                scannerStatus?.paused ? "已暂停，等待继续" : "仍在自动推进"
              }
            />
          </div>

          <StaggerList
            as="div"
            className="holder-insight-list"
            key={`top-${topRecommendedCards.length}`}
          >
            {topRecommendedCards.map((card, index) => {
              const tone =
                card.recommendationType === "risk_avoid"
                  ? "negative"
                  : card.recommendationType === "early_build" ||
                      card.recommendationType === "bottom_reversal"
                    ? "positive"
                    : "neutral";
              const pillTone =
                card.recommendationType === "risk_avoid"
                  ? "negative"
                  : card.recommendationType === "early_build" ||
                      card.recommendationType === "bottom_reversal"
                    ? "positive"
                    : "warning";
              const spotColor =
                tone === "positive"
                  ? "var(--spot-accent)"
                  : tone === "negative"
                    ? "var(--spot-danger)"
                    : "var(--spot-blue)";
              return (
                <StaggerItem key={`featured-${card.goodId}`}>
                  <SpotlightCard
                    as="button"
                    type="button"
                    className={`holder-insight-card ${tone}`}
                    color={spotColor}
                    onClick={() => onOpenItem(card.goodId)}
                  >
                    <div className="holder-insight-head">
                      <div>
                        <strong>
                          #{index + 1} {card.name}
                        </strong>
                        {shouldShowMarketHashAlias(card.name, card.marketHashName) ? (
                          <small className="item-market-hash">{card.marketHashName}</small>
                        ) : null}
                      </div>
                      <SignalPill tone={pillTone}>
                        {recommendationTypeLabel(card.recommendationType)}
                      </SignalPill>
                      <SignalPill tone={card.autonomousPool.pool === "risk_only" ? "negative" : "positive"}>
                        {poolLabel(card.autonomousPool.pool)}
                      </SignalPill>
                    </div>
                    <div className="delta-row">
                      <span>建仓推荐 {card.entryScore}</span>
                      <span>综合 {card.score}</span>
                      <span>准入 {card.autonomousPool.admissionScore}</span>
                      <span>供给 {card.autonomousPool.supplyGrade}</span>
                      <span>题材 {card.hypeFitScore}</span>
                      <span>7天 {formatPercent(card.expected7dPct, 1)}</span>
                    </div>
                    <p className="holder-insight-note">{card.reason}</p>
                    <div className="chip-row secondary">
                      {[...(card.hypeTags ?? []), ...(card.triggerTags ?? [])]
                        .concat(card.autonomousPool.keepReasons ?? [])
                        .concat(card.autonomousPool.downgradeReasons ?? [])
                        .concat(card.autonomousPool.excludeReasons ?? [])
                        .concat(card.autonomousPool.riskTags ?? [])
                        .slice(0, 5)
                        .map((tag) => (
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
                      {(card.dataPoints ?? []).slice(0, 3).join(" / ") ||
                        "等待这一轮细分信号回填"}
                    </p>
                  </SpotlightCard>
                </StaggerItem>
              );
            })}
            {topRecommendedCards.length === 0 ? (
              <EmptyBox slim title="推荐池正在回填">
                <p>扫描会受 CSQAQ 限频影响，先让扫描器跑完一轮，前十五会自动补齐。</p>
              </EmptyBox>
            ) : null}
          </StaggerList>
        </section>

        <aside className="panel panel-fill">
          <div className="panel-header">
            <div>
              <h2>扫描侧写</h2>
              <p>
                这里会告诉你当前推荐池是从哪一段热门窗口里抽出来的，以及这轮候选是怎么跑的。
              </p>
            </div>
          </div>

          <div className="board-summary-grid">
            <BoardSummaryCard
              label="候选来源"
              display={scannerStatus?.source ?? "scanner"}
              hint={
                scannerStatus?.fallbackSource
                  ? "热门榜不可用，已回退公开列表"
                  : "优先使用热门榜窗口"
              }
            />
            <BoardSummaryCard
              label="累计候选"
              value={scannerStatus?.scannedCandidateCount ?? 0}
              hint={`推荐池保留 ${scannerStatus?.poolSize ?? 0} 个合格标的`}
            />
            <BoardSummaryCard
              label="深度分析"
              value={scannerStatus?.deepAnalyzedCount ?? 0}
              hint={`每轮最多 ${config?.scanner?.deepAnalyzeLimit ?? 15} 个`}
            />
          </div>

          {scannerStatus?.lastBatchCandidates?.length ? (
            <div className="board-spotlight">
              <strong>当前轮次抽样</strong>
              <p>{scannerStatus.lastBatchCandidates.join(" / ")}</p>
            </div>
          ) : null}

          <div className="board-summary-grid">
            {boards.map((board) => (
              <BoardSummaryCard
                key={`board-summary-${board.key}`}
                label={board.label}
                value={board.count}
                hint={
                  (board.segments ?? [])
                    .slice(0, 2)
                    .map((segment) => `${segment.label} ${segment.count}`)
                    .join(" / ") || "暂无细分命中"
                }
                color="var(--spot-accent)"
              />
            ))}
          </div>

          <div className="board-spotlight">
            <strong>当前规则重点</strong>
            <p>
              当前扫描范围：{selectedScopeLabels.join(" / ")}。优先普通非 ST/纪念品枪皮、2k-4w 存世、FN/MW/FT、绝版/大行动来源、全息战队贴纸和探员题材；非全息或疑似选手签名贴纸不会进入推荐池。
            </p>
          </div>
        </aside>
      </main>
    </>
  );
}
