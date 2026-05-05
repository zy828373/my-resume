import type { MarketIndex } from "../../types";
import { AnimatedNumber } from "../primitives/AnimatedNumber";
import { SpotlightCard } from "../primitives/SpotlightCard";
import { formatDateTime, formatPercent } from "../../utils/format";

export interface MarketCardProps {
  card: MarketIndex;
}

const SPOT_COLORS = [
  "var(--spot-blue)",
  "var(--spot-accent)",
  "var(--spot-warn)",
  "var(--spot-danger)",
];

export function MarketCard({ card, index = 0 }: MarketCardProps & { index?: number }) {
  const color = SPOT_COLORS[index % SPOT_COLORS.length];
  return (
    <SpotlightCard as="article" className="market-card" color={color}>
      <div className="market-card-head">
        <span>{card.name}</span>
        <span className={card.chgRate >= 0 ? "trend-up" : "trend-down"}>
          {formatPercent(card.chgRate)}
        </span>
      </div>
      <strong>
        <AnimatedNumber
          value={card.marketIndex}
          format={(n) =>
            n.toLocaleString("zh-CN", { maximumFractionDigits: 2 })
          }
        />
      </strong>
      <small>更新时间 {formatDateTime(card.updatedAt)}</small>
    </SpotlightCard>
  );
}
