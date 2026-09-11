import type { HTMLAttributes } from "react";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral:
    "border-[color:var(--panel-border)] bg-[color:var(--panel-surface-muted)] text-[color:var(--panel-text-secondary)]",
  info: "border-[color:var(--panel-info-border)] bg-[color:var(--panel-info-bg)] text-[color:var(--panel-info-text)]",
  success:
    "border-[color:var(--panel-success-border)] bg-[color:var(--panel-success-bg)] text-[color:var(--panel-success-text)]",
  warning:
    "border-[color:var(--panel-warning-border)] bg-[color:var(--panel-warning-bg)] text-[color:var(--panel-warning-text)]",
  danger:
    "border-[color:var(--panel-danger-border)] bg-[color:var(--panel-danger-bg)] text-[color:var(--panel-danger-text)]",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export default function Badge({
  tone = "neutral",
  className = "",
  ...props
}: BadgeProps) {
  return (
    <span
      {...props}
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium leading-5 border ${TONE_CLASS[tone]} ${className}`}
    />
  );
}
