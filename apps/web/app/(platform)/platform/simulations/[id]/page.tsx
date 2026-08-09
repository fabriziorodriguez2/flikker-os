"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  XCircle,
} from "lucide-react";
import {
  SCENARIO_LABEL,
  STATUS_LABEL,
  VARIANT_LABEL,
  formatDateTime,
  money,
  pct,
  pp,
  type SimulationRunDetail,
} from "../types";

async function readJson(res: Response) {
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      message?: string | string[];
    };
    const message = Array.isArray(data.message)
      ? data.message.join(", ")
      : data.message;
    throw new Error(message ?? "Algo salió mal.");
  }
  return res.json();
}

const POLL_INTERVAL_MS = 4000;

function overallStatusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "PASS":
      return { label: "PASS", className: "bg-[#EEF7E8] text-[#639922]" };
    case "PASS_WITH_WARNINGS":
      return { label: "PASS CON ADVERTENCIAS", className: "bg-[#FDF3E7] text-[#B7791F]" };
    default:
      return { label: "FAIL", className: "bg-[#C0392B]/10 text-[#C0392B]" };
  }
}

function readinessBadge(readiness: string): { label: string; className: string } {
  switch (readiness) {
    case "PILOT_READY":
      return { label: "Listo para piloto", className: "bg-[#EEF7E8] text-[#639922]" };
    case "PILOT_READY_WITH_WARNINGS":
      return {
        label: "Listo para piloto (con advertencias)",
        className: "bg-[#FDF3E7] text-[#B7791F]",
      };
    default:
      return { label: "No listo para piloto", className: "bg-[#C0392B]/10 text-[#C0392B]" };
  }
}

