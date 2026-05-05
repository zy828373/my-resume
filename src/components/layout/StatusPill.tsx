import type { HTMLAttributes, ReactNode } from "react";

export type StatusDotState = "online" | "offline" | "idle";
export type StatusPillTone = "neutral" | "positive" | "warning" | "negative";

export interface StatusPillProps extends HTMLAttributes<HTMLDivElement> {
  dot?: StatusDotState;
  tone?: StatusPillTone;
  wide?: boolean;
  children: ReactNode;
}

export function StatusPill({
  dot,
  tone = "neutral",
  wide,
  children,
  className = "",
  ...rest
}: StatusPillProps) {
  const classes = [
    "status-pill",
    tone !== "neutral" ? tone : "",
    wide ? "status-pill-wide" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...rest}>
      {dot ? <span className={`status-dot ${dot}`} aria-hidden /> : null}
      <span>{children}</span>
    </div>
  );
}
