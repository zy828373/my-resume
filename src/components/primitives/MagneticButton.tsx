import { forwardRef, useRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import { springTight } from "../effects/motion";
import { useReducedMotion } from "../../hooks/useReducedMotion";

type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  keyof HTMLMotionProps<"button">
>;

export interface MagneticButtonProps
  extends NativeButtonProps,
    Omit<HTMLMotionProps<"button">, "ref"> {
  strength?: number;
  className?: string;
}

/**
 * Button that drifts toward the cursor on hover. strength scales the pull.
 * Disabled when the user prefers reduced motion.
 */
export const MagneticButton = forwardRef<HTMLButtonElement, MagneticButtonProps>(
  function MagneticButton(
    { children, strength = 0.25, className = "", onMouseMove, onMouseLeave, style, ...rest },
    forwardedRef,
  ) {
    const localRef = useRef<HTMLButtonElement | null>(null);
    const reduced = useReducedMotion();
    const active = !rest.disabled && !reduced;

    const x = useSpring(useMotionValue(0), springTight);
    const y = useSpring(useMotionValue(0), springTight);

    const setRef = (node: HTMLButtonElement | null) => {
      localRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLButtonElement | null>).current = node;
    };

    const handleMove = (event: React.MouseEvent<HTMLButtonElement>) => {
      if (active && localRef.current) {
        const rect = localRef.current.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        x.set((event.clientX - cx) * strength);
        y.set((event.clientY - cy) * strength);
      }
      onMouseMove?.(event);
    };

    const handleLeave = (event: React.MouseEvent<HTMLButtonElement>) => {
      x.set(0);
      y.set(0);
      onMouseLeave?.(event);
    };

    return (
      <motion.button
        ref={setRef}
        className={`magnet-btn ${className}`.trim()}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        style={{ x: active ? x : 0, y: active ? y : 0, ...style }}
        {...(rest as HTMLMotionProps<"button">)}
      >
        {children}
      </motion.button>
    );
  },
);
