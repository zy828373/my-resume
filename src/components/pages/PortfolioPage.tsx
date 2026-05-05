import type { Dispatch, SetStateAction } from "react";
import type {
  AnalysisResponse,
  PortfolioAdvice,
  PortfolioHolding,
} from "../../types";
import { EmptyBox } from "../primitives/EmptyBox";
import { MagneticButton } from "../primitives/MagneticButton";
import { StaggerItem, StaggerList } from "../primitives/StaggerList";
import { PortfolioAdviceCard } from "../cards/PortfolioAdviceCard";
import { PortfolioCard } from "../cards/PortfolioCard";

export interface PortfolioForm {
  goodId: string;
  name: string;
  averageCost: string;
  quantity: string;
  buyDate: string;
  note: string;
}

export interface PortfolioPageProps {
  analysis: AnalysisResponse | null;
  portfolio: PortfolioHolding[];
  portfolioAdvice: PortfolioAdvice[];
  portfolioLoading: boolean;
  portfolioAdviceLoading: boolean;
  portfolioForm: PortfolioForm;
  setPortfolioForm: Dispatch<SetStateAction<PortfolioForm>>;
  onSavePortfolio: () => void;
  onDeletePortfolio: (id: string) => void;
}

export function PortfolioPage({
  analysis,
  portfolio,
  portfolioAdvice,
  portfolioLoading,
  portfolioAdviceLoading,
  portfolioForm,
  setPortfolioForm,
  onSavePortfolio,
  onDeletePortfolio,
}: PortfolioPageProps) {
  return (
    <main className="page-layout portfolio-layout">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>我的持仓</h2>
            <p>登记你的买入成本和数量，再结合 AI 给出加仓、减仓和卖出建议。</p>
          </div>
          {analysis ? (
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
          ) : null}
        </div>

        <div className="portfolio-form-grid">
          <label className="field-block">
            <span>饰品 ID</span>
            <input
              value={portfolioForm.goodId}
              onChange={(event) =>
                setPortfolioForm((current) => ({ ...current, goodId: event.target.value }))
              }
              placeholder="例如 14208"
            />
          </label>
          <label className="field-block">
            <span>饰品名称</span>
            <input
              value={portfolioForm.name}
              onChange={(event) =>
                setPortfolioForm((current) => ({ ...current, name: event.target.value }))
              }
              placeholder="填写你买入的饰品名称"
            />
          </label>
          <label className="field-block">
            <span>买入均价</span>
            <input
              value={portfolioForm.averageCost}
              onChange={(event) =>
                setPortfolioForm((current) => ({ ...current, averageCost: event.target.value }))
              }
              placeholder="例如 63"
            />
          </label>
          <label className="field-block">
            <span>持仓数量</span>
            <input
              value={portfolioForm.quantity}
              onChange={(event) =>
                setPortfolioForm((current) => ({ ...current, quantity: event.target.value }))
              }
              placeholder="例如 10"
            />
          </label>
          <label className="field-block">
            <span>买入日期</span>
            <input
              type="date"
              value={portfolioForm.buyDate}
              onChange={(event) =>
                setPortfolioForm((current) => ({ ...current, buyDate: event.target.value }))
              }
            />
          </label>
          <label className="field-block portfolio-note-field">
            <span>备注</span>
            <textarea
              value={portfolioForm.note}
              onChange={(event) =>
                setPortfolioForm((current) => ({ ...current, note: event.target.value }))
              }
              placeholder="可选：记录你的买入原因或计划"
              rows={4}
            />
          </label>
        </div>

        <div className="toolbar-actions">
          <MagneticButton className="primary-button" type="button" onClick={onSavePortfolio}>
            保存持仓
          </MagneticButton>
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

        <StaggerList
          as="div"
          className="portfolio-advice-list"
          key={`advice-${portfolioAdvice.length}`}
        >
          {portfolioAdviceLoading ? (
            <EmptyBox slim title="正在计算持仓建议">
              <p>后台正在用当前市场数据更新你的持仓动作分数。</p>
            </EmptyBox>
          ) : null}

          {!portfolioAdviceLoading &&
            portfolioAdvice.map((item) => (
              <StaggerItem key={`portfolio-advice-${item.holdingId}`}>
                <PortfolioAdviceCard advice={item} />
              </StaggerItem>
            ))}

          {!portfolioAdviceLoading && portfolioAdvice.length === 0 ? (
            <EmptyBox slim title="还没有持仓建议">
              <p>先登记一笔自己的持仓，系统才会开始给出加仓和卖出意见。</p>
            </EmptyBox>
          ) : null}
        </StaggerList>

        <StaggerList as="div" className="portfolio-list" key={`holdings-${portfolio.length}`}>
          {portfolioLoading ? (
            <EmptyBox slim title="正在加载持仓列表">
              <p>稍等一下，这里会回填你保存过的持仓记录。</p>
            </EmptyBox>
          ) : null}

          {!portfolioLoading &&
            portfolio.map((item) => (
              <StaggerItem key={`portfolio-${item.id}`}>
                <PortfolioCard holding={item} onDelete={onDeletePortfolio} />
              </StaggerItem>
            ))}
        </StaggerList>
      </aside>
    </main>
  );
}
