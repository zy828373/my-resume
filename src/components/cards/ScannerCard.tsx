import type { ReactNode } from "react";
import { AnimatedNumber } from "../primitives/AnimatedNumber";

export interface ScannerCardProps {
  label: string;
  value: number | null | undefined;
  hint?: ReactNode;
}

/**
 * Static card (no hover motion) — used in dense 3/4 col KPI grids where
 * motion would distract from live-ticking numbers.
 */
export function ScannerCard({ label, value, hint }: ScannerCardProps) {
  return (
    <article className="scanner-card">
      <span>{label}</span>
      <strong>
        <AnimatedNumber
          value={value ?? 0}
          format={(n) => Math.round(n).toLocaleString("zh-CN")}
        />
      </strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}
