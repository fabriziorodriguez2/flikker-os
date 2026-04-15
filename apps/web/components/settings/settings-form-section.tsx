"use client";

import type { ReactNode } from "react";

type SettingsFormSectionProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
};

export default function SettingsFormSection({
  eyebrow,
  title,
  description,
  children,
  footer,
}: SettingsFormSectionProps) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-card)]">
      <div className="border-b border-[color:var(--border)] px-6 py-6 sm:px-8">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-soft)]">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="mt-2 text-2xl font-semibold text-[color:var(--foreground)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--text-muted)]">
            {description}
          </p>
        ) : null}
      </div>

      <div className="px-6 py-6 sm:px-8">{children}</div>

      {footer ? (
        <div className="border-t border-[color:var(--border)] bg-[color:var(--surface-muted)] px-6 py-4 sm:px-8">
          {footer}
        </div>
      ) : null}
    </section>
  );
}
