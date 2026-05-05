import type { ReactNode } from "react";
import { AnimatedNumber } from "../primitives/AnimatedNumber";
import { formatMoney } from "../../utils/format";

export interface BandCardProps {
  label: ReactNode;
  value: number | null | undefined;
  display?: ReactNode;
}

/**
 * Static band card (no hover) used for the 7-day sell band trio.
 * Static on purpose — prices update when analysis reloads, motion would layer.
 */
export function BandCard({ label, value, display }: BandCardProps) {
  return (
    <article className="band-card">
      <span>{label}</span>
      <strong>
        {display != null ? (
          display
        ) : value == null ? (
          "--"
        ) : (
          <AnimatedNumber value={value} format={formatMoney} />
        )}
      </strong>
    </article>
  );
}
