import type { ReactNode } from "react";

export interface EmptyBoxProps {
  title?: ReactNode;
  children?: ReactNode;
  slim?: boolean;
  className?: string;
}

export function EmptyBox({ title, children, slim, className = "" }: EmptyBoxProps) {
  return (
    <div className={`empty-box ${slim ? "slim" : ""} ${className}`.trim()}>
      {title ? <strong>{title}</strong> : null}
      {children}
    </div>
  );
}
