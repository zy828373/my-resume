import type { AnalysisResponse, HistoryPlaybackResponse, HolderDrilldownResponse } from "../../types";
import {
  EChartPanel,
  buildHistoryOption,
  buildKdjOption,
  buildMacdOption,
  buildPriceOption,
} from "../charts";
import { EmptyBox } from "../primitives/EmptyBox";
import { SignalPill } from "../primitives/SignalPill";
import { SpotlightCard } from "../primitives/SpotlightCard";
import { StaggerItem, StaggerList } from "../primitives/StaggerList";
import { FactorCard } from "../cards/FactorCard";
import { HeroCard } from "../cards/HeroCard";
import { HolderSeatCard } from "../cards/HolderSeatCard";
import { StrategySummaryCard } from "../cards/StrategySummaryCard";
import { formatDateTime, formatMoney, formatPercent } from "../../utils/format";
import {
  earlyAccumulationLabel,
  llmDecisionLabel,
  llmRegimeLabel,
  pushSignalTone,
  strategyTone,
  teamStatusLabel,
  teamStatusTone,
} from "../../utils/tone";

type Holder = AnalysisResponse["holderInsights"][number];
type Factor = AnalysisResponse["reasoning"][number];

function factorTone(factor: Factor): "positive" | "negative" | "neutral" {
  if (factor.tone === "positive") return "positive";
  if (factor.tone === "negative") return "negative";
  return "neutral";
}

export interface WatchlistAnalysisProps {
  analysis: AnalysisResponse | null;
  historyPlayback: HistoryPlaybackResponse | null;
  holderDetail: HolderDrilldownResponse | null;
  onOpenHolderDetail: (holder: Holder) => void;
  loading: boolean;
  isSwitchPending: boolean;
  analysisSyncing: boolean;
}

