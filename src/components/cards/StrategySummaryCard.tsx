import type { ReactNode } from "react";
import { GlowCard } from "../primitives/GlowCard";
import { ShineBorder } from "../primitives/ShineBorder";

export interface StrategySummaryCardProps {
  tone: "positive" | "negative" | "neutral";
  title: ReactNode;
  children: ReactNode;
  /** When true, wraps in ShineBorder to draw attention (entry tone on watchlist). */
  shine?: boolean;
}

/**
 * Strategy summary block on the analysis page.
 * Uses GlowCard for severity tint; optional ShineBorder on `entry` tone.
 */
export function StrategySummaryCard({
  tone,
  title,
  children,
  shine,
}: StrategySummaryCardProps) {
  const glowTone = tone === "positive" ? "success" : tone === "negative" ? "danger" : "warn";

  const body = (
    <GlowCard
      tone={glowTone}
      strength="subtle"
      className={`strategy-summary-card ${tone}`}
      as="article"
    >
      <strong>{title}</strong>
      {children}
    </GlowCard>
  );

  if (!shine) return body;
  const shineTone = tone === "positive" ? "success" : tone === "negative" ? "danger" : "warn";
  return <ShineBorder tone={shineTone}>{body}</ShineBorder>;
}
