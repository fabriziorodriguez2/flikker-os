"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import type { RetentionSettingsView } from "./types";

const inputClass =
  "mt-1 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm text-[#1A202C] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]";

interface FormState {
  averageTicketAmount: string;
  estimatedMarginPercent: string;
  maximumRetentionMessagesPer30Days: string;
  minimumDaysBetweenRetentionMessages: string;
  maxAutomatedIncentivesPerMonth: string;
  maxEstimatedIncentiveCostPerMonth: string;
}

function toForm(s: RetentionSettingsView): FormState {
  return {
    averageTicketAmount: s.averageTicketAmount?.toString() ?? "",
    estimatedMarginPercent: s.estimatedMarginPercent?.toString() ?? "",
    maximumRetentionMessagesPer30Days: String(s.maximumRetentionMessagesPer30Days),
    minimumDaysBetweenRetentionMessages: String(s.minimumDaysBetweenRetentionMessages),
    maxAutomatedIncentivesPerMonth: s.maxAutomatedIncentivesPerMonth?.toString() ?? "",
    maxEstimatedIncentiveCostPerMonth: s.maxEstimatedIncentiveCostPerMonth?.toString() ?? "",
  };
}

export default function SettingsSection({
  settings,
  canMutate,
  onSave,
}: {
  settings: RetentionSettingsView;
  canMutate: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState<FormState>(toForm(settings));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

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

  async function saveNumbers() {
    await saveField({
      averageTicketAmount: form.averageTicketAmount ? Number(form.averageTicketAmount) : undefined,
      estimatedMarginPercent: form.estimatedMarginPercent ? Number(form.estimatedMarginPercent) : undefined,
      maximumRetentionMessagesPer30Days: Number(form.maximumRetentionMessagesPer30Days),
      minimumDaysBetweenRetentionMessages: Number(form.minimumDaysBetweenRetentionMessages),
      maxAutomatedIncentivesPerMonth: form.maxAutomatedIncentivesPerMonth
        ? Number(form.maxAutomatedIncentivesPerMonth)
        : undefined,
      maxEstimatedIncentiveCostPerMonth: form.maxEstimatedIncentiveCostPerMonth
        ? Number(form.maxEstimatedIncentiveCostPerMonth)
        : undefined,
    });
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
            límite mensual. Por seguridad, Flikker no va a ofrecer ningún
            beneficio hasta que definas al menos un tope abajo.
          </p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Ticket promedio ($)
          </span>
          <input
            type="number"
            min={0}
            value={form.averageTicketAmount}
            onChange={(e) => set("averageTicketAmount", e.target.value)}
            className={inputClass}
            placeholder="Opcional"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Margen estimado (%)
          </span>
          <input
            type="number"
            min={0}
            max={100}
            value={form.estimatedMarginPercent}
            onChange={(e) => set("estimatedMarginPercent", e.target.value)}
            className={inputClass}
            placeholder="Opcional"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Máx. mensajes / 30 días por cliente
          </span>
          <input
            type="number"
            min={1}
            value={form.maximumRetentionMessagesPer30Days}
            onChange={(e) => set("maximumRetentionMessagesPer30Days", e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Días mínimos entre mensajes
          </span>
          <input
            type="number"
            min={1}
            value={form.minimumDaysBetweenRetentionMessages}
            onChange={(e) => set("minimumDaysBetweenRetentionMessages", e.target.value)}
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Máx. incentivos automáticos / mes
          </span>
          <input
            type="number"
            min={0}
            value={form.maxAutomatedIncentivesPerMonth}
            onChange={(e) => set("maxAutomatedIncentivesPerMonth", e.target.value)}
            className={inputClass}
            placeholder="Sin límite = no se ofrece ninguno"
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Presupuesto promocional mensual ($)
          </span>
          <input
            type="number"
            min={0}
            value={form.maxEstimatedIncentiveCostPerMonth}
            onChange={(e) => set("maxEstimatedIncentiveCostPerMonth", e.target.value)}
            className={inputClass}
            placeholder="Sin límite = no se ofrece ninguno"
          />
        </label>
      </div>

      {error ? <p className="mt-3 text-sm text-[#C0392B]">{error}</p> : null}

      {canMutate ? (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={saveNumbers}
            disabled={saving}
            className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Guardar
          </button>
        </div>
      ) : null}
    </section>
  );
}
