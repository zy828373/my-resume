import type { PortfolioHolding } from "../../types";
import { SpotlightCard } from "../primitives/SpotlightCard";
import { daysSinceDate, formatDateOnly, formatMoney, formatNumber } from "../../utils/format";

export interface PortfolioCardProps {
  holding: PortfolioHolding;
  onDelete: (id: string) => void;
}

export function PortfolioCard({ holding, onDelete }: PortfolioCardProps) {
  const holdingDays = daysSinceDate(holding.buyDate);

  return (
    <SpotlightCard as="article" className="portfolio-card" color="var(--spot-accent)">
      <div className="holder-insight-head">
        <strong>{holding.name}</strong>
        <button
          className="mini-text-button"
          type="button"
          onClick={() => onDelete(holding.id)}
        >
          删除
        </button>
      </div>
      <div className="delta-row">
        <span>ID {holding.goodId}</span>
        <span>均价 {formatMoney(holding.averageCost)}</span>
        <span>数量 {formatNumber(holding.quantity)}</span>
      </div>
      <div className="delta-row">
        <span>买入 {formatDateOnly(holding.buyDate)}</span>
        <span>持有 {holdingDays == null ? "--" : `${holdingDays} 天`}</span>
      </div>
      {holding.note ? <p className="holder-insight-note">{holding.note}</p> : null}
    </SpotlightCard>
  );
}
