"use client";

import { useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import type { DryRunReport } from "./types";

export default function DryRunPanel({
  report,
  dryRunEnabled,
  canMutate,
  onGoLive,
}: {
  report: DryRunReport | null;
  dryRunEnabled: boolean;
  canMutate: boolean;
  onGoLive: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [switching, setSwitching] = useState(false);

  if (!dryRunEnabled) return null;

  async function goLive() {
    setSwitching(true);
    try {
      await onGoLive();
    } finally {
      setSwitching(false);
      setConfirming(false);
    }
  }

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
        </>
      ) : (
        <p className="mt-2 text-sm text-[#8891A4]">
          Todavía no corrió ninguna evaluación hoy.
        </p>
      )}

      {canMutate ? (
        <div className="mt-4">
          {confirming ? (
            <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-[#DCE3F7] bg-white px-4 py-3">
              <p className="text-sm text-[#1A202C]">
                ¿Pasar a automático? Flikker va a empezar a enviar mensajes y
                otorgar beneficios de verdad.
              </p>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="h-9 rounded-[8px] border border-[#E8EAF0] px-3 text-sm font-semibold text-[#1A202C]"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={goLive}
                  disabled={switching}
                  className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-3 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
                >
                  {switching ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Sí, activar automático
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-white border border-[#5C6BC0] px-4 text-sm font-semibold text-[#5C6BC0] hover:bg-[#EEF0FB]"
            >
              Pasar a automático
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
