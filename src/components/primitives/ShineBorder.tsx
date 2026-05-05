import type { CSSProperties, ReactNode } from "react";

export type ShineTone = "accent" | "warn" | "danger" | "success";

export interface ShineBorderProps {
  children: ReactNode;
  tone?: ShineTone;
  className?: string;
  style?: CSSProperties;
}

/**
 * Rotating conic-gradient scan-line around the border.
 * Pure CSS — no JS motion cost. Reduced-motion handled in effects.css.
 */
export function ShineBorder({
  children,
  tone = "accent",
  className = "",
  style,
}: ShineBorderProps) {
  return (
    <div
      className={`shine-border tone-${tone} ${className}`.trim()}
      style={style}
    >
      {children}
    </div>
  );
}
