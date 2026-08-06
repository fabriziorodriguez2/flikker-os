"use client";

import { useState } from "react";
import { Gift, Loader2 } from "lucide-react";
import type { RetentionIncentive, RetentionSettingsView } from "./types";

const inputClass =
  "mt-1 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm text-[#1A202C] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]";

/**
 * Fase E §30/§31 — "RECOMPENSAS POR VISITAS". The owner only ever picks WHICH
 * incentives are authorized and (optionally) a visit range; the engine
 * decides when to create a goal and exactly how many visits within that
 * range — nobody has to configure "every 5 visits" by hand.
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
  const [minVisits, setMinVisits] = useState(
    settings.rewardGoalMinVisits?.toString() ?? "",
  );
  const [maxVisits, setMaxVisits] = useState(
    settings.rewardGoalMaxVisits?.toString() ?? "",
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

  async function saveRange() {
    await saveField({
      rewardGoalMinVisits: minVisits ? Number(minVisits) : undefined,
      rewardGoalMaxVisits: maxVisits ? Number(maxVisits) : undefined,
    });
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
          <h2 className="text-base font-bold text-[#1A202C]">Recompensas por visitas</h2>
          <p className="mt-1 text-sm text-[#8891A4]">
            Flikker puede crear metas automáticamente: &ldquo;Te faltan N
            visitas para tu recompensa&rdquo;. Vos elegís qué recompensas están
            permitidas; el motor decide cuándo y a cuántas visitas.
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
            Todavía no configuraste ningún incentivo — creá uno en la sección
            de abajo para poder autorizarlo aquí.
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

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Mínimo de visitas (opcional)
          </span>
          <input
            type="number"
            min={1}
            max={20}
            value={minVisits}
            onChange={(e) => setMinVisits(e.target.value)}
            className={inputClass}
            placeholder="El motor elige un default"
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Máximo de visitas (opcional)
          </span>
          <input
            type="number"
            min={1}
            max={20}
            value={maxVisits}
            onChange={(e) => setMaxVisits(e.target.value)}
            className={inputClass}
            placeholder="El motor elige un default"
          />
        </label>
      </div>

      {error ? <p className="mt-3 text-sm text-[#C0392B]">{error}</p> : null}

      {canMutate ? (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={saveRange}
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
