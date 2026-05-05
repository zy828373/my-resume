import type { CSSProperties, ReactNode } from "react";
import { motion } from "framer-motion";
import { useReducedMotion } from "../../hooks/useReducedMotion";

export interface AuroraBackgroundProps {
  children?: ReactNode;
  className?: string;
  intensity?: "soft" | "normal" | "strong";
  style?: CSSProperties;
}

const BLOBS = [
  { color: "rgba(91, 141, 255, 0.55)", size: 420, x0: 10, y0: 20, duration: 22 },
  { color: "rgba(57, 205, 184, 0.45)", size: 360, x0: 70, y0: 35, duration: 24 },
  { color: "rgba(255, 181, 73, 0.30)", size: 300, x0: 40, y0: 80, duration: 20 },
  { color: "rgba(160, 110, 255, 0.30)", size: 280, x0: 85, y0: 75, duration: 26 },
];

/**
 * Animated aurora backdrop — use sparingly, hero-only (1 per page max).
 * Each blob pans a lazy orbit; reduced-motion gets a static version.
 */
export function AuroraBackground({
  children,
  className = "",
  intensity = "normal",
  style,
}: AuroraBackgroundProps) {
  const reduced = useReducedMotion();
  const opacityMap = { soft: 0.35, normal: 0.55, strong: 0.75 } as const;

  return (
    <div className={`aurora-bg ${className}`.trim()} style={style}>
      <div
        className="aurora-bg__canvas"
        style={{ opacity: opacityMap[intensity] }}
        aria-hidden
      >
        {BLOBS.map((blob, i) => (
          <motion.span
            key={i}
            style={{
              position: "absolute",
              width: blob.size,
              height: blob.size,
              borderRadius: "50%",
              background: blob.color,
              left: `${blob.x0}%`,
              top: `${blob.y0}%`,
              transform: "translate(-50%, -50%)",
            }}
            animate={
              reduced
                ? undefined
                : {
                    x: [0, 40, -30, 0],
                    y: [0, -30, 20, 0],
                    scale: [1, 1.1, 0.95, 1],
                  }
            }
            transition={{
              duration: blob.duration,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
      <div className="aurora-bg__content">{children}</div>
    </div>
  );
}
