import type { ReactNode } from "react";
import type { HealthResponse, RefreshRuntimeStatus } from "../../types";
import { EmptyBox } from "../primitives/EmptyBox";
import { formatDateTime } from "../../utils/format";

export interface HealthPageProps {
  healthStatus: HealthResponse | null;
  healthStatusLoading: boolean;
  healthStatusError: string | null;
  healthStatusStale: boolean;
  onRefresh: () => void;
}

type StatusTone = "positive" | "warning" | "negative" | "neutral";

function yesNo(value: boolean) {
  return value ? "已启用" : "未启用";
}

function formatLatest(value: string | null) {
  return value ? formatDateTime(value) : "--";
}

function autoRefreshTone(status: RefreshRuntimeStatus): StatusTone {
  if (status.lastError) return "negative";
  if (status.running) return "warning";
  return status.enabled ? "positive" : "neutral";
}

function scannerTone(scanner: HealthResponse["scanner"]): StatusTone {
  if (scanner.paused) return "warning";
  return scanner.enabled ? "positive" : "neutral";
}

function HealthStatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint: ReactNode;
}) {
  return (
    <article className="scanner-card">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

export function HealthPage({
  healthStatus,
  healthStatusLoading,
  healthStatusError,
  healthStatusStale,
  onRefresh,
}: HealthPageProps) {
  return (
    <main className="page-layout health-layout">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>运行健康状态</h2>
            <p>集中查看服务、数据源、快照、自动刷新和扫描器的当前状态。</p>
          </div>
          <button className="ghost-button" type="button" disabled={healthStatusLoading} onClick={onRefresh}>
            {healthStatusLoading ? "刷新中" : "刷新状态"}
          </button>
        </div>

        {healthStatusError ? (
          <EmptyBox slim title="健康状态暂时不可用">
            <p>{healthStatusError}</p>
            {healthStatusStale && healthStatus ? (
              <p>下方仍显示上一次成功读取的数据，时间：{formatDateTime(healthStatus.checkedAt)}</p>
            ) : null}
          </EmptyBox>
        ) : null}

        {healthStatus ? (
          <>
            {healthStatusStale ? (
              <div className="market-warning-list">
                <span>当前展示的是旧数据，最近成功读取：{formatDateTime(healthStatus.checkedAt)}</span>
              </div>
            ) : null}

            <div className="scanner-summary-grid scanner-summary-grid-wide">
              <HealthStatCard
                label="CSQAQ"
                value={yesNo(healthStatus.dataSources.csqaqConfigured)}
                hint="主行情与监控数据源"
              />
              <HealthStatCard
                label="CSFloat"
                value={yesNo(healthStatus.dataSources.csfloatConfigured)}
                hint="挂单与卖家补充数据"
              />
              <HealthStatCard
                label="本地 LLM"
                value={yesNo(healthStatus.dataSources.llmEnabled)}
                hint="AI 分析增强链路"
              />
              <HealthStatCard
                label="快照行数"
                value={healthStatus.snapshots.rowCount}
                hint={`${healthStatus.snapshots.itemCount} 个饰品，最新 ${formatLatest(healthStatus.snapshots.latestAt)}`}
              />
            </div>

            <div className="market-analysis-grid">
              <article className="market-analysis-card neutral">
                <div className="market-analysis-head">
                  <div>
                    <strong>自动刷新</strong>
                    <span>最近运行 {formatLatest(healthStatus.autoRefresh.lastRunAt)}</span>
                  </div>
                  <span className={`market-state-badge ${autoRefreshTone(healthStatus.autoRefresh)}`}>
                    {healthStatus.autoRefresh.running ? "运行中" : yesNo(healthStatus.autoRefresh.enabled)}
                  </span>
                </div>
                <p className="market-analysis-summary">
                  间隔 {healthStatus.autoRefresh.intervalMinutes} 分钟，下一次 {formatLatest(healthStatus.autoRefresh.nextRunAt)}
                </p>
                <p className="market-analysis-note">
                  上次处理 {healthStatus.autoRefresh.lastRunSummaryCount} 个摘要、{healthStatus.autoRefresh.lastRunDeepCount} 个深度分析。
                </p>
              </article>

              <article className="market-analysis-card neutral">
                <div className="market-analysis-head">
                  <div>
                    <strong>自主扫描器</strong>
                    <span>最近轮次 {formatLatest(healthStatus.scanner.lastRoundAt)}</span>
                  </div>
                  <span className={`market-state-badge ${scannerTone(healthStatus.scanner)}`}>
                    {healthStatus.scanner.paused ? "已暂停" : yesNo(healthStatus.scanner.enabled)}
                  </span>
                </div>
                <p className="market-analysis-summary">
                  本周期 {healthStatus.scanner.completedRoundsInCycle} 轮，累计 {healthStatus.scanner.totalRoundsCompleted} 轮。
                </p>
                <p className="market-analysis-note">
                  最近候选：{healthStatus.scanner.lastBatchCandidates.slice(0, 6).join(" / ") || "--"}
                </p>
              </article>
            </div>

            {healthStatus.recentError ? (
              <div className="market-warning-list">
                <span>{healthStatus.recentError}</span>
              </div>
            ) : null}
          </>
        ) : !healthStatusError ? (
          <EmptyBox slim title="正在读取健康状态">
            <p>状态接口返回后会展示服务和数据链路的当前情况。</p>
          </EmptyBox>
        ) : null}
      </section>
    </main>
  );
}
