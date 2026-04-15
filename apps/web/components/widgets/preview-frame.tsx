import type { ReactNode } from "react";

interface PreviewFrameProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export default function PreviewFrame({
  title,
  description,
  children,
}: PreviewFrameProps) {
  return (
    <div className="flikker-card rounded-[28px] p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--text-soft)]">
            Preview
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-[color:var(--foreground)]">
            {title}
          </h3>
          {description ? (
            <p className="mt-2 text-sm leading-6 text-[color:var(--text-muted)]">
              {description}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-5 rounded-[24px] border border-[color:var(--border)] bg-[color:var(--surface)] p-4 md:p-5">
        {children}
      </div>
    </div>
  );
}