export default function SimulationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [run, setRun] = useState<SimulationRunDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    void load();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    try {
      const res = await fetch(`/api/proxy/platform/simulations/${id}`);
      const data = (await readJson(res)) as SimulationRunDetail;
      setRun(data);
      setError(null);

      const stillGoing = data.status === "PENDING" || data.status === "RUNNING";
      if (stillGoing && !timerRef.current) {
        timerRef.current = setInterval(() => void load(), POLL_INTERVAL_MS);
      } else if (!stillGoing && timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cargar la simulación.");
    }
  }

  async function cancelRun() {
    setCancelling(true);
    try {
      await fetch(`/api/proxy/platform/simulations/${id}/cancel`, { method: "POST" });
      await load();
    } catch {
      // best-effort — the next poll will reflect whatever actually happened
    } finally {
      setCancelling(false);
    }
  }

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-xl border border-[#C0392B]/20 bg-[#C0392B]/10 p-5 text-sm text-[#C0392B]">
          {error}
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="flex h-24 items-center justify-center rounded-xl border border-[#E8EAF0] bg-white text-sm text-[#8891A4]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Cargando…
        </div>
      </div>
    );
  }

  const isRunning = run.status === "PENDING" || run.status === "RUNNING";
  const result = run.results;
  const summary = run.summary;

  return (
    <div className="space-y-5">
      <BackLink />

      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <span className="inline-flex rounded-full bg-[#EEF0FB] px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[#5C6BC0]">
            {SCENARIO_LABEL[run.scenario]}
          </span>
          <h1 className="mt-3 font-display text-[24px] font-bold leading-tight text-[#1A202C]">
            Simulación {run.id.slice(0, 8)}
          </h1>
          <p className="mt-1 text-sm text-[#8891A4]">
            Seed {run.seed} · {run.days} días · {run.customerCount} clientes ·{" "}
            {run.withAi ? "con IA fake" : "sin IA"} · creada {formatDateTime(run.createdAt)}
          </p>
        </div>

        {isRunning ? (
          <button
            type="button"
            onClick={() => void cancelRun()}
            disabled={cancelling || run.cancelRequested}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#C0392B]/30 bg-white px-4 text-sm font-semibold text-[#C0392B] transition-colors hover:bg-[#C0392B]/10 disabled:opacity-60"
          >
            <Ban className="h-4 w-4" aria-hidden="true" />
            {run.cancelRequested ? "Cancelación solicitada…" : cancelling ? "Cancelando…" : "Cancelar"}
          </button>
        ) : null}
      </section>

      {isRunning ? (
        <section className="rounded-xl border border-[#E8EAF0] bg-white p-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-[#1A202C]">
              {STATUS_LABEL[run.status]} — día {run.currentVirtualDay}/{run.days}
            </span>
            <span className="text-[#8891A4]">{run.progress}%</span>
          </div>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-[#F5F6FA]">
            <div
              className="h-full rounded-full bg-[#5C6BC0] transition-[width]"
              style={{ width: `${run.progress}%` }}
            />
          </div>
          <p className="mt-3 text-xs text-[#8891A4]">
            Actualiza solo automáticamente cada {POLL_INTERVAL_MS / 1000}s.
          </p>
        </section>
      ) : null}

      {run.status === "FAILED" && run.failureReason ? (
        <div className="flex items-start gap-3 rounded-xl border border-[#C0392B]/20 bg-[#C0392B]/10 p-5 text-sm text-[#C0392B]">
          <XCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">La simulación falló.</p>
            <p className="mt-1">{run.failureReason}</p>
          </div>
        </div>
      ) : null}

      {run.status === "CANCELLED" ? (
        <div className="rounded-xl border border-[#E8EAF0] bg-[#F5F6FA] p-5 text-sm text-[#8891A4]">
          Esta simulación fue cancelada antes de terminar.
        </div>
      ) : null}

      {result && summary ? (
        <>
          {/* §29/§30/§31 — diagnóstico determinístico primero, arriba de todo */}
          <section className="rounded-xl border border-[#E8EAF0] bg-white p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${overallStatusBadge(summary.overallStatus).className}`}
              >
                {overallStatusBadge(summary.overallStatus).label}
              </span>
              <span
                className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${readinessBadge(summary.pilotReadiness).className}`}
              >
                {readinessBadge(summary.pilotReadiness).label}
              </span>
              <span className="text-xs text-[#8891A4]">
                {(result.durationMs / 1000).toFixed(1)}s de cómputo
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Clientes" value={result.customersCreated} />
              <Stat
                label="Visibilidad check-in"
                value={pct(result.checkinVisibilityRate)}
              />
              <Stat label="Ganador real" value={VARIANT_LABEL[result.trueWinner ?? ""] ?? "—"} />
              <Stat
                label="Precisión de Flikker"
                value={
                  result.winnerAccuracy === "CORRECT"
                    ? "Correcto"
                    : result.winnerAccuracy === "INCORRECT"
                      ? "Incorrecto"
                      : "Sin conclusión"
                }
              />
            </div>

            {summary.warnings.length > 0 ? (
              <div className="mt-4 space-y-2">
                {summary.warnings.map((w) => (
                  <div
                    key={w.code}
                    className="flex items-start gap-2 rounded-lg bg-[#FDF3E7] px-3 py-2 text-sm text-[#B7791F]"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    {w.message}
                  </div>
                ))}
              </div>
            ) : null}

            {summary.recommendations.length > 0 ? (
              <div className="mt-4">
                <h3 className="text-sm font-bold text-[#1A202C]">Recomendaciones</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[#4A5568]">
                  {summary.recommendations.map((r, i) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {/* CHECK-IN VISIBILITY */}
          <SectionCard title="Visibilidad de check-in">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Retornos físicos" value={result.physicalReturns} />
              <Stat label="Retornos visibles (con check-in)" value={result.visibleReturns} />
              <Stat label="Tasa de visibilidad" value={pct(result.checkinVisibilityRate)} />
            </div>
          </SectionCard>

          {/* EXPERIMENTS */}
          <SectionCard title="Experimento — real vs. verdad oculta">
            <div className="overflow-x-auto">
              <table className="flk-table w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr>
                    <th>Variante</th>
                    <th>Retorno observado</th>
                    <th>Uplift estimado (Flikker)</th>
                    <th>Efecto real (verdad oculta)</th>
                  </tr>
                </thead>
                <tbody>
                  {(["REMINDER", "PROGRESS_REMINDER", "SOFT_BENEFIT"] as const).map((code) => (
                    <tr key={code}>
                      <td className="font-semibold">{VARIANT_LABEL[code]}</td>
                      <td>{pct(result.returnRateByVariant[code])}</td>
                      <td>{pp((result.estimatedEffectByVariant[code] ?? null) as number | null)}</td>
                      <td>{pct(result.trueEffectByVariant[code], 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-[#8891A4]">
              Ganador real (verdad oculta):{" "}
              <strong>{VARIANT_LABEL[result.trueWinner ?? ""] ?? "sin ganador claro"}</strong> ·
              Ganador detectado por Flikker:{" "}
              <strong>
                {result.detectedWinner.kind === "NO_CONCLUSION"
                  ? "sin conclusión"
                  : VARIANT_LABEL[result.detectedWinner.variantId ?? ""] ??
                    "una variante"}
              </strong>
            </p>
            <p className="mt-2 text-sm text-[#8891A4]">
              Asignación inicial → final:{" "}
              {Object.entries(result.finalAllocation)
                .map(
                  ([code, pctValue]) =>
                    `${VARIANT_LABEL[code] ?? code} ${result.initialAllocation[code] ?? "?"}%→${pctValue}%`,
                )
                .join(" · ")}
            </p>
          </SectionCard>

          {/* REWARD GOALS */}
          <SectionCard title="Reward Goals">
            <div className="grid gap-3 sm:grid-cols-3">
              <Stat label="Creados" value={result.rewardGoalsCreated} />
              <Stat label="Desbloqueados" value={result.rewardGoalsUnlocked} />
              <Stat label="Redimidos" value={result.rewardGoalsRedeemed} />
            </div>
          </SectionCard>

          {/* RETENTION / MESSAGES */}
          <SectionCard title="Retention V2 — asignaciones y envíos">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Asignaciones" value={result.retentionAssignments} />
              <Stat label="Control" value={result.controlAssignments} />
              <Stat label="Enviados" value={result.messagesSent} />
              <Stat label="Entregados" value={result.messagesDelivered} />
              <Stat label="Leídos" value={result.messagesRead} />
              <Stat label="Fallidos" value={result.messagesFailed} />
            </div>
          </SectionCard>

          {/* OPTIMIZATION */}
          <SectionCard title="Safe Auto-Optimization">
            <div className="grid gap-3 sm:grid-cols-2">
              <Stat label="Corridas aplicadas" value={result.optimizationRunsApplied} />
              <Stat label="Corridas omitidas" value={result.optimizationRunsSkipped} />
            </div>
          </SectionCard>

          {/* ECONOMICS */}
          <SectionCard title="Economía">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Costo promocional" value={money(result.promotionalCost)} />
              <Stat
                label="Revenue incremental estimado"
                value={money(result.estimatedIncrementalRevenue)}
              />
              <Stat
                label="Revenue incremental real"
                value={money(result.trueIncrementalRevenue)}
              />
              <Stat
                label="Error de estimación"
                value={
                  result.estimationErrorPercent === null
                    ? "—"
                    : `${result.estimationErrorPercent.toFixed(1)}%`
                }
              />
            </div>
          </SectionCard>

          {/* AI */}
          <SectionCard title="IA (opcional)">
            <Stat label="Llamadas registradas" value={result.aiCalls} />
          </SectionCard>

          {/* SAFETY / INVARIANTS */}
          <SectionCard title="Seguridad — invariantes">
            <div className="overflow-x-auto">
              <table className="flk-table w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr>
                    <th>Check</th>
                    <th>Estado</th>
                    <th>Detalle</th>
                  </tr>
                </thead>
                <tbody>
                  {result.invariantResults.map((inv) => (
                    <tr key={inv.code}>
                      <td className="font-mono text-xs">{inv.code}</td>
                      <td>
                        <InvariantBadge status={inv.status} />
                      </td>
                      <td className="text-[#4A5568]">{inv.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* §36 — raw JSON, no secrets */}
          <section className="rounded-xl border border-[#E8EAF0] bg-white p-5">
            <button
              type="button"
              onClick={() => setShowRawJson((v) => !v)}
              className="inline-flex items-center gap-1 text-sm font-semibold text-[#5C6BC0]"
            >
              {showRawJson ? (
                <ChevronUp className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              )}
              Ver JSON crudo (debugging)
            </button>
            {showRawJson ? (
              <pre className="mt-3 max-h-[480px] overflow-auto rounded-lg bg-[#0D1B2A] p-4 text-xs text-[#DCE2F0]">
                {JSON.stringify({ results: run.results, summary: run.summary }, null, 2)}
              </pre>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/platform/simulations"
      className="inline-flex items-center gap-1 text-sm font-semibold text-[#5C6BC0] hover:underline"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Volver a Simulation Center
    </Link>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[#E8EAF0] bg-white p-5">
      <h2 className="text-base font-bold text-[#1A202C]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <article className="rounded-lg border border-[#E8EAF0] bg-[#F5F6FA] px-4 py-3">
      <p className="text-xs font-semibold text-[#8891A4]">{label}</p>
      <p className="mt-2 truncate text-lg font-bold text-[#1A202C]">{value}</p>
    </article>
  );
}

function InvariantBadge({ status }: { status: "PASS" | "WARN" | "FAIL" }) {
  if (status === "PASS") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF7E8] px-2.5 py-1 text-xs font-semibold text-[#639922]">
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        PASS
      </span>
    );
  }
  if (status === "WARN") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#FDF3E7] px-2.5 py-1 text-xs font-semibold text-[#B7791F]">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        WARN
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#C0392B]/10 px-2.5 py-1 text-xs font-semibold text-[#C0392B]">
      <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
      FAIL
    </span>
  );
}