export function WatchlistAnalysis({
  analysis,
  historyPlayback,
  holderDetail,
  onOpenHolderDetail,
  loading,
  isSwitchPending,
  analysisSyncing,
}: WatchlistAnalysisProps) {
  if (!analysis) {
    return (
      <section className="center-column">
        <section className="panel panel-fill empty-panel">
          <strong>
            {loading ? "正在拉取饰品分析..." : "先从左侧监控池选择一个饰品"}
          </strong>
          <p>如果还没有配置 ApiToken，请先打开“数据源设置”。</p>
        </section>
      </section>
    );
  }

  const tone = strategyTone(analysis.strategy.tone);
  const teamTone = teamStatusTone(analysis.marketContext.teamSignal.status);

  return (
    <section className="center-column">
      <HeroCard
        analysis={analysis}
        switching={isSwitchPending}
        loading={loading}
        syncing={analysisSyncing}
      />

      <section className="insight-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>交易策略</h2>
              <p>把建仓评分、跑路风险和 7 天锁仓约束整合成动作建议</p>
            </div>
            <SignalPill tone={tone}>{analysis.strategy.action}</SignalPill>
          </div>

          <StrategySummaryCard tone={tone} title={analysis.strategy.action} shine={tone === "positive"}>
            <p>{analysis.strategy.actionSummary}</p>
          </StrategySummaryCard>

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
            <strong>
              {teamTone === "positive"
                ? "团队侧偏建仓"
                : teamTone === "negative"
                  ? "团队侧偏撤退"
                  : "团队侧中性"}
            </strong>
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

          <StaggerList
            as="div"
            className="reasoning-grid"
            key={`reasoning-${analysis.item.goodId}`}
          >
            {analysis.reasoning.map((factor) => (
              <StaggerItem key={factor.title}>
                <FactorCard
                  label={factor.title}
                  value={factor.value}
                  detail={factor.detail}
                  tone={factorTone(factor)}
                />
              </StaggerItem>
            ))}
          </StaggerList>
        </article>
      </section>

      <section className="insight-grid">
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2>提前建仓侦测</h2>
              <p>优先抓少数席位先堆仓、价格尚未暴力拉升的标的</p>
            </div>
            <SignalPill tone={pushSignalTone(analysis.pushSignal.level)}>
              {earlyAccumulationLabel(analysis.earlyAccumulation.state)}
            </SignalPill>
          </div>

          <StrategySummaryCard tone={tone} title={analysis.earlyAccumulation.title}>
            <p>{analysis.earlyAccumulation.detail}</p>
            <div className="delta-row">
              <span>侦测分 {analysis.earlyAccumulation.score}</span>
              <span>
                建仓席位 {analysis.earlyAccumulation.detectedBuilders}
              </span>
              <span>
                覆盖占比{" "}
                {formatPercent(analysis.earlyAccumulation.totalTrackedSharePct, 2)}
              </span>
            </div>
          </StrategySummaryCard>

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

          <StaggerList
            as="div"
            className="holder-insight-list"
            key={`holder-insights-${analysis.item.goodId}`}
          >
            {analysis.holderInsights.slice(0, 6).map((holder) => (
              <StaggerItem key={`${holder.steamId ?? holder.steamName}`}>
                <HolderSeatCard
                  holder={holder}
                  isActive={holderDetail?.holder.taskId === holder.taskId}
                  onOpen={onOpenHolderDetail}
                />
              </StaggerItem>
            ))}
          </StaggerList>
        </article>
      </section>

      <section className="panel ai-panel">
        <div className="panel-header">
          <div>
            <h2>AI 辅助研判</h2>
            <p>用本地 gpt-5.4 对规则引擎、持仓和 7 天锁仓窗口做二次解释</p>
          </div>
          <SignalPill tone={analysis.llm.status === "ok" ? "positive" : "warning"}>
            {llmDecisionLabel(analysis.llm.alertDecision)}
          </SignalPill>
        </div>

        <div className="ai-grid">
          <StrategySummaryCard
            tone={analysis.llm.status === "ok" ? "positive" : "neutral"}
            title={llmRegimeLabel(analysis.llm.regime)}
          >
            <p>{analysis.llm.summary}</p>
            <div className="delta-row">
              <span>模型 {analysis.llm.model}</span>
              <span>置信度 {analysis.llm.confidence ?? "--"}%</span>
              <span>
                下次检查 {analysis.llm.nextCheckMinutes ?? "--"} 分钟
              </span>
            </div>
          </StrategySummaryCard>

          <div className="ai-metric-grid">
            <FactorCard
              label="AI 建仓强度"
              value={analysis.llm.buildSignalStrength ?? "--"}
              detail="结合规则分、持仓和冷却期后的综合判断。"
              tone="positive"
            />
            <FactorCard
              label="AI 跑路强度"
              value={analysis.llm.dumpSignalStrength ?? "--"}
              detail="更强调价差、卖压、持仓回落与供给扩张。"
              tone="negative"
            />
            <FactorCard
              label="团队行为状态"
              value={teamStatusLabel(analysis.marketContext.teamSignal.status)}
              detail={analysis.marketContext.teamSignal.summary}
              tone={teamTone}
            />
            <FactorCard
              label="AI 7天区间"
              value={
                <>
                  {formatPercent(analysis.llm.expected7dRange.lowPct, 1)} /{" "}
                  {formatPercent(analysis.llm.expected7dRange.basePct, 1)} /{" "}
                  {formatPercent(analysis.llm.expected7dRange.highPct, 1)}
                </>
              }
              detail="低 / 中 / 高三档预期，用来校验规则引擎的 7 天卖出带。"
            />
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
              <span>
                最近快照 {formatDateTime(historyPlayback.latestAt)}
              </span>
              <span>
                卖压{" "}
                {historyPlayback.points.at(-1)?.sellPressure != null
                  ? `${historyPlayback.points.at(-1)?.sellPressure?.toFixed(2)}x`
                  : "--"}
              </span>
              <span>
                BUFF {formatMoney(historyPlayback.points.at(-1)?.buffClose ?? null)}
              </span>
              <span>
                悠悠 {formatMoney(historyPlayback.points.at(-1)?.yyypClose ?? null)}
              </span>
            </div>
            <EChartPanel option={buildHistoryOption(historyPlayback)} height={220} />
          </>
        ) : (
          <EmptyBox slim title="历史快照还不够">
            <p>让后台多跑几轮自动刷新后，这里会回放价格和卖压轨迹。</p>
          </EmptyBox>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>CSFloat 在售补充</h2>
            <p>补充全球市场的公开在售样本，关注 float、模板和卖家分布</p>
          </div>
          <SignalPill tone={analysis.csfloat.enabled ? "positive" : "warning"}>
            {analysis.csfloat.enabled
              ? `${analysis.csfloat.listingCount} 条在售`
              : "暂未接通"}
          </SignalPill>
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
            <strong>
              {analysis.csfloat.bestFloat != null
                ? analysis.csfloat.bestFloat.toFixed(4)
                : "--"}
            </strong>
          </div>
          <div className="book-row">
            <span>查询名</span>
            <strong>{analysis.csfloat.marketHashName ?? "--"}</strong>
          </div>
        </div>

        <div className="reason-item">{analysis.csfloat.limitation}</div>

        <StaggerList
          as="div"
          className="holder-insight-list compact-list"
          key={`csfloat-${analysis.csfloat.samples.length}`}
        >
          {analysis.csfloat.samples.map((sample) => (
            <StaggerItem key={sample.listingId}>
              <SpotlightCard
                as="article"
                className="holder-insight-card neutral"
                color="var(--spot-blue)"
              >
                <div className="holder-insight-head">
                  <strong>{sample.sellerName}</strong>
                  <span className="muted-tag">Seed {sample.paintSeed ?? "--"}</span>
                </div>
                <div className="delta-row">
                  <span>价格 {formatMoney(sample.price)}</span>
                  <span>
                    Float{" "}
                    {sample.floatValue != null ? sample.floatValue.toFixed(4) : "--"}
                  </span>
                  <span>{sample.sellerSteamId ?? "未公开 SteamID"}</span>
                </div>
              </SpotlightCard>
            </StaggerItem>
          ))}
        </StaggerList>
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
            <SignalPill tone={analysis.indicators.macd.signal === "buy" ? "buy" : "sell"}>
              {analysis.indicators.macd.signal === "buy"
                ? "偏多"
                : "偏空"}
            </SignalPill>
          </div>
          <EChartPanel option={buildMacdOption(analysis)} height={180} />
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>KDJ</h2>
              <p>{analysis.indicators.kdj.summary}</p>
            </div>
            <SignalPill
              tone={
                analysis.indicators.kdj.signal === "buy"
                  ? "buy"
                  : analysis.indicators.kdj.signal === "sell"
                    ? "sell"
                    : "warning"
              }
            >
              {analysis.indicators.kdj.signal === "buy"
                ? "偏多"
                : analysis.indicators.kdj.signal === "sell"
                  ? "偏空"
                  : "观望"}
            </SignalPill>
          </div>
          <EChartPanel option={buildKdjOption(analysis)} height={180} />
        </section>
      </div>
    </section>
  );
}
