"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import type { ExperimentResults, RetentionOptimizationRun } from "./types";
import { OPTIMIZATION_REASON_LABEL } from "./types";

async function readJson(res: Response) {
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(data.message) ? data.message.join(", ") : data.message;
    throw new Error(message ?? "Algo salió mal.");
  }
  return res.json();
}

function variantNameOf(results: ExperimentResults, variantId: string): string {
  return results.variants.find((v) => v.variantId === variantId)?.variantName ?? variantId;
}

function formatAllocations(results: ExperimentResults, allocations: Record<string, number>): string {
  return Object.entries(allocations)
    .map(([variantId, percent]) => `${variantNameOf(results, variantId)} ${percent}%`)
    .join(" · ");
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-UY", { day: "numeric", month: "short" });
}

/**
 * Fase G §30/§31/§32 — deliberately simple: current distribution, a
 * recommendation with its reason (deterministic, never AI — Fase G §2/§32),
 * one button to apply it, and a short history. No allocation editor, no
 * tuning of the safety limits themselves.
 */
export default function OptimizationPanel({
  experimentId,
  results,
  canMutate,
}: {
  experimentId: string;
  results: ExperimentResults;
  canMutate: boolean;
}) {
  const [history, setHistory] = useState<RetentionOptimizationRun[] | null>(null);
  const [preview, setPreview] = useState<RetentionOptimizationRun | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"preview" | "apply" | "rollback" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experimentId]);

  async function loadHistory() {
    setLoading(true);
    try {
      const res = await fetch(`/api/proxy/retention-v2/experiments/${experimentId}/optimization/history`);
      setHistory((await readJson(res)) as RetentionOptimizationRun[]);
    } catch {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }

  async function runPreview() {
    setBusy("preview");
    setError(null);
    try {
      const res = await fetch(`/api/proxy/retention-v2/experiments/${experimentId}/optimization/preview`, {
        method: "POST",
      });
      setPreview((await readJson(res)) as RetentionOptimizationRun);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos generar la recomendación.");
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    setBusy("apply");
    setError(null);
    try {
      const res = await fetch(`/api/proxy/retention-v2/experiments/${experimentId}/optimization/apply`, {
        method: "POST",
      });
      await readJson(res);
      setPreview(null);
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos aplicar la recomendación.");
    } finally {
      setBusy(null);
    }
  }

  async function rollback() {
    setBusy("rollback");
    setError(null);
    try {
      const res = await fetch(`/api/proxy/retention-v2/experiments/${experimentId}/optimization/rollback`, {
        method: "POST",
      });
      await readJson(res);
      await loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos revertir.");
    } finally {
      setBusy(null);
    }
  }

  const lastApplied = history?.find((run) => run.status === "APPLIED") ?? null;
  const canApplyPreview =
    preview !== null &&
    (preview.status === "PREVIEWED") &&
    JSON.stringify(preview.proposedAllocations) !== JSON.stringify(preview.previousAllocations);

  return (
    <div className="mt-4 rounded-[12px] border border-[#E8EAF0] bg-[#FAFAFC] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-[#5C6BC0]" />
          <p className="text-sm font-semibold text-[#1A202C]">Optimización</p>
        </div>
        {canMutate ? (
          <button
            type="button"
            onClick={runPreview}
            disabled={busy !== null}
            className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[#E8EAF0] px-3 text-xs font-semibold text-[#1A202C] hover:border-[#5C6BC0] disabled:opacity-50"
          >
            {busy === "preview" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Ver recomendación
          </button>
        ) : null}
      </div>

      {preview ? (
        <div className="mt-3 rounded-[10px] border border-[#E8EAF0] bg-white p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
            Flikker recomienda
          </p>
          <p className="mt-1 text-sm text-[#1A202C]">
            {formatAllocations(results, preview.proposedAllocations)}
          </p>
          <p className="mt-1 text-xs text-[#8891A4]">
            {OPTIMIZATION_REASON_LABEL[preview.reasonCode] ?? preview.reasonCode}
          </p>
          {canApplyPreview && canMutate ? (
            <button
              type="button"
              onClick={apply}
              disabled={busy !== null}
              className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-[#5C6BC0] px-3.5 text-xs font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
            >
              {busy === "apply" ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Aplicar recomendación
            </button>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-[#C0392B]">{error}</p> : null}

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8891A4]">Historial</p>
        {loading ? (
          <p className="mt-1 text-xs text-[#8891A4]">Cargando…</p>
        ) : !history || history.length === 0 ? (
          <p className="mt-1 text-xs text-[#8891A4]">Todavía no hubo optimizaciones.</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {history.slice(0, 8).map((run) => (
              <li key={run.id} className="text-xs text-[#8891A4]">
                <span className="font-semibold text-[#1A202C]">{formatDate(run.createdAt)}</span>{" "}
                {run.status === "APPLIED" && run.appliedAllocations
                  ? formatAllocations(results, run.appliedAllocations)
                  : OPTIMIZATION_REASON_LABEL[run.reasonCode] ?? run.reasonCode}
                {run.status !== "APPLIED" ? (
                  <span className="ml-1 rounded-full bg-[#F5F6FA] px-1.5 py-0.5 text-[10px] font-semibold">
                    {run.status === "ROLLED_BACK" ? "revertido" : run.status.toLowerCase()}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      {lastApplied && canMutate ? (
        <button
          type="button"
          onClick={rollback}
          disabled={busy !== null}
          className="mt-3 inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[#E8EAF0] px-3 text-xs font-semibold text-[#697084] hover:border-[#C0392B] hover:text-[#C0392B] disabled:opacity-50"
        >
          {busy === "rollback" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
          Revertir el último cambio
        </button>
      ) : null}
    </div>
  );
}
