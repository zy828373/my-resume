import { useEffect, useState } from "react";
import { GlowCard } from "../primitives/GlowCard";
import { ShineBorder } from "../primitives/ShineBorder";
import type { AlertType } from "../../utils/tone";
import { alertTypeGlowTone, alertTypeLabel } from "../../utils/tone";

export interface AlertCardProps {
  type: AlertType;
  title: string;
  detail: string;
  /** If true, the card will briefly shine on mount to flag a new alert. */
  freshShine?: boolean;
}

const FRESH_DURATION_MS = 3000;

export function AlertCard({ type, title, detail, freshShine }: AlertCardProps) {
  const [shining, setShining] = useState(Boolean(freshShine));
  const glowTone = alertTypeGlowTone(type);

  useEffect(() => {
    if (!freshShine) return;
    setShining(true);
    const id = window.setTimeout(() => setShining(false), FRESH_DURATION_MS);
    return () => window.clearTimeout(id);
  }, [freshShine, title, detail]);

  const body = (
    <GlowCard
      as="article"
      tone={glowTone === "success" ? "success" : glowTone === "danger" ? "danger" : "warn"}
      strength="subtle"
      className={`alert-card ${type === "watch" ? "warning" : type}`}
    >
      <div className="alert-chip">{alertTypeLabel(type)}</div>
      <strong>{title}</strong>
      <p>{detail}</p>
    </GlowCard>
  );

  if (!shining) return body;

  const shineTone = glowTone === "success" ? "success" : glowTone === "danger" ? "danger" : "warn";
  return <ShineBorder tone={shineTone}>{body}</ShineBorder>;
}
