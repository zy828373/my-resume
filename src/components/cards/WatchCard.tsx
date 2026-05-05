import type { WatchlistSummary } from "../../types";
import { SignalPill } from "../primitives/SignalPill";
import { SpotlightCard } from "../primitives/SpotlightCard";
import { formatMoney } from "../../utils/format";
import { badgeTone, pushSignalLabel, pushSignalTone } from "../../utils/tone";

export interface WatchCardProps {
  item: WatchlistSummary;
  active: boolean;
  pending?: boolean;
  onSelect: (goodId: string) => void;
  onRemove: (goodId: string) => void;
}

export function WatchCard({
  item,
  active,
  pending,
  onSelect,
  onRemove,
}: WatchCardProps) {
  const pillTone = pushSignalTone(item.alertSignal.level);
  return (
    <SpotlightCard
      as="article"
      className={`watch-card ${active ? "active" : ""} ${pending ? "pending" : ""}`.trim()}
      color={active ? "var(--spot-accent)" : "var(--spot-blue)"}
    >
      <button
        className="watch-card-select"
        type="button"
        onClick={() => onSelect(item.goodId)}
      >
        <div className="watch-card-main">
          {item.image ? (
            <img src={item.image} alt={item.name} className="watch-image" />
          ) : (
            <div className="watch-image placeholder">CS</div>
          )}
          <div className="watch-copy">
            <strong>{item.name}</strong>
            <span>
              {item.taxonomy.segmentLabel} 路 {formatMoney(item.buffClose)} /{" "}
              {formatMoney(item.yyypClose)}
            </span>
          </div>
        </div>

        <div className="watch-card-side">
          <SignalPill tone={pillTone}>{pushSignalLabel(item.alertSignal.level)}</SignalPill>
          <span className={`score-badge ${badgeTone(item.dumpRiskScore)}`}>
            风险 {item.dumpRiskScore}
          </span>
          <span className={`score-badge ${badgeTone(item.entryScore)}`}>
            建仓 {item.entryScore}
          </span>
        </div>
      </button>
      <button
        className="mini-text-button watch-card-remove"
        type="button"
        onClick={() => onRemove(item.goodId)}
      >
        移除
      </button>
    </SpotlightCard>
  );
}
