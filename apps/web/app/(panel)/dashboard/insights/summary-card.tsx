"use client";

import { useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import HighlightedText from "./highlighted-text";

export interface InsightsSummaryView {
  summaryText: string;
  recommendations: string[];
  generatedAt: string;
}

/**
 * "Resumen de Flikker" — cacheado del lado del backend (Insights →
 * `business-insight-summary.service.ts`); este componente solo pinta lo
 * que ya vino en la carga inicial y, con el botón, pide una regeneración
 * explícita. Nunca llama a la IA en cada render.
 */
export default function SummaryCard({
  initialSummary,
}: {
  initialSummary: InsightsSummaryView | null;
}) {
  const [summary, setSummary] = useState(initialSummary);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/proxy/insights/summary/refresh", {
        method: "POST",
      });
      if (!res.ok) throw new Error("refresh failed");
      const data = (await res.json()) as InsightsSummaryView | null;
      setSummary(data);
      if (!data) {
        setError(
          "No pudimos generar un análisis nuevo ahora. Probá de nuevo en un momento.",
        );
      }
    } catch {
      setError(
        "No pudimos actualizar el análisis ahora. Probá de nuevo en un momento.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-[16px] border border-[#E5E6EC] bg-white p-6 shadow-[0_3px_12px_rgba(42,40,67,0.06)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EEF0FB] text-[#5C6BC0]">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
          </span>
          <h2 className="font-display text-lg font-bold text-[#1A202C]">
            Resumen de Flikker
          </h2>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="flk-glossy inline-flex h-9 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-3.5 text-xs font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          Actualizar análisis
        </button>
      </div>

      {summary ? (
        <>
          <p className="mt-4 text-sm leading-relaxed text-[#4A5568]">
            <HighlightedText text={summary.summaryText} />
          </p>
          {summary.recommendations.length > 0 && (
            <ul className="mt-4 space-y-2">
              {summary.recommendations.map((recommendation, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm text-[#1A202C]"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#5C6BC0]" />
                  <span><HighlightedText text={recommendation} /></span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="mt-4 text-sm text-[#8891A4]">
          Todavía no hay un resumen disponible para tu negocio.
        </p>
      )}

      {error && <p className="mt-3 text-xs text-[#C0392B]">{error}</p>}
    </div>
  );
}
