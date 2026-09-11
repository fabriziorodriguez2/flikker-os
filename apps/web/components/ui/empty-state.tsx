"use client";

import type { LucideIcon } from "lucide-react";
import Button from "./button";

interface EmptyStateProps {
  icon: LucideIcon;
  title?: string;
  description: string;
  ctaLabel?: string;
  onCta?: () => void;
}

export default function EmptyState({
  icon: Icon,
  title,
  description,
  ctaLabel,
  onCta,
}: EmptyStateProps) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center rounded-[var(--panel-radius-card)] border border-dashed border-[color:var(--panel-border)] bg-[color:var(--panel-surface)] px-5 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-[var(--panel-radius-control)] bg-[color:var(--panel-surface-muted)] text-[color:var(--panel-text-muted)]">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      {title ? (
        <h2 className="mt-4 text-base font-semibold text-[color:var(--panel-text)]">
          {title}
        </h2>
      ) : null}
      <p
        className={`${title ? "mt-1.5" : "mt-4"} max-w-2xl text-sm leading-6 text-[color:var(--panel-text-muted)]`}
      >
        {description}
      </p>
      {ctaLabel && onCta ? (
        <Button
          type="button"
          onClick={onCta}
          variant="primary"
          className="mt-5"
        >
          {ctaLabel}
        </Button>
      ) : null}
    </div>
  );
}
