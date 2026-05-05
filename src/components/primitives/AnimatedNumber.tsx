import { useEffect, useState } from "react";
import { animate, useMotionValue } from "framer-motion";
import { useReducedMotion } from "../../hooks/useReducedMotion";

export interface AnimatedNumberProps {
  value: number | null | undefined;
  format?: (n: number) => string;
  duration?: number;
  className?: string;
  placeholder?: string;
  /** Below this relative delta, skip animation and snap instantly. */
  snapThreshold?: number;
}

const defaultFormat = (n: number) => {
  if (Number.isNaN(n)) return "--";
  if (Math.abs(n) >= 10000) return Math.round(n).toLocaleString("en-US");
  if (Math.abs(n) >= 100) return n.toFixed(0);
  if (Math.abs(n) >= 10) return n.toFixed(1);
  return n.toFixed(2);
};

/**
 * Smooth count-up/down when value changes. Guards against noisy polling
 * updates by snapping instantly when relative delta is below snapThreshold.
 */
export function AnimatedNumber({
  value,
  format = defaultFormat,
  duration = 0.6,
  className,
  placeholder = "--",
  snapThreshold = 0.001,
}: AnimatedNumberProps) {
  const reduced = useReducedMotion();
  const mv = useMotionValue(typeof value === "number" ? value : 0);
  const [display, setDisplay] = useState<string>(
    typeof value === "number" ? format(value) : placeholder,
  );

  useEffect(() => {
    if (value == null || Number.isNaN(value)) {
      setDisplay(placeholder);
      return;
    }

    const prev = mv.get();
    const denom = Math.abs(prev) || 1;
    const relDelta = Math.abs(value - prev) / denom;

    if (reduced || relDelta < snapThreshold) {
      mv.set(value);
      setDisplay(format(value));
      return;
    }

    const controls = animate(mv, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setDisplay(format(latest)),
    });
    return () => controls.stop();
  }, [value, duration, reduced, format, placeholder, snapThreshold, mv]);

  return <span className={className}>{display}</span>;
}
