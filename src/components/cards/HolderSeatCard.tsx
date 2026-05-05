import type { AnalysisResponse } from "../../types";
import { SignalPill } from "../primitives/SignalPill";
import { SpotlightCard } from "../primitives/SpotlightCard";
import { formatNumber, formatSignedCount } from "../../utils/format";
import { holderRoleLabel, holderRoleTone } from "../../utils/tone";

type Holder = AnalysisResponse["holderInsights"][number];

export interface HolderSeatCardProps {
  holder: Holder;
  isActive?: boolean;
  onOpen: (holder: Holder) => void;
}

/**
 * Interactive holder seat card used on the Holders page.
 * Disabled when `holder.taskId` is missing (no drilldown available).
 */
export function HolderSeatCard({ holder, isActive, onOpen }: HolderSeatCardProps) {
  const tone = holderRoleTone(holder.role);
  const disabled = !holder.taskId;
  const spotColor =
    tone === "positive"
      ? "var(--spot-accent)"
      : tone === "negative"
        ? "var(--spot-danger)"
        : "var(--spot-blue)";

  return (
    <SpotlightCard
      as="button"
      type="button"
      className={`holder-insight-card holder-insight-action ${tone} ${isActive ? "active" : ""}`.trim()}
      disabled={disabled}
      color={spotColor}
      onClick={() => !disabled && onOpen(holder)}
    >
      <div className="holder-insight-head">
        <strong>{holder.steamName}</strong>
        <SignalPill tone={tone}>{holderRoleLabel(holder.role)}</SignalPill>
      </div>
      <div className="delta-row">
        <span>当前 {formatNumber(holder.currentNum)} 件</span>
        <span>24h {formatSignedCount(holder.change24hAbs)}</span>
        <span>7d {formatSignedCount(holder.change7dAbs)}</span>
      </div>
      <p className="holder-insight-note">{holder.note}</p>
      <div className="holder-insight-footer">
        <span>
          {holder.taskId
            ? "点击查看该席位的库存、异动和快照"
            : "当前没有可展开的席位详情"}
        </span>
        {holder.taskId ? <span>查看详情</span> : null}
      </div>
    </SpotlightCard>
  );
}
