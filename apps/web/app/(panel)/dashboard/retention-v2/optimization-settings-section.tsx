"use client";

import { useState } from "react";
import { Gauge, Loader2 } from "lucide-react";
import type { OptimizationMode, RetentionSettingsView } from "./types";
import { OPTIMIZATION_MODE_LABEL } from "./types";

const MODES: OptimizationMode[] = ["OFF", "ASSISTED", "AUTOMATIC"];

/**
 * Fase G §29/§30/§39 — the one control that matters: OFF/ASSISTED/AUTOMATIC.
 * Deliberately no separate on/off flag (§29) — OFF already means "nothing
 * changes automatically". The limits themselves (control mínimo, cambio
 * máximo, cooldown, ...) keep their safe defaults; there is no UI to loosen
 * them yet — Fase G §30 explicitly asks for a simple surface, not a tuning
 * panel.
 */
export default function OptimizationSettingsSection({
  settings,
  canMutate,
  onSaveSettings,
}: {
  settings: RetentionSettingsView;
  canMutate: boolean;
  onSaveSettings: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function setMode(mode: OptimizationMode) {
    setSaving(true);
    setError(null);
    try {
      await onSaveSettings({ optimizationMode: mode });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[14px] border border-[#E8EAF0] bg-white p-5">
      <div className="flex items-start gap-2">
        <Gauge className="mt-0.5 h-4 w-4 shrink-0 text-[#5C6BC0]" />
        <div>
          <h2 className="text-base font-bold text-[#1A202C]">Optimización</h2>
          <p className="mt-1 text-sm text-[#8891A4]">
            Cuando hay suficiente evidencia, Flikker puede favorecer
            gradualmente la variante que mejor está rindiendo — siempre
            manteniendo un grupo de control y explorando el resto. La
            decisión es 100% determinística; la IA nunca participa en esto.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            disabled={!canMutate || saving}
            onClick={() => setMode(mode)}
            className={`rounded-[10px] border px-3.5 py-3 text-left transition-colors ${
              settings.optimizationMode === mode
                ? "border-[#5C6BC0] bg-[#EEF0FB]"
                : "border-[#E8EAF0] hover:border-[#C7CCE6]"
            }`}
          >
            <p className="text-sm font-semibold text-[#1A202C]">
              {OPTIMIZATION_MODE_LABEL[mode]}
            </p>
            <p className="mt-0.5 text-xs text-[#8891A4]">
              {mode === "OFF" && "La distribución entre variantes queda fija hasta que la cambies a mano."}
              {mode === "ASSISTED" && "Flikker propone un cambio y vos lo confirmás."}
              {mode === "AUTOMATIC" && "Flikker ajusta las asignaciones futuras dentro de tus límites."}
            </p>
          </button>
        ))}
      </div>

      {settings.optimizationMode === "AUTOMATIC" ? (
        <p className="mt-3 text-xs text-[#8891A4]">
          Flikker ajustará futuras asignaciones dentro de tus límites — nunca
          por debajo de {settings.minimumControlPercent}% de control ni más de{" "}
          {settings.maxAllocationChangePerOptimization} puntos por ronda.
        </p>
      ) : null}

      {saving && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-[#8891A4]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…
        </p>
      )}
      {error ? <p className="mt-3 text-sm text-[#C0392B]">{error}</p> : null}
    </section>
  );
}
