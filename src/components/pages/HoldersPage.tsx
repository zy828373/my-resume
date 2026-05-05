import type {
  AnalysisResponse,
  HolderDrilldownResponse,
  WatchlistSummary,
} from "../../types";
import { EChartPanel, buildHolderOption } from "../charts";
import { EmptyBox } from "../primitives/EmptyBox";
import { SpotlightCard } from "../primitives/SpotlightCard";
import { StaggerItem, StaggerList } from "../primitives/StaggerList";
import { HolderSeatCard } from "../cards/HolderSeatCard";
import { HolderSummaryCard } from "../cards/HolderSummaryCard";
import { formatMoney, formatNumber, formatPercent } from "../../utils/format";

type Holder = AnalysisResponse["holderInsights"][number];

export interface HoldersPageProps {
  analysis: AnalysisResponse | null;
  filteredWatchlist: WatchlistSummary[];
  selectedId: string | null;
  holderDetail: HolderDrilldownResponse | null;
  onSelectItem: (goodId: string) => void;
  onOpenHolderDetail: (holder: Holder) => void;
}

export function HoldersPage({
  analysis,
  filteredWatchlist,
  selectedId,
  holderDetail,
  onSelectItem,
  onOpenHolderDetail,
}: HoldersPageProps) {
  return (
    <main className="page-layout market-layout">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>库存席位</h2>
            <p>单独看重点持仓人、快照变化和当前在售样本，不和建仓建议挤在一起。</p>
          </div>
          <span className="muted-tag">
            {analysis?.holderInsights.length ?? 0} 个重点席位
          </span>
        </div>

        <div className="chip-row">
          {filteredWatchlist.slice(0, 8).map((item) => (
            <button
              key={`holder-switch-${item.goodId}`}
              className={`filter-chip ${selectedId === item.goodId ? "active" : ""}`.trim()}
              type="button"
              onClick={() => onSelectItem(item.goodId)}
            >
              {item.name}
            </button>
          ))}
        </div>

        {analysis ? (
          <>
            <StaggerList
              as="div"
              className="holder-insight-list"
              key={`holders-seats-${analysis.item.goodId}`}
            >
              {analysis.holderInsights.slice(0, 10).map((holder) => (
                <StaggerItem key={`holders-page-${holder.steamId ?? holder.steamName}`}>
                  <HolderSeatCard
                    holder={holder}
                    isActive={holderDetail?.holder.taskId === holder.taskId}
                    onOpen={onOpenHolderDetail}
                  />
                </StaggerItem>
              ))}
            </StaggerList>

            {analysis.holders.rows.length > 0 ? (
              <section className="holder-detail-section">
                <div className="compact-panel-header">
                  <h3>持仓排行</h3>
                  <p>看当前标的 Top 持仓人数量和排名分布。</p>
                </div>
                <EChartPanel option={buildHolderOption(analysis)} height={260} />
              </section>
            ) : null}
          </>
        ) : (
          <EmptyBox slim title="先从监控分析里选一个标的">
            <p>这里会单独展示该标的的席位变化和库存侧线索。</p>
          </EmptyBox>
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
              <HolderSummaryCard
                label="提前建仓侦测"
                value={analysis.earlyAccumulation.score}
                hint={analysis.earlyAccumulation.title}
              />
              <HolderSummaryCard
                label="Top10 占比"
                display={formatPercent(analysis.holders.top10SharePct, 2)}
                hint={`24h ${formatPercent(analysis.holders.delta24h?.changePct ?? null)}`}
              />
              <HolderSummaryCard
                label="公开卖家"
                value={analysis.csfloat.publicSellerCount}
                hint="CSFloat 在售样本"
              />
            </div>

            <div className="reason-item">{analysis.earlyAccumulation.detail}</div>

            <StaggerList
              as="div"
              className="holder-insight-list compact-list"
              key={`csfloat-${analysis.csfloat.samples.length}`}
            >
              {analysis.csfloat.samples.slice(0, 5).map((sample) => (
                <StaggerItem key={`holders-csfloat-${sample.listingId}`}>
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
                        Float {sample.floatValue != null ? sample.floatValue.toFixed(4) : "--"}
                      </span>
                    </div>
                  </SpotlightCard>
                </StaggerItem>
              ))}
            </StaggerList>
          </>
        ) : (
          <EmptyBox slim title="当前没有席位数据">
            <p>先选中一个监控标的，这里再展示对应的库存侧信息。</p>
          </EmptyBox>
        )}
      </aside>
    </main>
  );
}
