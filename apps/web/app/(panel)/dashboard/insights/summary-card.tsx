"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import Card from "@/components/ui/card";
import HighlightedText from "./highlighted-text";

export interface InsightsSummaryView {
  summaryText: string;
  recommendations: string[];
  generatedAt: string;
}

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
        setError("No pudimos actualizar el resumen ahora.");
      }
    } catch {
      setError("No pudimos actualizar el resumen ahora.");
    } finally {
      setLoading(false);
    }
  }

  if (!summary) return null;

  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[color:var(--panel-text)]">
          Resumen ejecutivo
        </h2>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="Actualizar resumen"
          className="flex h-8 w-8 items-center justify-center rounded-[var(--panel-radius-control)] text-[color:var(--panel-text-muted)] hover:bg-[color:var(--panel-surface-muted)] hover:text-[color:var(--panel-text)] disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
        </button>
      </div>
      <p className="mt-3 line-clamp-5 text-sm leading-6 text-[color:var(--panel-text-secondary)]">
        <HighlightedText text={summary.summaryText} />
      </p>
      {error ? (
        <p className="mt-3 text-xs text-[color:var(--panel-danger-text)]">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
