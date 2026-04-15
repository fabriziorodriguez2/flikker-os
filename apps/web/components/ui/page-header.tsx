import type { ReactNode } from "react";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function PageHeader({
  eyebrow,
  title,
  subtitle,
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
        <h1 className="mt-1.5 text-[1.7rem] font-semibold text-[color:var(--foreground)] md:text-[1.9rem]">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 max-w-2xl text-sm leading-5 text-[color:var(--text-muted)]">
            {subtitle}
          </p>
        ) : null}
      </div>

      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
