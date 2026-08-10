"use client";

import { useState } from "react";
import { Check, Gift, Loader2 } from "lucide-react";
import type { RetentionIncentive, RetentionSettingsView } from "./types";

const inputClass =
  "mt-1 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm text-[#1A202C] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]";

/**
 * Fase E §30/§31 — "RECOMPENSAS POR SELLOS" (renombrado de "por visitas": el
 * progreso ya puede venir de una visita real O de completar el feedback
 * post-check-in, así que "visitas" dejó de ser la unidad correcta — ver §9
 * follow-up). El owner solo elige QUÉ recompensas están autorizadas y
 * cuántos sellos hacen falta; el engine sigue decidiendo todo lo demás.
 *
 * Ojo: esto es un cambio de COPY únicamente. `rewardGoalMinVisits`/
 * `rewardGoalMaxVisits` siguen siendo los mismos campos de siempre — no
 * tenía sentido renombrarlos en el schema solo porque el texto cambió.
 */
export default function RewardGoalsSettingsSection({
  settings,
  incentives,
  canMutate,
  onSaveSettings,
  onToggleIncentiveEligible,
}: {
  settings: RetentionSettingsView;
  incentives: RetentionIncentive[];
  canMutate: boolean;
  onSaveSettings: (patch: Record<string, unknown>) => Promise<void>;
  onToggleIncentiveEligible: (incentiveId: string, value: boolean) => Promise<void>;
}) {
  // Si min y max ya coinciden (el caso normal, incluido "nunca configurado"
  // -> ambos null), el campo simple los representa fielmente. Guardar acá
  // siempre escribe el mismo numero en los dos, colapsando cualquier rango
  // asimetrico que hubiera quedado de antes.
  const initialVisits =
    settings.rewardGoalMinVisits ?? settings.rewardGoalMaxVisits;
  const [visitsPerReward, setVisitsPerReward] = useState(
    initialVisits?.toString() ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyIncentiveId, setBusyIncentiveId] = useState<string | null>(null);

  async function saveField(patch: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      await onSaveSettings(patch);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function saveVisitsPerReward() {
    const value = visitsPerReward ? Number(visitsPerReward) : undefined;
    await saveField({
      rewardGoalMinVisits: value,
      rewardGoalMaxVisits: value,
    });
  }

  async function toggleFeedbackBonus(checked: boolean) {
    await saveField({ rewardGoalFeedbackBonusEnabled: checked });
  }

  async function toggleIncentive(incentive: RetentionIncentive) {
    setBusyIncentiveId(incentive.id);
    try {
      await onToggleIncentiveEligible(incentive.id, !incentive.rewardGoalEligible);
    } finally {
      setBusyIncentiveId(null);
    }
  }

  return (
    <section className="rounded-[14px] border border-[#E8EAF0] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[#1A202C]">Recompensas por sellos</h2>
          <p className="mt-1 text-sm text-[#8891A4]">
            Flikker crea metas automáticamente: &ldquo;Te faltan N sellos
            para tu recompensa&rdquo;. Elegí qué recompensas están permitidas
            y cuántos sellos hacen falta.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm font-semibold text-[#1A202C]">
          <input
            type="checkbox"
            checked={settings.rewardGoalsEnabled}
            disabled={!canMutate || saving}
            onChange={(e) => saveField({ rewardGoalsEnabled: e.target.checked })}
            className="h-4 w-4 accent-[#5C6BC0]"
          />
          {settings.rewardGoalsEnabled ? "Activadas" : "Desactivadas"}
        </label>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
          Recompensas permitidas
        </p>
        {incentives.length === 0 ? (
          <p className="mt-2 text-sm text-[#8891A4]">
            Todavía no tenés ningún incentivo configurado — creá uno desde
            Beneficios para poder autorizarlo aquí.
          </p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {incentives.map((incentive) => (
              <li key={incentive.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={incentive.rewardGoalEligible}
                  disabled={!canMutate || busyIncentiveId === incentive.id}
                  onChange={() => toggleIncentive(incentive)}
                  className="h-4 w-4 accent-[#5C6BC0]"
                />
                <span className="text-[#1A202C]">{incentive.name}</span>
                {!incentive.active ? (
                  <span className="rounded-full bg-[#F5F6FA] px-2 py-0.5 text-[10px] font-semibold text-[#8891A4]">
                    Inactivo
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 flex items-center gap-1.5 text-xs text-[#8891A4]">
          <Gift className="h-3.5 w-3.5" />
          Flikker nunca va a usar automáticamente un beneficio que no esté
          autorizado acá.
        </p>
      </div>

      <div className="mt-5">
        <label className="block max-w-xs">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Sellos necesarios para la recompensa
          </span>
          <input
            type="number"
            min={1}
            max={20}
            value={visitsPerReward}
            onChange={(e) => setVisitsPerReward(e.target.value)}
            className={inputClass}
            placeholder="Ej: 5"
          />
        </label>
        <p className="mt-2 text-xs text-[#8891A4]">
          Cada visita suma 1 sello. Ej: 5 → cada cliente ve &ldquo;te faltan N
          sellos&rdquo; hasta llegar a 5, siempre igual. Se aplica a todas las
          recompensas autorizadas arriba. Si lo dejás vacío, Flikker elige un
          número razonable según cada cliente.
        </p>

        <div className="mt-4 space-y-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-[#639922]">
            <Check className="h-3.5 w-3.5" />
            Cada visita suma 1 sello
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={settings.rewardGoalFeedbackBonusEnabled}
              disabled={!canMutate || saving}
              onChange={(e) => toggleFeedbackBonus(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-[#5C6BC0]"
            />
            <span className="text-[#1A202C]">
              Dar 1 sello extra por completar el feedback
              <span className="mt-0.5 block text-xs text-[#8891A4]">
                Feedback después de la visita suma 1 sello extra —
                independiente del puntaje, y no depende de si el cliente
                deja o no una reseña en Google.
              </span>
            </span>
          </label>
        </div>
      </div>

      {error ? <p className="mt-3 text-sm text-[#C0392B]">{error}</p> : null}

      {canMutate ? (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={saveVisitsPerReward}
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
