"use client";

import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
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
    <div className="flex flex-col items-center rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] px-5 py-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[color:var(--surface-muted)] text-[color:var(--text-muted)]">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-lg font-bold text-[color:var(--foreground)]">
        {title}
      </h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-[color:var(--text-muted)]">
        {description}
      </p>
      {ctaLabel && onCta ? (
        <button
          type="button"
          onClick={onCta}
          className="mt-5 rounded-lg bg-[color:var(--brand-primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[color:var(--brand-accent)]"
        >
          {ctaLabel}
        </button>
      ) : null}
    </div>
  );
}
