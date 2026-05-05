import type { AnalysisResponse } from "../../types";
import { AuroraBackground } from "../primitives/AuroraBackground";
import { Chip } from "../primitives/Chip";
import { TiltedCard } from "../primitives/TiltedCard";
import { useHoveringChart } from "../charts/HoveringChartContext";
import { MetricCard } from "./MetricCard";
import { formatDateTime, formatMoney, formatNumber, formatPercent } from "../../utils/format";
import { shouldShowMarketHashAlias } from "../../utils/tone";

export interface HeroCardProps {
  analysis: AnalysisResponse;
  /** True while we're switching to a new item and haven't settled yet. */
  switching?: boolean;
  /** True while analysis is resolving (quick load vs deep sync). */
  loading?: boolean;
  /** True while the deep analysis is syncing behind the scenes. */
  syncing?: boolean;
}

/**
 * The hero surface for the Watchlist analysis view.
 * Structure: Aurora background behind the identity block; identity block
 * lives inside a TiltedCard (subtle 3deg). Metric grid below is static
 * and data-dense — no tilt, no spotlight.
 *
 * Guarded by HoveringChartContext so nearby chart hover doesn't fire tilt.
 */
export function HeroCard({ analysis, switching, loading, syncing }: HeroCardProps) {
  const hoveringChart = useHoveringChart();
  const pendingLabel = switching || syncing;

  return (
    <section className="hero-card">
      <AuroraBackground intensity="soft">
        <TiltedCard maxTilt={3} scale={1.004} disabled={hoveringChart}>
          <div className="hero-item">
            {analysis.item.image ? (
              <img
                src={analysis.item.image}
                alt={analysis.item.name}
                className="hero-image"
              />
            ) : (
              <div className="hero-image placeholder large">CS</div>
            )}
            <div className="hero-copy">
              <div className="hero-tags">
                <Chip>{analysis.taxonomy.categoryLabel}</Chip>
                <Chip variant="muted">{analysis.taxonomy.segmentLabel}</Chip>
                {analysis.item.rarity ? <Chip>{analysis.item.rarity}</Chip> : null}
                {analysis.item.weapon ? <Chip>{analysis.item.weapon}</Chip> : null}
                {analysis.item.exterior ? (
                  <Chip variant="muted">{analysis.item.exterior}</Chip>
                ) : null}
                {pendingLabel ? (
                  <Chip variant="muted">
                    {loading ? "快速加载中" : "深度同步中"}
                  </Chip>
                ) : null}
              </div>
              <h2>{analysis.item.name}</h2>
              {shouldShowMarketHashAlias(analysis.item.name, analysis.item.marketHashName) ? (
                <p className="hero-alias">{analysis.item.marketHashName}</p>
              ) : null}
              <p>
                7 天冷却卖出时间{" "}
                {formatDateTime(analysis.market.t7SellableAt)}，历史快照{" "}
                {analysis.history.snapshotsAvailable} 次
              </p>
            </div>
          </div>
        </TiltedCard>
      </AuroraBackground>

      <div className="hero-metrics">
        <MetricCard
          label="BUFF 最新"
          value={analysis.market.buffClose}
          format={formatMoney}
          hint={`更新时间 ${formatDateTime(analysis.market.updatedAt)}`}
          color="var(--spot-blue)"
        />
        <MetricCard
          label="悠悠有品最新"
          value={analysis.market.yyypClose}
          format={formatMoney}
          hint={`平台价差 ${formatPercent(analysis.market.spreadPct)}`}
          color="var(--spot-accent)"
        />
        <MetricCard
          label="7 天预期"
          display={formatPercent(analysis.prediction.expected7dPct)}
          trend={analysis.prediction.expected7dPct >= 0 ? "up" : "down"}
          hint={analysis.prediction.direction}
          color={analysis.prediction.expected7dPct >= 0 ? "var(--spot-accent)" : "var(--spot-danger)"}
        />
        <MetricCard
          label="存世量"
          value={analysis.statistic.current}
          format={formatNumber}
          hint={`14 天变化 ${formatPercent(analysis.statistic.change14d)}`}
          color="var(--spot-warn)"
        />
      </div>
    </section>
  );
}
