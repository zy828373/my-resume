import type { ReactNode } from "react";
import { GlowCard } from "../primitives/GlowCard";

export interface StageNoteCardProps {
  title: ReactNode;
  children: ReactNode;
  tone?: "default" | "warning";
}

/**
 * Stage note (back-fill / fallback hints). Only the `warning` variant
 * gets a GlowCard halo; the default stays flat so a row of 3 notes
 * doesn't overwhelm the data above.
 */
export function StageNoteCard({ title, children, tone = "default" }: StageNoteCardProps) {
  if (tone === "warning") {
    return (
      <GlowCard as="article" tone="warn" strength="subtle" className="stage-note-card warning">
        <strong>{title}</strong>
        <p>{children}</p>
      </GlowCard>
    );
  }
  return (
    <article className="stage-note-card">
      <strong>{title}</strong>
      <p>{children}</p>
    </article>
  );
}
