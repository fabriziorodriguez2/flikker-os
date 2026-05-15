interface KPICardProps {
  label: string;
  value: string | number;
  change: string;
  positive: boolean;
}

export default function KPICard({
  label,
  value,
  change,
  positive,
}: KPICardProps) {
  return (
    <article className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
        {label}
      </p>
      <p className="mt-3 text-[32px] font-bold leading-none text-[color:var(--foreground)]">
        {value}
      </p>
      <p
        className={`mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
          positive
             "bg-[color:var(--success-bg)] text-[color:var(--success-text)]"
            : "bg-[color:var(--danger-bg)] text-[color:var(--danger-text)]"
        }`}
      >
        <span aria-hidden="true">{positive  "↑" : "↓"}</span>
        <span>{change}</span>
      </p>
    </article>
  );
}
