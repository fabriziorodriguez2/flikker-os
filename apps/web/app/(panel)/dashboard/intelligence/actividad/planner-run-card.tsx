"use client";

import { useState } from "react";
import SectionCard from "@/components/ui/section-card";
import {
  EVIDENCE_LABELS,
  PLAN_STATUS_LABELS,
  STATUS_LABELS,
  contactabilityLines,
  isMeasured,
  reachLine,
  type AutonomousRunView,
  type PlanView,
} from "./activity-view";

const BASE = "/api/proxy/intelligence/autonomy";

const TONE_CLASS: Record<"ok" | "info" | "muted" | "warn", string> = {
  ok: "bg-emerald-50 text-emerald-700",
  info: "bg-indigo-50 text-indigo-700",
  muted: "bg-[color:var(--panel-surface-muted)] text-[color:var(--panel-text-muted)]",
  warn: "bg-amber-50 text-amber-800",
};

/**
 * Una corrida del planificador con IA: qué vio, qué hipótesis armó, cuántos
 * clientes se pueden contactar y por qué el resto no, y cada plan que
 * consideró (elegido, descartado, ejecutado o medido) con su motivo. Los
 * planes se cargan al abrir el detalle.
 */
export default function PlannerRunCard({ run }: { run: AutonomousRunView }) {
  const [plans, setPlans] = useState<PlanView[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const analysis = run.analysis ?? {};
  const contactability = analysis.contactability
    ? contactabilityLines(analysis.contactability)
    : [];

  async function loadPlans() {
    if (plans || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/runs/${run.id}`);
      if (!res.ok) throw new Error();
      const body = (await res.json()) as { plans?: PlanView[] };
      setPlans(body.plans ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SectionCard
      title={`${run.day.split("#")[0]} · ${STATUS_LABELS[run.status]}`}
      description={`Planificador con IA · ${run.mode === "PILOT" ? "Ejecución real" : "Simulación"}${
        run.aiCostUsd != null ? ` · IA US$ ${run.aiCostUsd.toFixed(4)}` : ""
      }`}
    >
      <p className="text-sm leading-6 text-[color:var(--panel-text-secondary)]">{run.explanation}</p>

      {contactability.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold text-[color:var(--panel-text-muted)]">A quién se le puede escribir</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-[color:var(--panel-text-secondary)]">
            {contactability.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {analysis.observations?.length || analysis.hypotheses?.length ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {analysis.observations?.length ? (
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[color:var(--panel-text-muted)]">Qué vio</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-[color:var(--panel-text-secondary)]">
                {analysis.observations.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {analysis.hypotheses?.length ? (
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[color:var(--panel-text-muted)]">Hipótesis</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-[color:var(--panel-text-secondary)]">
                {analysis.hypotheses.map((h) => (
                  <li key={h.statement}>{h.statement}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {analysis.decision === "NO_ACTION" && analysis.noActionReason ? (
        <p className="mt-4 text-sm text-[color:var(--panel-text-secondary)]">
          <span className="font-semibold text-[color:var(--panel-text)]">Por qué no actuó: </span>
          {analysis.noActionReason}
        </p>
      ) : null}

      {run.suggestions.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold text-[color:var(--panel-text-muted)]">Qué piensa hacer y qué podés hacer vos</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-[color:var(--panel-text-secondary)]">
            {run.suggestions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <details className="mt-4" onToggle={(e) => (e.currentTarget.open ? void loadPlans() : undefined)}>
        <summary className="cursor-pointer text-sm font-semibold text-[color:var(--panel-accent)]">
          Planes que consideró
        </summary>
        {loading ? <p className="mt-2 text-sm text-[color:var(--panel-text-muted)]">Cargando…</p> : null}
        {error ? <p className="mt-2 text-sm text-red-600">No pudimos cargar los planes.</p> : null}
        {plans && plans.length === 0 ? (
          <p className="mt-2 text-sm text-[color:var(--panel-text-muted)]">No propuso planes en esta corrida.</p>
        ) : null}
        <div className="mt-3 space-y-3">
          {(plans ?? []).map((plan) => (
            <PlanItem key={plan.id} plan={plan} />
          ))}
        </div>
      </details>
    </SectionCard>
  );
}

export function PlanItem({ plan }: { plan: PlanView }) {
  const status = PLAN_STATUS_LABELS[plan.status];
  const measured = isMeasured(plan.results) ? plan.results : null;
  return (
    <article className="rounded-[12px] border border-[color:var(--panel-border)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-[color:var(--panel-text)]">{plan.title}</h4>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${TONE_CLASS[status.tone]}`}>{status.label}</span>
      </div>
      <p className="mt-1 text-sm text-[color:var(--panel-text-secondary)]">{plan.hypothesis}</p>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-xs text-[color:var(--panel-text-muted)]">A quién</dt>
          <dd className="mt-0.5 text-[color:var(--panel-text)]">
            {plan.plan.segment?.description ?? "—"}
            <span className="block text-xs text-[color:var(--panel-text-muted)]">{reachLine(plan)}</span>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-[color:var(--panel-text-muted)]">
            {measured ? "Resultado" : plan.simulation ? "Simulación" : "Por qué"}
          </dt>
          <dd className="mt-0.5 text-[color:var(--panel-text)]">
            {measured ? (
              <>
                <span className="font-semibold">{EVIDENCE_LABELS[measured.evidence]}</span>
                <span className="block text-xs text-[color:var(--panel-text-secondary)]">{measured.readout}</span>
              </>
            ) : plan.simulation ? (
              `${plan.simulation.treated} recibirían el mensaje · ${plan.simulation.control} en grupo de control · ${
                plan.simulation.costKnown ? `${plan.currency ?? ""} ${plan.simulation.cost.total}` : "costo desconocido"
              }`
            ) : plan.issues.length ? (
              <ul className="list-disc pl-4 text-xs text-[color:var(--panel-text-secondary)]">
                {[...new Set(plan.issues.map((i) => i.message))].map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : (
              plan.selectionReason ?? "—"
            )}
          </dd>
        </div>
      </dl>
      {plan.selectionReason && (plan.simulation || measured) ? (
        <p className="mt-2 text-xs text-[color:var(--panel-text-muted)]">Por qué lo eligió: {plan.selectionReason}</p>
      ) : null}
      {plan.plan.variants?.length ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-[color:var(--panel-text-muted)]">
            Mensajes ({plan.plan.variants.length}) · {plan.plan.controlPercent ?? 0}% en grupo de control
          </summary>
          <ul className="mt-2 space-y-1.5">
            {plan.plan.variants.map((v) => (
              <li key={v.key} className="rounded-[8px] bg-[color:var(--panel-surface-muted)] px-3 py-2 text-xs text-[color:var(--panel-text-secondary)]">
                <span className="font-semibold text-[color:var(--panel-text)]">
                  {v.key} · {v.weightPercent}% · {v.incentiveId ? "con incentivo del catálogo" : "sin incentivo"}
                </span>
                <span className="mt-0.5 block">{v.message}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </article>
  );
}
