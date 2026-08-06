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
    <header className="relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-[18px] border border-white/75 bg-white/48 px-5 py-4 shadow-[0_10px_30px_rgba(56,45,125,0.08),inset_0_1px_0_rgba(255,255,255,0.86)] backdrop-blur-[20px] backdrop-saturate-[165%]">
      <span
        aria-hidden="true"
        className="absolute inset-y-4 left-0 w-1 rounded-r-full bg-[#5C6BC0]"
      />
      <div className="relative max-w-3xl">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
            {eyebrow}
          </p>
        ) : null}
        <div className={`${eyebrow ? "mt-1.5" : ""} flex items-center gap-3`}>
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
          <h1 className="font-display text-[24px] font-bold leading-tight text-[color:var(--foreground)] md:text-[26px]">
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
        <div className="relative flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
