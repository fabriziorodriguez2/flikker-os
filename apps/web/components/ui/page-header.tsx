import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  logoUrl?: string | null;
  icon?: ReactNode;
  actions?: ReactNode;
}

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
  logoUrl,
  icon,
  actions,
}: PageHeaderProps) {
  const visibleEyebrow =
    eyebrow &&
    eyebrow.trim().toLocaleLowerCase() !== title.trim().toLocaleLowerCase()
      ? eyebrow
      : null;

  return (
    <header className="panel-page-header flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b pb-5">
      <div className="max-w-3xl">
        {visibleEyebrow ? (
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--panel-text-muted)]">
            {visibleEyebrow}
          </p>
        ) : null}
        <div className="flex items-center gap-3">
          {icon ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center">
              {icon}
            </span>
          ) : logoUrl ? (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[var(--panel-radius-control)] border border-[color:var(--panel-border)] bg-[color:var(--panel-surface)]">
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
              className="h-9 w-9 shrink-0 rounded-[var(--panel-radius-control)] border border-[color:var(--panel-border)] bg-[color:var(--panel-surface-subtle)]"
            />
          ) : null}
          <h1 className="panel-page-title text-[27px] font-semibold leading-tight tracking-[-0.025em] text-[color:var(--panel-text)] md:text-[30px]">
            {title}
          </h1>
        </div>
        {subtitle ? (
          <p className="mt-1.5 max-w-2xl text-sm leading-5 text-[color:var(--panel-text-muted)]">
            {subtitle}
          </p>
        ) : null}
      </div>

      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
