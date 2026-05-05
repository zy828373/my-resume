import type { HTMLAttributes, ReactNode } from "react";

export type SignalTone =
  | "buy"
  | "sell"
  | "neutral"
  | "positive"
  | "negative"
  | "warning";

export interface SignalPillProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  tone?: SignalTone;
}

export function SignalPill({ children, tone = "neutral", className = "", ...rest }: SignalPillProps) {
  return (
    <span className={`signal-pill ${tone} ${className}`.trim()} {...rest}>
      {children}
    </span>
  );
}
