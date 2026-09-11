import type { ReactNode } from "react";
import { AlertCircle, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { BadgeTone } from "./badge";

type NoticeTone = Exclude<BadgeTone, "neutral">;

const TONE_CLASS: Record<NoticeTone, string> = {
  info: "border-[color:var(--panel-info-border)] bg-[color:var(--panel-info-bg)] text-[color:var(--panel-info-text)]",
  success:
    "border-[color:var(--panel-success-border)] bg-[color:var(--panel-success-bg)] text-[color:var(--panel-success-text)]",
  warning:
    "border-[color:var(--panel-warning-border)] bg-[color:var(--panel-warning-bg)] text-[color:var(--panel-warning-text)]",
  danger:
    "border-[color:var(--panel-danger-border)] bg-[color:var(--panel-danger-bg)] text-[color:var(--panel-danger-text)]",
};

const TONE_ICON = {
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
  danger: AlertCircle,
};

interface InlineNoticeProps {
  tone?: NoticeTone;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

export default function InlineNotice({
  tone = "info",
  title,
  children,
  action,
  className = "",
}: InlineNoticeProps) {
  const Icon = TONE_ICON[tone];

  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-[var(--panel-radius-card)] border px-4 py-3 ${TONE_CLASS[tone]} ${className}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-sm">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={title ? "mt-0.5 opacity-90" : "opacity-90"}>
          {children}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
