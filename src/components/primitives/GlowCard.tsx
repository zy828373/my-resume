import type { CSSProperties, ReactNode } from "react";

export type GlowTone = "success" | "warn" | "danger" | "info" | "accent" | "neutral";
export type GlowStrength = "subtle" | "normal" | "strong";

export interface GlowCardProps {
  children: ReactNode;
  tone?: GlowTone;
  strength?: GlowStrength;
  className?: string;
  style?: CSSProperties;
  as?: "div" | "article" | "section" | "li";
}

/**
 * Static severity-tinted halo around a card. Zero JS motion.
 * Strength controls the intensity of the glow via extra class hooks.
 */
export function GlowCard({
  children,
  tone = "accent",
  strength = "normal",
  className = "",
  style,
  as = "div",
}: GlowCardProps) {
  const Tag = as as React.ElementType;
  return (
    <Tag
      className={`glow-card tone-${tone} strength-${strength} ${className}`.trim()}
      style={style}
    >
      {children}
    </Tag>
  );
}
