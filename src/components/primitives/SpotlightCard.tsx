import type { CSSProperties, ElementType, ReactNode } from "react";
import { useRef } from "react";
import { motion, useMotionTemplate, useMotionValue } from "framer-motion";
import { useReducedMotion } from "../../hooks/useReducedMotion";

type SpotlightTag = "div" | "article" | "button" | "section" | "li" | "a";

export interface SpotlightCardProps {
  children: ReactNode;
  className?: string;
  as?: SpotlightTag;
  radius?: number;
  color?: string;
  disabled?: boolean;
  style?: CSSProperties;
  onClick?: (event: React.MouseEvent) => void;
  [key: string]: unknown;
}

/**
 * Mouse-follow radial gradient on hover.
 * Uses useMotionTemplate so only the CSS background updates — no React re-renders.
 * Single GPU-composited overlay layer; safe to apply to 20+ cards per page.
 */
export function SpotlightCard({
  children,
  className = "",
  as = "div",
  radius = 320,
  color = "var(--spot-accent)",
  disabled,
  style,
  onMouseMove,
  onMouseLeave,
  ...rest
}: SpotlightCardProps) {
  const ref = useRef<HTMLElement | null>(null);
  const reduced = useReducedMotion();
  const active = !disabled && !reduced;

  const mx = useMotionValue(-9999);
  const my = useMotionValue(-9999);
  const background = useMotionTemplate`radial-gradient(${radius}px circle at ${mx}px ${my}px, ${color}, transparent 60%)`;

  const handleMove = (event: React.MouseEvent) => {
    if (active && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      mx.set(event.clientX - rect.left);
      my.set(event.clientY - rect.top);
    }
    (onMouseMove as ((e: React.MouseEvent) => void) | undefined)?.(event);
  };

  const handleLeave = (event: React.MouseEvent) => {
    mx.set(-9999);
    my.set(-9999);
    (onMouseLeave as ((e: React.MouseEvent) => void) | undefined)?.(event);
  };

  const MotionTag = motion[as as keyof typeof motion] as ElementType;

  return (
    <MotionTag
      ref={ref as never}
      className={`spotlight-card ${className}`.trim()}
      style={style}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      {...rest}
    >
      {active && (
        <motion.span
          className="spotlight-card__glow"
          style={{ background }}
          aria-hidden
        />
      )}
      <div className="spotlight-card__content">{children}</div>
    </MotionTag>
  );
}
