import type { CSSProperties, ReactNode } from "react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "../effects/motion";

type ListTag = "ul" | "ol" | "div";
type ItemTag = "li" | "div";

export interface StaggerListProps {
  children: ReactNode;
  className?: string;
  as?: ListTag;
  style?: CSSProperties;
}

export interface StaggerItemProps {
  children: ReactNode;
  className?: string;
  as?: ItemTag;
  style?: CSSProperties;
}

export function StaggerList({
  children,
  className,
  as = "div",
  style,
}: StaggerListProps) {
  const Tag = motion[as as keyof typeof motion] as React.ElementType;
  return (
    <Tag
      className={className}
      style={style}
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {children}
    </Tag>
  );
}

export function StaggerItem({
  children,
  className,
  as = "div",
  style,
}: StaggerItemProps) {
  const Tag = motion[as as keyof typeof motion] as React.ElementType;
  return (
    <Tag className={className} style={style} variants={staggerItem}>
      {children}
    </Tag>
  );
}
