import { forwardRef, type HTMLAttributes } from "react";

export type CardVariant = "default" | "muted" | "interactive";
export type CardPadding = "none" | "sm" | "md";

const VARIANT_CLASS: Record<CardVariant, string> = {
  default: "bg-[color:var(--panel-surface)]",
  muted: "bg-[color:var(--panel-surface-subtle)]",
  interactive:
    "bg-[color:var(--panel-surface)] transition-colors hover:border-[color:var(--panel-border-strong)] hover:bg-[color:var(--panel-surface-subtle)]",
};

const PADDING_CLASS: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5",
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: CardPadding;
}

const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { variant = "default", padding = "md", className = "", ...props },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      className={`rounded-[var(--panel-radius-card)] border border-[color:var(--panel-border)] shadow-[var(--panel-card-shadow)] ${VARIANT_CLASS[variant]} ${PADDING_CLASS[padding]} ${className}`}
    />
  );
});

export default Card;
