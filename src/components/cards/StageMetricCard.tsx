import type { ReactNode } from "react";
import { AnimatedNumber } from "../primitives/AnimatedNumber";

export interface StageMetricCardProps {
  label: ReactNode;
  /** Numeric value rendered via AnimatedNumber. */
  value?: number | null;
  /** Override for non-numeric content (e.g. "3/15"). */
  display?: ReactNode;
  hint?: ReactNode;
}

/**
 * Static card (no hover motion) for the 4-up recommendation metric row.
 * Same philosophy as ScannerCard: too dense for motion, let numbers breathe.
 */
export function StageMetricCard({
  label,
  value,
  display,
  hint,
}: StageMetricCardProps) {
  return (
    <article className="stage-metric-card">
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
    </article>
  );
}
