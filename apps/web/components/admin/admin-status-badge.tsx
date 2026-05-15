"use client";

type AdminStatusBadgeProps = {
  tone: "active" | "inactive" | "warning" | "neutral";
  label: string;
};

export default function AdminStatusBadge({
  tone,
  label,
}: AdminStatusBadgeProps) {
  const classes =
    tone === "active"
       "bg-[color:var(--success-bg)] text-[color:var(--success-text)]"
      : tone === "warning"
         "bg-[color:rgba(250,171,75,0.16)] text-[color:var(--warning-text)]"
        : tone === "inactive"
           "border border-[color:var(--border)] bg-[color:var(--surface)] text-[color:var(--text-muted)]"
          : "bg-[color:var(--surface-muted)] text-[color:var(--text-muted)]";

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.12em] ${classes}`}>
      {label}
    </span>
  );
}
