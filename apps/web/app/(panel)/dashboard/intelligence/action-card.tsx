"use client";

import { useEffect, useState } from "react";
import { CircleAlert, ShieldCheck } from "lucide-react";
import Button from "@/components/ui/button";
import { messageForStatus } from "./intelligence-api";
import { formatConversationLongDate } from "./format-date";
import {
  actionBadge,
  beforeAfterRows,
  confirmErrorMessage,
  modeLabel,
  recipientsLabel,
  type ActionTone,
  type IntelligenceAction,
} from "./action-view";

const BASE = "/api/proxy/intelligence/actions";

const TONE_CLASS: Record<ActionTone, string> = {
  warning:
    "border-[color:var(--panel-warning-border)] bg-[color:var(--panel-warning-bg)] text-[color:var(--panel-warning-text)]",
  success:
    "border-[color:var(--panel-success-border)] bg-[color:var(--panel-success-bg)] text-[color:var(--panel-success-text)]",
  info: "border-[color:var(--panel-info-border)] bg-[color:var(--panel-info-bg)] text-[color:var(--panel-info-text)]",
  muted:
    "border-[color:var(--panel-border)] bg-[color:var(--panel-surface-muted)] text-[color:var(--panel-text-muted)]",
  danger: "border-[color:var(--panel-danger-border)] bg-[color:var(--panel-danger-bg)] text-[color:var(--panel-danger-text)]",
};

/**
 * Una acción del agente, leída de la API. Confirmar manda el `planHash` que
 * se está mostrando: si el plan cambió, el backend lo rechaza y la tarjeta
 * se vuelve a leer con el estado real.
 */
export default function ActionCard({ actionId }: { actionId: string }) {
  const [action, setAction] = useState<IntelligenceAction | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"confirm" | "cancel" | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${BASE}/${encodeURIComponent(actionId)}`);
        if (!res.ok) throw new Error(messageForStatus(res.status));
        const data = (await res.json()) as IntelligenceAction;
        if (!cancelled) {
          setAction(data);
          setLoadError(null);
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : messageForStatus(0));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [actionId, reload]);

  async function decide(kind: "confirm" | "cancel") {
    if (!action || busy) return;
    setBusy(kind);
    setActionError(null);
    try {
      const res = await fetch(`${BASE}/${encodeURIComponent(action.id)}/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: kind === "confirm" ? JSON.stringify({ planHash: action.planHash }) : undefined,
      });
      const body: unknown = await res.json().catch(() => null);
      if (res.ok) {
        setAction(body as IntelligenceAction);
      } else {
        setActionError(confirmErrorMessage(res.status, body));
        setReload((n) => n + 1);
      }
    } catch {
      setActionError(confirmErrorMessage(0, null));
    } finally {
      setBusy(null);
    }
  }

  if (loadError) {
    return (
      <ActionShell>
        <p className="text-sm text-[color:var(--panel-danger-text)]">No pudimos cargar la propuesta. {loadError}</p>
        <Button size="sm" className="mt-2" onClick={() => setReload((n) => n + 1)}>
          Reintentar
        </Button>
      </ActionShell>
    );
  }
  if (!action) {
    return (
      <ActionShell>
        <div
          className="h-24 animate-pulse rounded-[var(--panel-radius-control)] bg-[color:var(--panel-surface-muted)]"
          aria-label="Cargando propuesta"
        />
      </ActionShell>
    );
  }
  return (
    <ActionView
      action={action}
      busy={busy}
      error={actionError}
      onConfirm={() => void decide("confirm")}
      onCancel={() => void decide("cancel")}
    />
  );
}

function ActionShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="w-full max-w-[680px] rounded-[var(--panel-radius-card)] border border-[color:var(--panel-border)] bg-[color:var(--panel-surface)] p-4"
      data-variant="action-card"
    >
      {children}
    </div>
  );
}

