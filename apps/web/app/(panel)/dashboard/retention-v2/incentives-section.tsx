"use client";

import { useState } from "react";
import type { RetentionIncentive } from "./types";
import { TYPE_LABEL } from "./types";

/**
 * Piloto V2 (ajuste UX) — ya NO se crean incentivos acá. "Beneficios" es el
 * único lugar donde el dueño crea algo nuevo; esta sección pasa a ser
 * exclusivamente "de los que ya existen, ¿cuáles puede usar la
 * automatización de Retención?" — autorizar/desautorizar y activar/pausar,
 * nada más.
 *
 * Filas vinculadas a un Benefit (puente de Beneficios, `benefitId` seteado)
 * quedan de solo lectura para "Autorizado": ese flag se edita únicamente
 * desde /dashboard/beneficios ("Usar para recuperar clientes") para que
 * nunca haya dos fuentes de verdad para el mismo booleano. Las filas legacy
 * (creadas directamente, sin Benefit) siguen editables acá exactamente como
 * antes — no hay otro lugar donde tocarlas.
 */
export default function IncentivesSection({
  incentives,
  canMutate,
  onUpdate,
}: {
  incentives: RetentionIncentive[];
  canMutate: boolean;
  onUpdate: (id: string, payload: Record<string, unknown>) => Promise<void>;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggleAuthorized(incentive: RetentionIncentive) {
    if (incentive.benefitId) return;
    setBusyId(incentive.id);
    try {
      await onUpdate(incentive.id, { automationEligible: !incentive.automationEligible });
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(incentive: RetentionIncentive) {
    setBusyId(incentive.id);
    try {
      await onUpdate(incentive.id, { active: !incentive.active });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-[14px] border border-[#E8EAF0] bg-white p-5">
      <h2 className="text-base font-bold text-[#1A202C]">Incentivos permitidos</h2>
      <p className="mt-1 text-sm text-[#8891A4]">
        Flikker nunca va a utilizar automáticamente un beneficio que no esté
        autorizado acá.
      </p>

      {incentives.length === 0 ? (
        <p className="mt-4 text-sm text-[#8891A4]">
          Todavía no hay ningún incentivo configurado para Retención.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="flk-table w-full min-w-[680px] text-left text-sm">
            <thead className="bg-[#F5F6FA] text-[12px] uppercase tracking-[0.08em] text-[#8891A4]">
              <tr>
                <th className="px-4 py-3 font-semibold">Nombre</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Origen</th>
                <th className="px-4 py-3 font-semibold">Valor</th>
                <th className="px-4 py-3 font-semibold">Autorizado</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
              </tr>
            </thead>
            <tbody>
              {incentives.map((incentive) => (
                <tr key={incentive.id} className="border-t border-[#E8EAF0]">
                  <td className="px-4 py-3 font-semibold text-[#1A202C]">
                    {incentive.name}
                  </td>
                  <td className="px-4 py-3 text-[#1A202C]">{TYPE_LABEL[incentive.type]}</td>
                  <td className="px-4 py-3">
                    {incentive.benefitId ? (
                      <span className="rounded-full bg-[#EEF0FB] px-2 py-0.5 text-[10px] font-semibold text-[#5C6BC0]">
                        Beneficio
                      </span>
                    ) : (
                      <span className="text-xs text-[#8891A4]">Directo</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#1A202C]">
                    {incentive.percentageValue ? (
                      `${incentive.percentageValue}%`
                    ) : incentive.fixedValue ? (
                      `$${incentive.fixedValue}`
                    ) : incentive.estimatedCost ? (
                      `$${incentive.estimatedCost} (costo est.)`
                    ) : (
                      <span className="text-[#8891A4]">
                        No disponible / costo no configurado
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={incentive.automationEligible}
                        disabled={!canMutate || busyId === incentive.id || !!incentive.benefitId}
                        onChange={() => toggleAuthorized(incentive)}
                        className="h-4 w-4 accent-[#5C6BC0]"
                      />
                      <span
                        className={
                          incentive.automationEligible ? "text-[#2E7D32]" : "text-[#8891A4]"
                        }
                      >
                        {incentive.automationEligible ? "Autorizado" : "No autorizado"}
                      </span>
                    </label>
                    {incentive.benefitId ? (
                      <p className="mt-0.5 text-[10px] text-[#8891A4]">
                        Gestionado desde Beneficios
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {canMutate ? (
                      <button
                        type="button"
                        onClick={() => toggleActive(incentive)}
                        disabled={busyId === incentive.id}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold disabled:opacity-50 ${
                          incentive.active
                            ? "bg-[#E7F5EA] text-[#2E7D32]"
                            : "bg-[#F5F6FA] text-[#8891A4]"
                        }`}
                      >
                        {incentive.active ? "Activo" : "Inactivo"}
                      </button>
                    ) : (
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          incentive.active
                            ? "bg-[#E7F5EA] text-[#2E7D32]"
                            : "bg-[#F5F6FA] text-[#8891A4]"
                        }`}
                      >
                        {incentive.active ? "Activo" : "Inactivo"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
