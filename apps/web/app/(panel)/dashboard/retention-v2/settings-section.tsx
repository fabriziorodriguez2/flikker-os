"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { RetentionSettingsView } from "./types";

/**
 * Piloto V2 — Retención principal ultra simple: solo los dos switches que
 * un dueño necesita tocar día a día. Ticket/margen/mensajes/presupuesto se
 * movieron a Configuración avanzada (`AdvancedSettingsSection`) — siguen
 * siendo los mismos campos, mismo endpoint, solo reubicados.
 */
export default function SettingsSection({
  settings,
  canMutate,
  onSave,
}: {
  settings: RetentionSettingsView;
  canMutate: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveField(patch: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      await onSave(patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar.");
    } finally {
      setSaving(false);
    }
  }

  const showBudgetWarning =
    settings.hasIncentiveBearingVariants && !settings.budgetConfigured;

  return (
    <section className="rounded-[14px] border border-[#E8EAF0] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[#1A202C]">Retención automática</h2>
          <p className="mt-1 text-sm text-[#8891A4]">
            El motor detecta clientes en riesgo o inactivos y les manda un
            recordatorio o un beneficio, sin que tengas que hacer nada.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm font-semibold text-[#1A202C]">
          <input
            type="checkbox"
            checked={settings.automaticCampaignsEnabled}
            disabled={!canMutate || saving}
            onChange={(e) => saveField({ automaticCampaignsEnabled: e.target.checked })}
            className="h-4 w-4 accent-[#5C6BC0]"
          />
          Activada
        </label>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-[10px] bg-[#F5F6FA] px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-[#1A202C]">Modo observación</p>
          <p className="text-xs text-[#8891A4]">
            El motor decide todo pero no manda ni un mensaje ni un beneficio —
            solo lo registra. Ideal para mirar unos días antes de activar en serio.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm font-semibold text-[#1A202C]">
          <input
            type="checkbox"
            checked={settings.dryRunEnabled}
            disabled={!canMutate || saving}
            onChange={(e) => saveField({ dryRunEnabled: e.target.checked })}
            className="h-4 w-4 accent-[#5C6BC0]"
          />
          {settings.dryRunEnabled ? "Observando" : "Automático"}
        </label>
      </div>

      {showBudgetWarning ? (
        <div className="mt-4 flex items-start gap-2 rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Tenés incentivos automáticos habilitados pero no configuraste un
            límite mensual en Configuración avanzada. Por seguridad, Flikker
            no va a ofrecer ningún beneficio hasta que definas al menos un
            tope.
          </p>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-[#C0392B]">{error}</p> : null}
    </section>
  );
}