export function ActionView({
  action,
  busy = null,
  error = null,
  onConfirm,
  onCancel,
}: {
  action: IntelligenceAction;
  busy?: "confirm" | "cancel" | null;
  error?: string | null;
  onConfirm?: () => void;
  onCancel?: () => void;
}) {
  const badge = actionBadge(action);
  const { impact } = action;
  const rows = beforeAfterRows(impact);
  const hasBefore = impact.before.length > 0;

  return (
    <ActionShell>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--panel-text-muted)]">
            {modeLabel(action.mode)}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-[color:var(--panel-text)]">{action.title}</h3>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASS[badge.tone]}`}
          data-status={action.status}
        >
          {badge.label}
        </span>
      </div>

      <p className="mt-2 text-sm leading-6 text-[color:var(--panel-text-secondary)]">{impact.summary}</p>

      {rows.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[320px] text-sm">
            <caption className="sr-only">Antes y después</caption>
            <thead>
              <tr className="text-left text-xs text-[color:var(--panel-text-muted)]">
                <th scope="col" className="py-1 pr-3 font-medium" />
                {hasBefore ? (
                  <th scope="col" className="py-1 pr-3 font-medium">
                    Antes
                  </th>
                ) : null}
                <th scope="col" className="py-1 font-medium">
                  {hasBefore ? "Después" : "Queda así"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t border-[color:var(--panel-border)] align-top">
                  <th scope="row" className="py-1.5 pr-3 text-left font-normal text-[color:var(--panel-text-muted)]">
                    {row.label}
                  </th>
                  {hasBefore ? (
                    <td className="break-words py-1.5 pr-3 text-[color:var(--panel-text-secondary)]">{row.before ?? "—"}</td>
                  ) : null}
                  <td className="break-words py-1.5 font-medium text-[color:var(--panel-text)]">{row.after ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <dl className="mt-3 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        <Fact term="Destinatarios" value={recipientsLabel(impact.recipients)} />
        <Fact term="Canal" value={impact.channel} />
        <Fact
          term="Cuándo"
          value={impact.effectiveAt ? "Apenas lo confirmes" : action.mode === "DRY_RUN" ? "Nunca: es una simulación" : "Ya quedó guardado"}
        />
        <Fact term="Costo máximo" value={impact.maxCost} />
      </dl>

      {impact.risks.length > 0 ? (
        <div className="mt-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[color:var(--panel-text-muted)]">
            <CircleAlert className="h-3.5 w-3.5" aria-hidden="true" />
            Tené en cuenta
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-[color:var(--panel-text-secondary)]">
            {impact.risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-3 text-xs text-[color:var(--panel-text-muted)]">{impact.undo}</p>

      {action.error && action.status !== "PROPOSED" && !error ? (
        <p className="mt-2 text-sm text-[color:var(--panel-text-secondary)]" role="status">
          {action.error.message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-[color:var(--panel-danger-text)]" role="alert">
          {error}
        </p>
      ) : null}

      {action.executedAt && action.mode === "CONFIRM" ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-[color:var(--panel-success-text)]">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Confirmado por vos el {formatConversationLongDate(action.executedAt)}
        </p>
      ) : null}

      {action.canConfirm || action.canCancel ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {action.canConfirm ? (
            <Button
              variant="primary"
              size="sm"
              onClick={onConfirm}
              disabled={busy !== null}
              loading={busy === "confirm"}
              loadingLabel="Aplicando…"
            >
              Confirmar
            </Button>
          ) : null}
          {action.canCancel ? (
            <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy !== null} loading={busy === "cancel"}>
              Cancelar
            </Button>
          ) : null}
          {action.expiresAt ? (
            <span className="text-xs text-[color:var(--panel-text-muted)]">
              Vence el {formatConversationLongDate(action.expiresAt)}
            </span>
          ) : null}
        </div>
      ) : null}
    </ActionShell>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[color:var(--panel-text-muted)]">{term}</dt>
      <dd className="break-words text-[color:var(--panel-text)]">{value}</dd>
    </div>
  );
}
