import type { ReactNode } from "react";
import { AnimatedNumber } from "../primitives/AnimatedNumber";
import { SpotlightCard } from "../primitives/SpotlightCard";

export interface MetricCardProps {
  label: ReactNode;
  /** Number rendered via AnimatedNumber. Ignored when `display` is provided. */
  value?: number | null;
  display?: ReactNode;
  hint?: ReactNode;
  /** When "up" / "down", applies trend colour to the strong text. */
  trend?: "up" | "down" | "flat";
  format?: (n: number) => string;
  color?: string;
}

export function MetricCard({
  label,
  value,
  display,
  hint,
  trend,
  format,
  color = "var(--spot-accent)",
}: MetricCardProps) {
  const trendClass =
    trend === "up" ? "trend-up" : trend === "down" ? "trend-down" : undefined;

  return (
    <SpotlightCard as="article" className="metric-card" color={color}>
      <span>{label}</span>
      <strong className={trendClass}>
        {display != null ? (
          display
        ) : (
          <AnimatedNumber value={value ?? null} format={format} />
        )}
      </strong>
      {hint ? <small>{hint}</small> : null}
    </SpotlightCard>
  );
}
