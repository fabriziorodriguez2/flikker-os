"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Power } from "lucide-react";
import Button from "@/components/ui/button";
import InlineNotice from "@/components/ui/inline-notice";
import SectionCard from "@/components/ui/section-card";
import { useToast } from "@/components/ui/toast";
import {
  MODE_LABELS,
  STATUS_LABELS,
  confidenceLabel,
  incentiveLabel,
  resultLine,
  type ActivityView,
  type AutonomousRunView,
} from "./activity-view";

const BASE = "/api/proxy/intelligence/autonomy";

interface PreviewView {
  status: string;
  explanation: string;
  suggestions: string[];
  plannedCount: number;
}

async function readJson<T>(res: Response): Promise<T> {
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : "No pudimos cargar la actividad.";
    throw new Error(message);
  }
  return body as T;
}

/**
 * Actividad autónoma: qué encontró Intelligence cada día, qué descartó y
 * por qué, qué se ejecutó por Autopilot y qué resultado tuvo. También
 * cuando no hizo nada: ahí está la causa con los conteos reales.
 */
export default function ActivityClient() {
  const toast = useToast();
  const [view, setView] = useState<ActivityView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewView | null>(null);
  const [busy, setBusy] = useState<"preview" | "disable" | null>(null);

  const load = useCallback(async () => {
    try {
      setView(await readJson<ActivityView>(await fetch(BASE)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos cargar la actividad.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function runPreview() {
    setBusy("preview");
    try {
      setPreview(await readJson<PreviewView>(await fetch(`${BASE}/preview`, { method: "POST" })));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos simular.");
    } finally {
      setBusy(null);
    }
  }

  async function disable() {
    setBusy("disable");
    try {
      setView(await readJson<ActivityView>(await fetch(`${BASE}/disable`, { method: "POST" })));
      toast.success("Modo autónomo apagado.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No pudimos apagarlo.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-6 p-1">
      <Link
        href="/dashboard/intelligence"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[color:var(--panel-text-muted)] hover:text-[color:var(--panel-text)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Intelligence
      </Link>
      <div>
        <h1 className="font-display text-[27px] font-semibold tracking-[-0.025em] text-[color:var(--panel-text)]">
          Actividad autónoma
        </h1>
        <p className="mt-1 text-sm text-[color:var(--panel-text-muted)]">
          Lo que Intelligence encontró y hizo por su cuenta, usando Autopilot y dentro de tu política.
        </p>
      </div>

      {error ? <InlineNotice tone="danger" title="No pudimos cargar la actividad">{error}</InlineNotice> : null}

      {view ? (
        <>
          <section
            aria-label="Modo"
            className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--panel-radius-card)] border border-[color:var(--panel-border)] bg-[color:var(--panel-surface)] p-5"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[color:var(--panel-text)]">
                Modo: {MODE_LABELS[view.mode].label}
                {view.mode === "PILOT" ? ` · hasta ${view.pilotGroupSize} clientes por día` : ""}
              </p>
              <p className="mt-1 text-sm text-[color:var(--panel-text-secondary)]">{MODE_LABELS[view.mode].detail}</p>
              {view.mode === "OFF" ? (
                <p className="mt-1 text-xs text-[color:var(--panel-text-muted)]">
                  Lo activa el equipo de Flikker cuando tu negocio está listo para el piloto.
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void runPreview()} loading={busy === "preview"} disabled={busy !== null}>
                Simular ahora
              </Button>
              {view.mode !== "OFF" ? (
                <Button
                  variant="danger"
                  onClick={() => void disable()}
                  loading={busy === "disable"}
                  disabled={busy !== null}
                  leadingIcon={<Power className="h-4 w-4" aria-hidden="true" />}
                >
                  Apagar
                </Button>
              ) : null}
            </div>
          </section>

          {preview ? (
            <InlineNotice tone="info" title="Simulación de hoy (no se guardó ni se contactó a nadie)">
              <p>{preview.explanation}</p>
              {preview.suggestions.length > 0 ? (
                <ul className="mt-1 list-disc pl-5">
                  {preview.suggestions.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              ) : null}
            </InlineNotice>
          ) : null}

          {view.runs.length === 0 ? (
            <SectionCard title="Todavía no hay corridas">
              <p className="text-sm text-[color:var(--panel-text-secondary)]">
                Cuando el modo autónomo esté prendido, cada día queda acá lo que encontró, lo que hizo y por qué.
              </p>
            </SectionCard>
          ) : (
            view.runs.map((run) => <RunCard key={run.id} run={run} />)
          )}
        </>
      ) : !error ? (
        <div className="h-40 animate-pulse rounded-[var(--panel-radius-card)] bg-[color:var(--panel-surface-muted)]" aria-label="Cargando actividad" />
      ) : null}
    </div>
  );
}

function RunCard({ run }: { run: AutonomousRunView }) {
  return (
    <SectionCard
      title={`${run.day} · ${STATUS_LABELS[run.status]}${run.strategyLabel ? ` · ${run.strategyLabel}` : ""}`}
      description={`${run.mode === "PILOT" ? "Piloto" : "Simulación"}${
        run.strategyLabel ? ` · ${incentiveLabel(run.incentiveLevel)}` : ""
      }`}
    >
      <p className="text-sm leading-6 text-[color:var(--panel-text-secondary)]">{run.explanation}</p>

      <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-3">
        <Fact term="Elegidos" value={`${run.plannedCount} clientes`} />
        <Fact term="Resultado (Autopilot)" value={resultLine(run)} />
        <Fact
          term="Costo"
          value={
            run.metrics.messagingCost !== null && run.mode === "PILOT"
              ? `${run.currency ?? ""} ${run.metrics.messagingCost} real · ${run.currency ?? ""} ${run.estimatedCost ?? 0} estimado`
              : `${run.currency ?? ""} ${run.estimatedCost ?? 0} estimado`
          }
        />
      </dl>

      {run.blockers.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold text-[color:var(--panel-text-muted)]">Bloqueos</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-[color:var(--panel-text-secondary)]">
            {[...new Set(run.blockers.map((b) => b.message))].map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {run.suggestions.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold text-[color:var(--panel-text-muted)]">Qué se puede hacer</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-[color:var(--panel-text-secondary)]">
            {run.suggestions.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {run.opportunities.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-semibold text-[color:var(--panel-accent)]">
            Oportunidades encontradas ({run.opportunities.length}) y descartadas ({run.discarded.length})
          </summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-xs text-[color:var(--panel-text-muted)]">
                  <th className="py-1 pr-3 font-medium">Estrategia</th>
                  <th className="py-1 pr-3 font-medium">Clientes</th>
                  <th className="py-1 pr-3 font-medium">Base</th>
                  <th className="py-1 font-medium">Qué pasó</th>
                </tr>
              </thead>
              <tbody>
                {run.opportunities.map((o) => {
                  const discarded = run.discarded.find((d) => d.strategy === o.strategy);
                  return (
                    <tr key={o.strategy} className="border-t border-[color:var(--panel-border)] align-top">
                      <td className="py-1.5 pr-3 font-medium text-[color:var(--panel-text)]">{o.label}</td>
                      <td className="py-1.5 pr-3">{o.count}</td>
                      <td className="py-1.5 pr-3 text-[color:var(--panel-text-muted)]">{confidenceLabel(o.confidence)}</td>
                      <td className="py-1.5 text-[color:var(--panel-text-secondary)]">
                        {discarded ? discarded.detail : run.strategyLabel === o.label ? "Elegida" : o.rationale}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </SectionCard>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[color:var(--panel-text-muted)]">{term}</dt>
      <dd className="mt-1 break-words font-semibold text-[color:var(--panel-text)]">{value}</dd>
    </div>
  );
}
