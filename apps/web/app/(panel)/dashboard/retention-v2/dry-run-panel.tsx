"use client";

import { Eye } from "lucide-react";
import type { DryRunReport } from "./types";
import { REWARD_GOAL_REASON_LABEL } from "./types";

/**
 * Pre-piloto #4 — deja de tener su propio botón "Pasar a automático": esa
 * transición (Observación → En vivo) ahora se hace desde el radio de
 * `SettingsSection`, con su propia confirmación — tener dos controles para
 * la misma acción era confuso. Este panel queda solo como el reporte de
 * "qué habría hecho hoy".
 */
export default function DryRunPanel({
  report,
  dryRunEnabled,
}: {
  report: DryRunReport | null;
  dryRunEnabled: boolean;
}) {
  if (!dryRunEnabled) return null;

  return (
    <section className="rounded-[14px] border border-[#DCE3F7] bg-[#F5F7FF] p-5">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 text-[#5C6BC0]" />
        <h2 className="text-base font-bold text-[#1A202C]">Modo observación — hoy</h2>
      </div>

      {report ? (
        <>
          <p className="mt-2 text-sm text-[#3B4252]">
            Hoy Flikker habría analizado <strong>{report.analyzed}</strong>{" "}
            clientes y detectado <strong>{report.detectedAtRisk}</strong> en
            riesgo o inactivos: asignó <strong>{report.wouldControl}</strong> a
            control, hubiera enviado <strong>{report.wouldSend}</strong>{" "}
            recordatorios y ofrecido <strong>{report.wouldOfferIncentive}</strong>{" "}
            beneficios.
          </p>
          <p className="mt-1 text-sm font-semibold text-[#5C6BC0]">
            Pero no se envió ningún mensaje ni se otorgó ningún beneficio.
          </p>

          {report.wouldCreateRewardGoals > 0 ? (
            <div className="mt-3 rounded-[10px] bg-white/60 px-4 py-3">
              <p className="text-sm text-[#3B4252]">
                Hoy Flikker habría creado{" "}
                <strong>{report.wouldCreateRewardGoals}</strong> metas de
                recompensa:
              </p>
              <ul className="mt-1 space-y-0.5 text-sm text-[#3B4252]">
                {Object.entries(report.rewardGoalsByReason).map(([reason, count]) => (
                  <li key={reason}>
                    · <strong>{count}</strong>{" "}
                    {REWARD_GOAL_REASON_LABEL[reason] ?? reason}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-xs text-[#8891A4]">
                Ninguna meta real fue creada ni se reservó ningún beneficio.
              </p>
            </div>
          ) : null}

          <p className="mt-3 text-xs text-[#8891A4]">
            Para pasar a enviar de verdad, elegí &quot;En vivo&quot; arriba, en
            Retención.
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-[#8891A4]">
          Todavía no corrió ninguna evaluación hoy.
        </p>
      )}
    </section>
  );
}
