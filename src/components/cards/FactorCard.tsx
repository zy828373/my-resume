import type { ReactNode } from "react";
import { SpotlightCard } from "../primitives/SpotlightCard";

export interface FactorCardProps {
  label: ReactNode;
  value: ReactNode;
  detail?: ReactNode;
  tone?: "positive" | "negative" | "neutral";
}

export function FactorCard({ label, value, detail, tone = "neutral" }: FactorCardProps) {
  const toneClass = tone === "neutral" ? "" : tone;
  const spotColor =
    tone === "positive"
      ? "var(--spot-accent)"
      : tone === "negative"
        ? "var(--spot-danger)"
        : "var(--spot-blue)";
  return (
    <SpotlightCard
      as="article"
      className={`factor-card ${toneClass}`.trim()}
      color={spotColor}
    >
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <p>{detail}</p> : null}
    </SpotlightCard>
  );
}
