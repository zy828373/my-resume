import type { CSSProperties } from "react";
import type { AnalysisResponse } from "../../types";
import { EChartPanel, buildHolderOption } from "../charts";
import { AlertCard } from "../cards/AlertCard";
import { BandCard } from "../cards/BandCard";
import { EmptyBox } from "../primitives/EmptyBox";
import { StaggerItem, StaggerList } from "../primitives/StaggerList";
import { formatNumber, formatPercent } from "../../utils/format";

export interface WatchlistRightRailProps {
  analysis: AnalysisResponse | null;
}

function ringColorEntry(score: number): string {
  if (score >= 75) return "#38c7b4";
  if (score >= 58) return "#ffb549";
  return "#7f91a8";
}

function ringColorRisk(score: number): string {
  if (score >= 72) return "#ff6258";
  if (score >= 58) return "#ffb549";
  return "#7f91a8";
}

export function WatchlistRightRail({ analysis }: WatchlistRightRailProps) {
  const entryScore = analysis?.scores.entryScore ?? 0;
  const dumpScore = analysis?.scores.dumpRiskScore ?? 0;

  return (
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
                ["--score" as string]: `${entryScore}`,
                ["--ring-color" as string]: ringColorEntry(entryScore),
              } as CSSProperties
            }
          >
            <strong>{entryScore}</strong>
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
                ["--score" as string]: `${dumpScore}`,
                ["--ring-color" as string]: ringColorRisk(dumpScore),
              } as CSSProperties
            }
          >
            <strong>{dumpScore}</strong>
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
          <BandCard label="下沿" value={analysis?.prediction.lowBand ?? null} />
          <BandCard label="中位" value={analysis?.prediction.baseBand ?? null} />
          <BandCard label="上沿" value={analysis?.prediction.highBand ?? null} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>单标的预警</h2>
            <p>把放量下跌、持仓变化、存世量扩张和平台价差转成可执行提醒</p>
          </div>
        </div>

        <StaggerList
          as="div"
          className="alerts-list compact"
          key={`item-alerts-${analysis?.item.goodId ?? "none"}-${(analysis?.alerts ?? []).length}`}
        >
          {(analysis?.alerts ?? []).map((alert, index) => {
            const type =
              alert.level === "entry" ? "entry" : alert.level === "risk" ? "dump" : "watch";
            return (
              <StaggerItem key={`${alert.title}-${index}`}>
                <AlertCard type={type} title={alert.title} detail={alert.detail} />
              </StaggerItem>
            );
          })}
        </StaggerList>
      </section>

      <section className="panel panel-fill">
        <div className="panel-header">
          <div>
            <h2>持仓排行</h2>
            <p>
              Top5 {formatNumber(analysis?.holders.top5 ?? null)}, Top10{" "}
              {formatNumber(analysis?.holders.top10 ?? null)}
            </p>
          </div>
        </div>

        {analysis && analysis.holders.rows.length > 0 ? (
          <>
            <div className="delta-row">
              <span>
                24h 变化 {formatPercent(analysis.holders.delta24h?.changePct ?? null)}
              </span>
              <span>
                7d 变化 {formatPercent(analysis.holders.delta7d?.changePct ?? null)}
              </span>
              <span>
                Top10 占比 {formatPercent(analysis.holders.top10SharePct ?? null)}
              </span>
            </div>
            <EChartPanel option={buildHolderOption(analysis)} height={210} />
          </>
        ) : (
          <EmptyBox slim title="持仓排行待拉取">
            <p>首次访问或接口暂时受限时，这里会在后续刷新后补齐。</p>
          </EmptyBox>
        )}
      </section>
    </aside>
  );
}
