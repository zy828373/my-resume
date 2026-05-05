import type { HTMLAttributes, ReactNode } from "react";

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  children: ReactNode;
  variant?: "default" | "muted";
}

export function Chip({ children, variant = "default", className = "", ...rest }: ChipProps) {
  const variantClass = variant === "muted" ? "chip muted" : "chip";
  return (
    <span className={`${variantClass} ${className}`.trim()} {...rest}>
      {children}
    </span>
  );
}
