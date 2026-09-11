import Card from "./card";
import Metric from "./metric";

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
      ? "border-[color:var(--panel-info-border)] bg-[color:var(--panel-info-bg)]"
      : tone === "warm"
        ? "border-[color:var(--panel-warning-border)] bg-[color:var(--panel-warning-bg)]"
        : "";

  return (
    <Card className={toneClasses}>
      <Metric label={label} value={value} context={hint} />
    </Card>
  );
}
