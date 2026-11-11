import { CircleCheck, CircleDashed, CircleX, Database, FileText, Zap } from "lucide-react";
import type { ConversationMessage } from "./intelligence-api";
import ReportCard from "./report-card";
import ActionCard from "./action-card";
import {
  ACTION_STATE_LABEL,
  presentMessage,
  type ActionState,
} from "./message-presentation";

const ACTION_TONE: Record<ActionState, string> = {
  proposed:
    "border-[color:var(--panel-warning-border)] bg-[color:var(--panel-warning-bg)] text-[color:var(--panel-warning-text)]",
  confirmed:
    "border-[color:var(--panel-info-border)] bg-[color:var(--panel-info-bg)] text-[color:var(--panel-info-text)]",
  executed:
    "border-[color:var(--panel-success-border)] bg-[color:var(--panel-success-bg)] text-[color:var(--panel-success-text)]",
  rejected:
    "border-[color:var(--panel-border)] bg-[color:var(--panel-surface-muted)] text-[color:var(--panel-text-muted)]",
};

const ACTION_ICON: Record<ActionState, typeof CircleCheck> = {
  proposed: CircleDashed,
  confirmed: CircleCheck,
  executed: CircleCheck,
  rejected: CircleX,
};

/** El contenido se pinta siempre como texto (nunca HTML del modelo). */
export default function MessageItem({ message }: { message: ConversationMessage }) {
  const view = presentMessage(message);

  if (view.variant === "user") {
    return (
      <div className="flex justify-end" data-variant="user">
        <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-[var(--panel-radius-card)] bg-[color:var(--panel-accent)] px-3.5 py-2.5 text-sm leading-6 text-white">
          {message.content}
        </div>
      </div>
    );
  }

  if (view.variant === "report-card" && view.reportId) {
    return (
      <div className="flex flex-col items-start gap-2" data-variant="report-card-message">
        <div className="inline-flex max-w-[85%] items-center gap-2 rounded-full border border-[color:var(--panel-border)] bg-[color:var(--panel-surface-subtle)] px-3 py-1.5 text-xs text-[color:var(--panel-text-muted)]">
          <Database className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{view.label}</span>
        </div>
        <ReportCard reportId={view.reportId} />
      </div>
    );
  }

  if (view.variant === "action-card" && view.actionId) {
    return (
      <div className="flex flex-col items-start gap-2" data-variant="action-card-message">
        <div className="inline-flex max-w-[85%] items-center gap-2 rounded-full border border-[color:var(--panel-border)] bg-[color:var(--panel-surface-subtle)] px-3 py-1.5 text-xs text-[color:var(--panel-text-muted)]">
          <Zap className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{view.label}</span>
        </div>
        <ActionCard actionId={view.actionId} />
      </div>
    );
  }

  if (view.variant === "tool") {
    return (
      <div className="flex justify-start" data-variant="tool">
        <div className="inline-flex max-w-[85%] items-center gap-2 rounded-full border border-[color:var(--panel-border)] bg-[color:var(--panel-surface-subtle)] px-3 py-1.5 text-xs text-[color:var(--panel-text-muted)]">
          <Database className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{view.label}</span>
        </div>
      </div>
    );
  }

  if (view.variant === "action") {
    const state = view.actionState;
    const StateIcon = state ? ACTION_ICON[state] : Zap;
    return (
      <div className="flex justify-start" data-variant="action">
        <div className="w-full max-w-[85%] rounded-[var(--panel-radius-card)] border border-[color:var(--panel-border)] bg-[color:var(--panel-surface)] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-[color:var(--panel-text)]">
              <Zap className="h-4 w-4 text-[color:var(--panel-accent)]" aria-hidden="true" />
              {view.label}
            </p>
            {state ? (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${ACTION_TONE[state]}`}
              >
                <StateIcon className="h-3 w-3" aria-hidden="true" />
                {ACTION_STATE_LABEL[state]}
              </span>
            ) : null}
          </div>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[color:var(--panel-text-secondary)]">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  if (view.variant === "report") {
    return (
      <div className="flex justify-start" data-variant="report">
        <div className="w-full max-w-[85%] rounded-[var(--panel-radius-card)] border border-[color:var(--panel-info-border)] bg-[color:var(--panel-surface)] p-3.5">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--panel-info-text)]">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            {view.label}
          </p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[color:var(--panel-text)]">
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start" data-variant="assistant">
      <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-[var(--panel-radius-card)] bg-[color:var(--panel-surface-muted)] px-3.5 py-2.5 text-sm leading-6 text-[color:var(--panel-text)]">
        {message.content}
      </div>
    </div>
  );
}
