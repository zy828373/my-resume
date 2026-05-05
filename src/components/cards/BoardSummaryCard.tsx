import type { ReactNode } from "react";
import { AnimatedNumber } from "../primitives/AnimatedNumber";
import { SpotlightCard } from "../primitives/SpotlightCard";

export interface BoardSummaryCardProps {
  label: ReactNode;
  /** Numeric value for AnimatedNumber. Ignored when `display` is provided. */
  value?: number | null;
  /** Override for non-numeric display (strings, formatted strings). */
  display?: ReactNode;
  hint?: ReactNode;
  color?: string;
}

export function BoardSummaryCard({
  label,
  value,
  display,
  hint,
  color = "var(--spot-blue)",
}: BoardSummaryCardProps) {
  return (
    <SpotlightCard as="article" className="board-summary-card" color={color}>
      <span>{label}</span>
      <strong>
        {display != null ? (
          display
        ) : (
          <AnimatedNumber
            value={value ?? 0}
            format={(n) => Math.round(n).toLocaleString("zh-CN")}
          />
        )}
      </strong>
      {hint ? <small>{hint}</small> : null}
    </SpotlightCard>
  );
}
