import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  logoUrl?: string | null;
  actions?: ReactNode;
}

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  logoUrl,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="max-w-3xl">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
            {eyebrow}
          </p>
        ) : null}
        <div className="mt-1.5 flex items-center gap-3">
          {logoUrl ? (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[color:var(--border)] bg-[color:var(--surface)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt={`Logo de ${title}`}
                className="h-full w-full object-contain"
              />
            </span>
          ) : logoUrl === null ? (
            <span
              aria-hidden="true"
              className="h-10 w-10 shrink-0 rounded-[10px] border border-[color:var(--border)] bg-[color:var(--surface-muted)]"
            />
          ) : null}
          <h1 className="text-[1.7rem] font-semibold text-[color:var(--foreground)] md:text-[1.9rem]">
            {title}
          </h1>
        </div>
        {subtitle ? (
          <p className="mt-2 max-w-2xl text-sm leading-5 text-[color:var(--text-muted)]">
            {subtitle}
          </p>
        ) : null}
      </div>

      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
