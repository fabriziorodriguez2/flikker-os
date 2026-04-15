interface MetricCardProps {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "accent" | "warm";
}

export default function MetricCard({
  label,
  value,
  hint,
  tone = "default",
}: MetricCardProps) {
  const toneClasses =
    tone === "accent"
      ? "border-[color:rgba(145,136,245,0.18)] bg-[color:rgba(145,136,245,0.06)]"
      : tone === "warm"
        ? "border-[color:rgba(250,171,75,0.2)] bg-[color:rgba(250,171,75,0.08)]"
        : "flikker-card";

  return (
    <div className={`rounded-[20px] border p-4 ${toneClasses}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-soft)]">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold text-[color:var(--foreground)]">{value}</p>
      {hint ? (
        <p className="mt-1.5 text-xs leading-5 text-[color:var(--text-muted)]">{hint}</p>
      ) : null}
    </div>
  );
}
