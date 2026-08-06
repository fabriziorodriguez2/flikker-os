"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import type {
  EconomicsResult,
  ExperimentOverview,
  ExperimentResults,
  VariantResult,
} from "./types";
import { EVIDENCE_LABEL, STRATEGY_LABEL } from "./types";

function pct(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toLocaleString("es-UY", { maximumFractionDigits: 1 })}%`;
}

function pp(value: number | null): string {
  if (value === null) return "—";
  const points = value * 100;
  const sign = points > 0 ? "+" : "";
  return `${sign}${points.toLocaleString("es-UY", { maximumFractionDigits: 1 })} pp`;
}

function money(value: number | null): string {
  if (value === null) return "—";
  return `$${value.toLocaleString("es-UY", { maximumFractionDigits: 0 })}`;
}

function count(value: number | null): string {
  if (value === null) return "—";
  return Math.round(value).toLocaleString("es-UY");
}

/** Deterministic, plain-language recommendation — no AI (Fase D §38). */
function winnerCopy(overview: ExperimentOverview): string {
  if (overview.winner.kind === "NO_CONCLUSION") {
    if (overview.winner.reason === "NO_CONTROL") {
      return "Este experimento no tiene grupo de control, así que no se puede comparar.";
    }
    return "Los datos todavía son insuficientes para recomendar algo.";
  }
  const label = overview.bestVariant?.variantName ?? "una variante";
  if (overview.winner.kind === "BEST_INCREMENTAL_VALUE") {
    return `${label} presenta el mejor valor económico incremental estimado.`;
  }
  return `${label} presenta mayor retorno que el control.`;
}

export default function ResultsSection() {
  const [overviews, setOverviews] = useState<ExperimentOverview[]>([]);
  const [details, setDetails] = useState<Record<string, ExperimentResults>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/proxy/retention-v2/results/overview");
      if (!res.ok) throw new Error("No pudimos cargar los resultados.");
      setOverviews((await res.json()) as ExperimentOverview[]);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Error al cargar.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleExpand(experimentId: string) {
    if (expanded === experimentId) {
      setExpanded(null);
      return;
    }
    setExpanded(experimentId);
    if (!details[experimentId]) {
      setDetailLoading(experimentId);
      try {
        const res = await fetch(`/api/proxy/retention-v2/experiments/${experimentId}/results`);
        if (res.ok) {
          const data = (await res.json()) as ExperimentResults;
          setDetails((prev) => ({ ...prev, [experimentId]: data }));
        }
      } finally {
        setDetailLoading(null);
      }
    }
  }

  if (loading) {
    return (
      <section className="rounded-[14px] border border-[#E8EAF0] bg-white p-5">
        <div className="flex h-24 items-center justify-center text-sm text-[#8891A4]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Cargando resultados…
        </div>
      </section>
    );
  }

  if (loadError) {
    return (
      <section className="rounded-[14px] border border-red-200 bg-red-50 p-5 text-sm text-[#C0392B]">
        {loadError}
      </section>
    );
  }

  return (
    <section className="rounded-[14px] border border-[#E8EAF0] bg-white p-5">
      <h2 className="text-base font-bold text-[#1A202C]">Resultados</h2>
      <p className="mt-1 text-sm text-[#8891A4]">
        Retorno observado y confirmado por experimento, comparado siempre contra
        su propio grupo de control.
      </p>

      {overviews.length === 0 ? (
        <p className="mt-4 text-sm text-[#8891A4]">
          Todavía no hay experimentos con resultados para mostrar.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {overviews.map((overview) => (
            <div key={overview.experimentId} className="rounded-[12px] border border-[#E8EAF0]">
              <button
                type="button"
                onClick={() => toggleExpand(overview.experimentId)}
                className="flex w-full flex-wrap items-center justify-between gap-4 px-4 py-3 text-left"
              >
                <div>
                  <p className="text-sm font-semibold text-[#1A202C]">
                    {overview.experimentName}
                  </p>
                  <p className="mt-0.5 text-xs text-[#8891A4]">{winnerCopy(overview)}</p>
                </div>

                <div className="flex flex-wrap items-center gap-5 text-sm">
                  <Stat label="Expuestos" value={count(overview.exposedCount)} />
                  <Stat label="Retorno control" value={pct(overview.controlReturnRate)} />
                  <Stat
                    label="Uplift mejor variante"
                    value={pp(overview.upliftBestVariant)}
                    tone={overview.upliftBestVariant}
                  />
                  <Stat
                    label="Retornos incrementales est."
                    value={count(overview.estimatedIncrementalReturns)}
                  />
                  {overview.incrementalRevenueEstimate !== null ? (
                    <Stat
                      label="Ingreso incremental est."
                      value={money(overview.incrementalRevenueEstimate)}
                    />
                  ) : null}
                  {expanded === overview.experimentId ? (
                    <ChevronUp className="h-4 w-4 text-[#8891A4]" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[#8891A4]" />
                  )}
                </div>
              </button>

              {expanded === overview.experimentId ? (
                <div className="border-t border-[#E8EAF0] px-4 py-4">
                  {detailLoading === overview.experimentId ? (
                    <div className="flex h-16 items-center justify-center text-sm text-[#8891A4]">
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Cargando detalle…
                    </div>
                  ) : details[overview.experimentId] ? (
                    <VariantTable results={details[overview.experimentId]} />
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: number | null;
}) {
  const toneClass =
    tone === undefined || tone === null
      ? "text-[#1A202C]"
      : tone > 0
        ? "text-[#2E7D32]"
        : tone < 0
          ? "text-[#C0392B]"
          : "text-[#1A202C]";
  return (
    <div className="text-right">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
        {label}
      </p>
      <p className={`font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function VariantTable({ results }: { results: ExperimentResults }) {
  return (
    <div className="overflow-x-auto">
      <table className="flk-table w-full min-w-[760px] text-left text-sm">
        <thead className="bg-[#F5F6FA] text-[12px] uppercase tracking-[0.08em] text-[#8891A4]">
          <tr>
            <th className="px-4 py-3 font-semibold">Variante</th>
            <th className="px-4 py-3 font-semibold">Expuestos</th>
            <th className="px-4 py-3 font-semibold">Volvieron</th>
            <th className="px-4 py-3 font-semibold">Retorno</th>
            <th className="px-4 py-3 font-semibold">Uplift</th>
            <th className="px-4 py-3 font-semibold">Retornos incr. est.</th>
            <th className="px-4 py-3 font-semibold">Economía</th>
            <th className="px-4 py-3 font-semibold">Evidencia</th>
          </tr>
        </thead>
        <tbody>
          {results.variants.map((variant) => (
            <VariantRow key={variant.variantId} variant={variant} isControl={variant.variantId === results.controlVariantId} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function VariantRow({ variant, isControl }: { variant: VariantResult; isControl: boolean }) {
  const evidenceClass =
    variant.stats.evidenceState === "ENOUGH_DATA"
      ? "bg-[#E7F5EA] text-[#2E7D32]"
      : variant.stats.evidenceState === "PRELIMINARY"
        ? "bg-amber-50 text-amber-700"
        : "bg-[#F5F6FA] text-[#8891A4]";

  return (
    <tr className="border-t border-[#E8EAF0]">
      <td className="px-4 py-3 font-semibold text-[#1A202C]">
        {variant.variantName}
        <span className="ml-2 text-xs font-normal text-[#8891A4]">
          {STRATEGY_LABEL[variant.strategyType]}
        </span>
      </td>
      <td className="px-4 py-3 text-[#1A202C]">{variant.stats.exposedCount}</td>
      <td className="px-4 py-3 text-[#1A202C]">
        {variant.stats.returnedCount}
        {variant.stats.confirmedReturnedCount > 0 ? (
          <span className="ml-1 text-xs text-[#8891A4]">
            ({variant.stats.confirmedReturnedCount} confirmados)
          </span>
        ) : null}
      </td>
      <td className="px-4 py-3 font-semibold text-[#1A202C]">{pct(variant.stats.returnRate)}</td>
      <td className="px-4 py-3">
        {isControl ? (
          <span className="text-[#8891A4]">—</span>
        ) : variant.upliftPercentagePoints === null ? (
          <span className="text-[#8891A4]">—</span>
        ) : (
          <span
            className={`inline-flex items-center gap-1 font-semibold ${
              variant.upliftPercentagePoints > 0
                ? "text-[#2E7D32]"
                : variant.upliftPercentagePoints < 0
                  ? "text-[#C0392B]"
                  : "text-[#1A202C]"
            }`}
          >
            {variant.upliftPercentagePoints > 0 ? (
              <TrendingUp className="h-3.5 w-3.5" />
            ) : variant.upliftPercentagePoints < 0 ? (
              <TrendingDown className="h-3.5 w-3.5" />
            ) : null}
            {pp(variant.upliftPercentagePoints)}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-[#1A202C]">{count(variant.estimatedIncrementalReturns)}</td>
      <td className="px-4 py-3 text-[#1A202C]">
        <EconomicsCell economics={variant.economics} />
      </td>
      <td className="px-4 py-3">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${evidenceClass}`}>
          {EVIDENCE_LABEL[variant.stats.evidenceState]}
        </span>
      </td>
    </tr>
  );
}

function EconomicsCell({ economics }: { economics: EconomicsResult }) {
  const cost = economics.knownPromotionalCost + economics.estimatedPromotionalCost;
  if (
    economics.associatedRevenueEstimate === null &&
    cost === 0 &&
    economics.unknownCostRedemptions === 0
  ) {
    return <span className="text-[#8891A4]">—</span>;
  }
  return (
    <div className="space-y-0.5 text-xs">
      {economics.incrementalRevenueEstimate !== null ? (
        <p>
          <span className="text-[#8891A4]">Ingreso incremental est.: </span>
          {money(economics.incrementalRevenueEstimate)}
        </p>
      ) : null}
      {cost > 0 ? (
        <p>
          <span className="text-[#8891A4]">Costo promocional est.: </span>
          {money(cost)}
        </p>
      ) : null}
      {economics.estimatedNetIncrementalValue !== null ? (
        <p className="font-semibold text-[#1A202C]">
          <span className="text-[#8891A4] font-normal">Impacto económico est.: </span>
          {money(economics.estimatedNetIncrementalValue)}
        </p>
      ) : null}
      {economics.estimatedROI !== null ? (
        <p>
          <span className="text-[#8891A4]">ROI promocional est.: </span>
          {(economics.estimatedROI * 100).toLocaleString("es-UY", { maximumFractionDigits: 0 })}%
        </p>
      ) : null}
      {economics.unknownCostRedemptions > 0 ? (
        <p className="text-[#8891A4]">
          {economics.unknownCostRedemptions} canjes con costo desconocido
        </p>
      ) : null}
    </div>
  );
}
