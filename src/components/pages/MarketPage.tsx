import type {
  MarketAnalysisResponse,
  MarketIndexAnalysis,
  RecommendationResponse,
} from "../../types";
import { EmptyBox } from "../primitives/EmptyBox";
import { StaggerItem, StaggerList } from "../primitives/StaggerList";
import { AlertCard } from "../cards/AlertCard";
import { HolderInsightCard } from "../cards/HolderInsightCard";
import { ScannerCard } from "../cards/ScannerCard";
import { formatDateTime, formatPercent } from "../../utils/format";
import type { AlertType } from "../../utils/tone";

type RecommendationCard = RecommendationResponse["positive"][number];

export interface LiveAlert {
  type: AlertType;
  title: string;
  detail: string;
  score: number;
}

export interface MarketPageProps {
  marketAnalysis: MarketAnalysisResponse | null;
  marketAnalysisLoading: boolean;
  marketAnalysisError: string | null;
  recommendations: RecommendationResponse | null;
  rotatingCards: RecommendationCard[];
  liveAlerts: LiveAlert[];
  onRefreshAnalysis: () => void;
  onOpenItem: (goodId: string) => void;
}

function bottomStateLabel(state: MarketIndexAnalysis["bottomState"]) {
  if (state === "forming") return "底部成形";
  if (state === "watch") return "底部观察";
  return "未见底部";
}

function trendStateLabel(state: MarketIndexAnalysis["trendState"]) {
  if (state === "up") return "持续上行";
  if (state === "down") return "趋势偏弱";
  return "趋势中性";
}

function formatRatio(value: number | null) {
  return value == null ? "--" : `${value.toFixed(2)}x`;
}

function MarketIndexAnalysisCard({
  item,
  featured = false,
}: {
  item: MarketIndexAnalysis;
  featured?: boolean;
}) {
  return (
    <article className={`market-analysis-card ${item.tone}${featured ? " featured" : ""}`}>
      <div className="market-analysis-head">
        <div>
          <strong>{item.name}</strong>
          <span>更新 {formatDateTime(item.updatedAt)}</span>
        </div>
        <span className={`market-state-badge ${item.tone}`}>
          {trendStateLabel(item.trendState)}
        </span>
      </div>

      <div className="market-score-row">
        <div>
          <span>底部特征</span>
          <strong>{item.bottomScore}</strong>
          <small>{bottomStateLabel(item.bottomState)}</small>
        </div>
        <div>
          <span>上行趋势</span>
          <strong>{item.trendScore}</strong>
          <small>{trendStateLabel(item.trendState)}</small>
        </div>
        <div>
          <span>量能</span>
          <strong>{formatRatio(item.volume.ratio)}</strong>
          <small>{item.volume.available ? "已纳入评分" : "暂不参与评分"}</small>
        </div>
      </div>

      <p className="market-analysis-summary">{item.summary}</p>
      <div className="market-analysis-metrics">
        <span>7 日 {formatPercent(item.metrics.change7d, 1)}</span>
        <span>30 日 {formatPercent(item.metrics.change30d, 1)}</span>
        <span>距 60 日低点 {formatPercent(item.metrics.lowDistance60d, 1)}</span>
        <span>连涨 {item.metrics.consecutiveUpDays} 天</span>
      </div>
      <p className="market-analysis-note">{item.bottomDetail}</p>
      <p className="market-analysis-note">{item.trendDetail}</p>
      <p className="market-analysis-note">{item.volume.summary}</p>
    </article>
  );
}

