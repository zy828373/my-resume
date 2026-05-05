import type { ReactNode } from "react";

export interface StageStreamCardProps {
  title: ReactNode;
  hint: ReactNode;
  count?: number;
  children: ReactNode;
}

/**
 * Container for the watch/risk side-rail streams on the Recommendations page.
 * Static (no hover motion) — it's a frame, not an interactive card.
 * Children (mini-recommend-cards) carry the hover effects.
 */
export function StageStreamCard({
  title,
  hint,
  count,
  children,
}: StageStreamCardProps) {
  return (
    <article className="stage-stream-card">
      <div className="recommend-title-row">
        <div>
          <strong>{title}</strong>
          <p>{hint}</p>
        </div>
        {count != null ? <span className="muted-tag">{count}</span> : null}
      </div>
      <div className="mini-recommend-list">{children}</div>
    </article>
  );
}
