import type { CSSProperties, ReactNode } from "react";
import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { springSoft, springSoftTransition } from "../effects/motion";
import { useReducedMotion } from "../../hooks/useReducedMotion";

export interface TiltedCardProps {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
  perspective?: number;
  scale?: number;
  disabled?: boolean;
  style?: CSSProperties;
  onClick?: (event: React.MouseEvent) => void;
}

/**
 * 3D perspective tilt card. Keeps maxTilt conservative (6deg) for dense
 * data contexts — visual signal, not theatrics. Spring-smoothed rotation
 * via framer's useSpring(useTransform(...)) composition.
 */
export function TiltedCard({
  children,
  className = "",
  maxTilt = 6,
  perspective = 900,
  scale = 1.01,
  disabled,
  style,
  onClick,
}: TiltedCardProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const active = !disabled && !reduced;

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rotX = useSpring(useTransform(my, [-0.5, 0.5], [maxTilt, -maxTilt]), springSoft);
  const rotY = useSpring(useTransform(mx, [-0.5, 0.5], [-maxTilt, maxTilt]), springSoft);

  const handleMove = (event: React.MouseEvent) => {
    if (!active || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    mx.set(rect.width ? (event.clientX - rect.left) / rect.width - 0.5 : 0);
    my.set(rect.height ? (event.clientY - rect.top) / rect.height - 0.5 : 0);
  };

  const handleLeave = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <motion.div
      ref={ref}
      className={`tilted-card ${className}`.trim()}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={onClick}
      style={{
        perspective,
        rotateX: active ? rotX : 0,
        rotateY: active ? rotY : 0,
        ...style,
      }}
      whileHover={active ? { scale } : undefined}
      transition={springSoftTransition}
    >
      {children}
    </motion.div>
  );
}
