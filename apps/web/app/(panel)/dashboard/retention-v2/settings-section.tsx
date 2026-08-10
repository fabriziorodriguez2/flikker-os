"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { RetentionSettingsView } from "./types";

/**
 * Pre-piloto #4 — un solo estado en vez de dos switches independientes
 * ("Activada" + "Modo observación"). Puramente una recombinación de la UI:
 * el backend sigue teniendo exactamente los mismos dos booleans
 * (`automaticCampaignsEnabled`, `dryRunEnabled`) — ningún endpoint ni campo
 * nuevo. Esto NO es `optimizationMode` (eso sigue intacto en Configuración
 * avanzada, OFF/ASSISTED/AUTOMATIC).
 *
 *   Desactivada → automaticCampaignsEnabled=false
 *   Observación → automaticCampaignsEnabled=true,  dryRunEnabled=true
 *   En vivo     → automaticCampaignsEnabled=true,  dryRunEnabled=false
 */
type RetentionState = "OFF" | "OBSERVING" | "LIVE";

function deriveState(settings: RetentionSettingsView): RetentionState {
  if (!settings.automaticCampaignsEnabled) return "OFF";
  return settings.dryRunEnabled ? "OBSERVING" : "LIVE";
}

const STATE_OPTIONS: {
  key: RetentionState;
  label: string;
  detail: string;
}[] = [
  {
    key: "OFF",
    label: "Desactivada",
    detail: "No procesa retención automática.",
  },
  {
    key: "OBSERVING",
    label: "Observación",
    detail:
      "Flikker analiza y registra qué habría hecho, pero no manda mensajes ni entrega beneficios.",
  },
  {
    key: "LIVE",
    label: "En vivo",
    detail: "Flikker analiza y puede mandar mensajes o beneficios reales.",
  },
];

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
  // Pasar a "En vivo" empieza a mandar mensajes/beneficios reales — pide
  // una confirmación explícita, igual que ya hacía el botón dedicado que
  // este radio reemplaza (ver dry-run-panel.tsx).
  const [confirmingLive, setConfirmingLive] = useState(false);

  const current = deriveState(settings);

  async function applyState(next: RetentionState) {
    setSaving(true);
    setError(null);
    try {
      if (next === "OFF") {
        await onSave({ automaticCampaignsEnabled: false });
      } else if (next === "OBSERVING") {
        await onSave({ automaticCampaignsEnabled: true, dryRunEnabled: true });
      } else {
        await onSave({ automaticCampaignsEnabled: true, dryRunEnabled: false });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar.");
    } finally {
      setSaving(false);
      setConfirmingLive(false);
    }
  }

  function selectState(next: RetentionState) {
    if (next === "LIVE" && current !== "LIVE") {
      setConfirmingLive(true);
      return;
    }
    void applyState(next);
  }

  const showBudgetWarning =
    settings.hasIncentiveBearingVariants && !settings.budgetConfigured;

  return (
    <section className="rounded-[14px] border border-[#E8EAF0] bg-white p-5">
      <h2 className="text-base font-bold text-[#1A202C]">Retención</h2>
      <p className="mt-1 text-sm text-[#8891A4]">
        El motor detecta clientes en riesgo o inactivos y les manda un
        recordatorio o un beneficio, sin que tengas que hacer nada.
      </p>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {STATE_OPTIONS.map((option) => (
          <label
            key={option.key}
            className={`flex cursor-pointer flex-col gap-1 rounded-[10px] border px-3.5 py-3 transition-colors ${
              current === option.key
                ? "border-[#5C6BC0] bg-[#EEF0FB]"
                : "border-[#E8EAF0] hover:border-[#C7CCE6]"
            } ${!canMutate || saving ? "cursor-default opacity-70" : ""}`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-[#1A202C]">
              <input
                type="radio"
                name="retention-state"
                checked={current === option.key}
                disabled={!canMutate || saving}
                onChange={() => selectState(option.key)}
                className="h-4 w-4 accent-[#5C6BC0]"
              />
              {option.label}
            </span>
            <span className="text-xs text-[#8891A4]">{option.detail}</span>
          </label>
        ))}
      </div>

      {confirmingLive ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[10px] border border-[#DCE3F7] bg-[#F5F7FF] px-4 py-3">
          <p className="text-sm text-[#1A202C]">
            ¿Pasar a En vivo? Flikker va a empezar a enviar mensajes y otorgar
            beneficios de verdad.
          </p>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => setConfirmingLive(false)}
              className="h-9 rounded-[8px] border border-[#E8EAF0] px-3 text-sm font-semibold text-[#1A202C]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void applyState("LIVE")}
              disabled={saving}
              className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-3 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Sí, pasar a en vivo
            </button>
          </div>
        </div>
      ) : null}

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
