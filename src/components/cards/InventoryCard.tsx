import type { HolderDrilldownResponse } from "../../types";
import { SpotlightCard } from "../primitives/SpotlightCard";
import { formatMoney, formatNumber } from "../../utils/format";

type InventoryItem = HolderDrilldownResponse["inventory"]["items"][number];

export interface InventoryCardProps {
  item: InventoryItem;
}

export function InventoryCard({ item }: InventoryCardProps) {
  const hasStackedCount = item.count > 1;
  const hasMixedTradeState = item.tradableCount > 0 && item.cooldownCount > 0;
  const tradeStateText = hasMixedTradeState
    ? `可交易 ${formatNumber(item.tradableCount)} / 冷却 ${formatNumber(item.cooldownCount)}`
    : item.tradableCount > 0
      ? `可交易 ${formatNumber(item.tradableCount)}`
      : `交易冷却中 ${formatNumber(item.cooldownCount || item.count)}`;

  return (
    <SpotlightCard
      as="article"
      className="inventory-card"
      color="var(--spot-blue)"
      radius={220}
    >
      <div className="inventory-card-media">
        {item.iconUrl ? (
          <img alt={item.marketName} className="inventory-card-image" src={item.iconUrl} />
        ) : (
          <div className="inventory-card-image" />
        )}
        {hasStackedCount ? (
          <span className="inventory-stack-badge">x{formatNumber(item.count)}</span>
        ) : null}
      </div>
      <div className="inventory-card-copy">
        <strong>{item.marketName}</strong>
        <p>
          分类 {item.categoryName} · 数量 {formatNumber(item.count)}
        </p>
        <p>
          价格 {formatMoney(item.price)} · {tradeStateText}
        </p>
      </div>
    </SpotlightCard>
  );
}