export function MarketPage({
  marketAnalysis,
  marketAnalysisLoading,
  marketAnalysisError,
  recommendations,
  rotatingCards,
  liveAlerts,
  onRefreshAnalysis,
  onOpenItem,
}: MarketPageProps) {
  return (
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
          <ScannerCard
            label="候选扫描"
            value={recommendations?.scanner.scannedCandidateCount ?? 0}
            hint={`${recommendations?.scanner.candidatePages ?? 0} 页候选池`}
          />
          <ScannerCard
            label="深度分析"
            value={recommendations?.scanner.deepAnalyzedCount ?? 0}
            hint="进入深度分析的标的数"
          />
          <ScannerCard
            label="推荐入池"
            value={recommendations?.featured.length ?? 0}
            hint="当前进入自主推荐池的项目"
          />
        </div>

        <section className="market-analysis-section">
          <div className="recommend-title-row">
            <div>
              <strong>指数结构分析</strong>
              <p>
                结合饰品总指数与主要板块指数，判断底部特征、持续上行趋势和成交量可用性。
              </p>
            </div>
            <button
              className="ghost-button"
              type="button"
              disabled={marketAnalysisLoading}
              onClick={onRefreshAnalysis}
            >
              {marketAnalysisLoading ? "分析中" : "重新分析指数"}
            </button>
          </div>

          {marketAnalysis?.overall ? (
            <>
              <span className="muted-tag">
                分析时间 {formatDateTime(marketAnalysis.updatedAt)}
              </span>
              <MarketIndexAnalysisCard item={marketAnalysis.overall} featured />
            </>
          ) : marketAnalysisError ? (
            <EmptyBox slim title="指数分析暂时不可用">
              <p>{marketAnalysisError}</p>
            </EmptyBox>
          ) : (
            <EmptyBox slim title={marketAnalysisLoading ? "正在加载指数分析" : "尚未运行指数分析"}>
              <p>
                {marketAnalysisLoading
                  ? "指数 K 线分析会稍慢一点，加载完成后会展示整体指数和主要板块状态。"
                  : "切换到大盘页后会自动分析，也可以手动点击重新分析指数。"}
              </p>
            </EmptyBox>
          )}

          {marketAnalysis?.boards.length ? (
            <div className="market-analysis-grid">
              {marketAnalysis.boards.map((item) => (
                <MarketIndexAnalysisCard key={`market-analysis-${item.id}`} item={item} />
              ))}
            </div>
          ) : null}

          {marketAnalysis?.warnings.length ? (
            <div className="market-warning-list">
              {marketAnalysis.warnings.map((warning) => (
                <span key={warning}>{warning}</span>
              ))}
            </div>
          ) : null}

          {marketAnalysisError && marketAnalysis ? (
            <div className="market-warning-list">
              <span>本次刷新失败，页面保留上一次成功分析：{marketAnalysisError}</span>
            </div>
          ) : null}
        </section>

        <StaggerList
          as="div"
          className="holder-insight-list"
          key={`market-rotating-${rotatingCards.length}`}
        >
          {rotatingCards.map((card) => (
            <StaggerItem key={`market-featured-${card.goodId}`}>
              <HolderInsightCard card={card} onOpen={onOpenItem} />
            </StaggerItem>
          ))}
        </StaggerList>
      </section>

      <aside className="panel panel-fill">
        <div className="panel-header">
          <div>
            <h2>异动提醒</h2>
            <p>这里只保留最值得你马上处理的建仓和风险信号。</p>
          </div>
          <span className="muted-tag">{liveAlerts.length} 条</span>
        </div>

        <StaggerList as="div" className="alerts-list" key={`alerts-${liveAlerts.length}`}>
          {liveAlerts.length === 0 ? (
            <EmptyBox slim title="当前没有强信号">
              <p>后台继续跑几轮后，异动提醒会更稳定。</p>
            </EmptyBox>
          ) : null}

          {liveAlerts.map((alert, index) => (
            <StaggerItem key={`market-alert-${index}`}>
              <AlertCard
                type={alert.type}
                title={alert.title}
                detail={alert.detail}
                freshShine={index === 0 && alert.score >= 70}
              />
            </StaggerItem>
          ))}
        </StaggerList>
      </aside>
    </main>
  );
}
