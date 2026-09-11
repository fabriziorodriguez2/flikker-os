import type { ReactNode } from "react";

type MetricTone = "neutral" | "positive" | "negative";

interface MetricProps {
  label: string;
  value: ReactNode;
  context?: ReactNode;
  change?: ReactNode;
  changeTone?: MetricTone;
  className?: string;
}

const CHANGE_CLASS: Record<MetricTone, string> = {
  neutral: "text-[color:var(--panel-text-muted)]",
  positive: "text-[color:var(--panel-success-text)]",
  negative: "text-[color:var(--panel-danger-text)]",
};

export default function Metric({
  label,
  value,
  context,
  change,
  changeTone = "neutral",
  className = "",
}: MetricProps) {
  return (
    <div className={className}>
      <p className="text-xs font-medium leading-4 text-[color:var(--panel-text-muted)]">
        {label}
      </p>
      <p className="mt-2 text-[28px] font-semibold leading-[34px] tabular-nums tracking-tight text-[color:var(--panel-text)]">
        {value}
      </p>
      {change || context ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {change ? (
            <span className={`font-medium ${CHANGE_CLASS[changeTone]}`}>
              {change}
            </span>
          ) : null}
          {context ? (
            <span className="text-[color:var(--panel-text-muted)]">
              {context}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
