import type { ReactNode } from "react";
import { AnimatedNumber } from "../primitives/AnimatedNumber";

export interface HolderSummaryCardProps {
  label: ReactNode;
  /** Number rendered via AnimatedNumber. Pass null when only `display` is set. */
  value?: number | null;
  /** Override for non-numeric values (strings, formatted strings). */
  display?: ReactNode;
  hint?: ReactNode;
}

/**
 * Static summary card (no hover motion) — too dense on screens where
 * 3-4 of them sit in a row. AnimatedNumber reveals the number on mount.
 */
export function HolderSummaryCard({
  label,
  value,
  display,
  hint,
}: HolderSummaryCardProps) {
  return (
    <article className="holder-summary-card">
      <span>{label}</span>
      <strong>
        {display != null ? (
          display
        ) : (
          <AnimatedNumber value={value ?? 0} />
        )}
      </strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}
