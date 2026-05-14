import type { ReactNode } from 'react';
import FlikkerLockup from '@/components/brand/flikker-lockup';

interface PublicShellProps {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footerNote?: string;
}

export default function PublicShell({
  eyebrow,
  title,
  subtitle,
  children,
  footerNote = 'Flikker',
}: PublicShellProps) {
  return (
    <div className="min-h-screen bg-[color:var(--background)] px-4 py-8 text-[color:var(--foreground)]">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl flex-col justify-between">
        <div className="mb-8 flex items-start justify-between gap-4 py-4">
          <div className="flex-1" />
          <div className="flex justify-center">
            <FlikkerLockup variant="stacked" compact />
          </div>
          <div className="flex-1" />
        </div>

        <div className="grid flex-1 items-center gap-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(340px,0.78fr)]">
          <section className="px-2 lg:px-0">
            {eyebrow ? (
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--brand-accent)]">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="mt-4 text-4xl font-semibold leading-tight text-[color:var(--foreground)] md:text-5xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-5 max-w-2xl text-base leading-7 text-[color:var(--text-muted)]">
                {subtitle}
              </p>
            ) : null}
          </section>

          <div className="rounded-[32px] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 shadow-[var(--shadow-soft)]">
            {children}
          </div>
        </div>

        <div className="mt-10 flex items-center justify-center pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-soft)]">
            {footerNote}
          </p>
        </div>
      </div>
    </div>
  );
}
