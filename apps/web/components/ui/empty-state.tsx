"use client";

import type { LucideIcon } from "lucide-react";

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
    <div className="flex min-h-36 flex-col items-center justify-center rounded-[16px] border border-dashed border-[#DDE1EC] bg-white px-5 py-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#F3F4F8] text-[#7F879C]">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      {title ? (
        <h2 className="mt-4 text-base font-semibold text-[#202333]">{title}</h2>
      ) : null}
      <p
        className={`${title ? "mt-1.5" : "mt-4"} max-w-2xl text-sm leading-6 text-[#8891A4]`}
      >
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
