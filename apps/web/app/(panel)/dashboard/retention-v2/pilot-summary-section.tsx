"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { DryRunReport, ExperimentOverview } from "./types";

/**
 * Piloto V2 (ajuste UX) — lo primero y más simple que un dueño ve: cuántos
 * clientes se analizaron, cuántos están en riesgo, a cuántos se contactó,
 * cuántos volvieron, el return rate, y en qué etapa de aprendizaje está el
 * experimento. La economía se muestra siempre como estimación, nunca como el
 * número principal — nunca es la base de una recomendación automática acá.
 *
 * No hay ningún endpoint nuevo detrás: en modo observación usa el mismo
 * `DryRunReport` que ya se pedía para `DryRunPanel`; una vez en vivo, usa el
 * mismo `/retention-v2/results/overview` que ya usa la vista técnica
 * (`ResultsSection`, ahora en Configuración avanzada) — solo se lee y se
 * muestra distinto.
 */
export default function PilotSummarySection({
  dryRunEnabled,
  dryRunReport,
}: {
  dryRunEnabled: boolean;
  dryRunReport: DryRunReport | null;
}) {
  const [overview, setOverview] = useState<ExperimentOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/proxy/retention-v2/results/overview");
      if (res.ok) {
        const overviews = (await res.json()) as ExperimentOverview[];
        setOverview(overviews[0] ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <section className="rounded-[14px] border border-[#E8EAF0] bg-white p-5">
        <div className="flex h-20 items-center justify-center text-sm text-[#8891A4]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Cargando…
        </div>
      </section>
    );
  }

  // Modo observación: todavía no hay "resultados" reales, pero sí hay el
  // reporte de qué habría pasado hoy — es la fuente más simple posible.
  if (dryRunEnabled) {
    return (
      <section className="rounded-[14px] border border-[#E8EAF0] bg-white p-5">
        <h2 className="text-base font-bold text-[#1A202C]">Cómo va tu piloto</h2>
        {dryRunReport ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Metric label="Clientes analizados" value={dryRunReport.analyzed} />
            <Metric label="Clientes en riesgo" value={dryRunReport.detectedAtRisk} />
            <Metric
              label="Habría contactado"
              value={dryRunReport.wouldSend + dryRunReport.wouldOfferIncentive}
            />
          </div>
        ) : (
          <p className="mt-3 text-sm text-[#8891A4]">
            Todavía no corrió ninguna evaluación hoy.
          </p>
        )}
        <p className="mt-4 text-xs text-[#8891A4]">
          Estás en modo observación — estos números son de hoy y todavía no se
          envió ningún mensaje real.
        </p>
      </section>
    );
  }

  // En vivo: los números reales del experimento activo más reciente.
  if (!overview) {
    return (
      <section className="rounded-[14px] border border-[#E8EAF0] bg-white p-5">
        <h2 className="text-base font-bold text-[#1A202C]">Cómo va tu piloto</h2>
        <p className="mt-3 text-sm text-[#8891A4]">
          Todavía no tenés un experimento corriendo. Creá uno en Configuración
          avanzada para empezar a ver resultados acá.
        </p>
      </section>
    );
  }

  const returnRate =
    overview.exposedCount > 0 ? overview.returnedCount / overview.exposedCount : null;
  const learningStage = learningStageCopy(overview);

  return (
    <section className="rounded-[14px] border border-[#E8EAF0] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold text-[#1A202C]">Cómo va tu piloto</h2>
        <span className="rounded-full bg-[#EEF0FB] px-2.5 py-1 text-xs font-semibold text-[#5C6BC0]">
          {learningStage.label}
        </span>
      </div>
      <p className="mt-1 text-sm text-[#8891A4]">{overview.experimentName}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Contactados" value={overview.exposedCount} />
        <Metric label="Volvieron" value={overview.returnedCount} />
        <Metric
          label="Return rate"
          value={returnRate === null ? "—" : `${(returnRate * 100).toLocaleString("es-UY", { maximumFractionDigits: 1 })}%`}
        />
        <Metric label="Estado de aprendizaje" value={learningStage.label} small />
      </div>

      <p className="mt-3 text-xs text-[#8891A4]">{learningStage.detail}</p>

      {/* Ajuste pre-piloto: la economía se muestra, pero nunca como el
          número principal ni como base de una recomendación automática —
          siempre marcada explícitamente como estimación. */}
      {overview.incrementalRevenueEstimate !== null ? (
        <p className="mt-3 rounded-[8px] bg-[#F5F6FA] px-3 py-2 text-xs text-[#8891A4]">
          Impacto económico (estimación, no un resultado confirmado):{" "}
          <strong className="text-[#1A202C]">
            ${overview.incrementalRevenueEstimate.toLocaleString("es-UY", { maximumFractionDigits: 0 })}
          </strong>
          . Vas a ver el detalle completo en Configuración avanzada.
        </p>
      ) : null}
    </section>
  );
}

function Metric({
  label,
  value,
  small,
}: {
  label: string;
  value: string | number;
  small?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
        {label}
      </p>
      <p className={`font-bold text-[#1A202C] ${small ? "text-sm" : "text-xl"}`}>{value}</p>
    </div>
  );
}

function learningStageCopy(overview: ExperimentOverview): { label: string; detail: string } {
  if (overview.winner.kind === "NO_CONCLUSION") {
    return {
      label: "Todavía aprendiendo",
      detail:
        "Flikker necesita más clientes contactados antes de poder decir con confianza qué está funcionando mejor.",
    };
  }
  return {
    label: "Ya hay una tendencia",
    detail:
      "Flikker ya detecta una diferencia entre las variantes — revisá el detalle en Configuración avanzada antes de decidir algo.",
  };
}
