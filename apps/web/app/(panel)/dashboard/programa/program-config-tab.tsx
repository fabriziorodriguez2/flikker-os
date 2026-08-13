"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { LoyaltyProgramOverview, ProgramBenefit } from "./types";

const inputClass =
  "mt-1 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm text-[#1A202C] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]";

/**
 * "Configuración" del Programa. Escribe sobre endpoints que ya existían
 * (`/retention-v2/settings` y `/benefits/:id/*`), sin nombrarlos: lo que el
 * dueño ve es "sellos necesarios" y "recompensa", no reward goals ni
 * incentive definitions.
 */
export default function ProgramConfigTab({
  overview,
  benefits,
  canMutate,
  onSaveSettings,
  onSetBenefitUse,
  onReload,
}: {
  overview: LoyaltyProgramOverview;
  benefits: ProgramBenefit[];
  canMutate: boolean;
  onSaveSettings: (patch: Record<string, unknown>) => Promise<void>;
  onSetBenefitUse: (
    benefitId: string,
    use: "rewardCard" | "welcomeGift",
    value: boolean,
  ) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [stamps, setStamps] = useState(
    overview.stampsRequired?.toString() ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rewardBenefitId = overview.reward?.benefitId ?? "";
  const welcomeBenefitId = overview.welcomeGift?.benefitId ?? "";

  async function run(action: () => Promise<void>) {
    setSaving(true);
    setError(null);
    try {
      await action();
      await onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function changeReward(nextId: string) {
    await run(async () => {
      // Un solo beneficio es la recompensa: se apaga el anterior y se
      // enciende el nuevo, para que el dueño nunca quede con dos.
      if (rewardBenefitId && rewardBenefitId !== nextId) {
        await onSetBenefitUse(rewardBenefitId, "rewardCard", false);
      }
      if (nextId) await onSetBenefitUse(nextId, "rewardCard", true);
    });
  }

  async function changeWelcome(nextId: string) {
    // `Business.welcomeBenefitId` es un solo campo: fijar uno nuevo ya
    // reemplaza al anterior. Solo hay que limpiarlo si se elige "ninguno".
    await run(async () => {
      if (nextId) await onSetBenefitUse(nextId, "welcomeGift", true);
      else if (welcomeBenefitId) {
        await onSetBenefitUse(welcomeBenefitId, "welcomeGift", false);
      }
    });
  }

  const redeemable = benefits.filter((b) => b.type !== "none");

  return (
    <div className="space-y-5">
      <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#1A202C]">
              Programa de fidelización
            </h2>
            <p className="mt-1 text-sm text-[#8891A4]">
              Tus clientes juntan sellos en cada visita y, al completar la
              tarjeta, se llevan la recompensa.
            </p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-sm font-semibold text-[#1A202C]">
            <input
              type="checkbox"
              checked={overview.enabled}
              disabled={!canMutate || saving}
              onChange={(e) =>
                void run(() =>
                  onSaveSettings({ rewardGoalsEnabled: e.target.checked }),
                )
              }
              className="h-4 w-4 accent-[#5C6BC0]"
            />
            {overview.enabled ? "Activo" : "Inactivo"}
          </label>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
              Recompensa
            </span>
            <select
              value={rewardBenefitId}
              disabled={!canMutate || saving}
              onChange={(e) => void changeReward(e.target.value)}
              className={inputClass}
            >
              <option value="">Elegí un beneficio…</option>
              {redeemable.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
              Sellos necesarios
            </span>
            <input
              type="number"
              min={1}
              max={12}
              value={stamps}
              disabled={!canMutate}
              onChange={(e) => setStamps(e.target.value)}
              onBlur={() => {
                const value = stamps ? Number(stamps) : undefined;
                if (value === overview.stampsRequired) return;
                void run(() =>
                  onSaveSettings({
                    rewardGoalMinVisits: value,
                    rewardGoalMaxVisits: value,
                  }),
                );
              }}
              className={inputClass}
              placeholder="Ej: 5"
            />
          </label>
        </div>

        {overview.reward && overview.stampsRequired ? (
          <p className="mt-4 rounded-[12px] bg-[#F5F6FB] px-4 py-3 text-sm font-semibold text-[#1A202C]">
            {overview.stampsRequired} sellos → {overview.reward.name}
          </p>
        ) : (
          <p className="mt-4 rounded-[12px] bg-[#FFF7EE] px-4 py-3 text-sm text-[#8A520D]">
            Elegí una recompensa y cuántos sellos hacen falta para que el
            programa empiece a funcionar.
          </p>
        )}

        <div className="mt-5 space-y-2.5 border-t border-[#F0F2FA] pt-4">
          <p className="flex items-center gap-2 text-sm text-[#1A202C]">
            <span className="text-[#639922]">✓</span>
            Cada visita suma 1 sello
          </p>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={overview.feedbackBonusEnabled}
              disabled={!canMutate || saving}
              onChange={(e) =>
                void run(() =>
                  onSaveSettings({
                    rewardGoalFeedbackBonusEnabled: e.target.checked,
                  }),
                )
              }
              className="mt-0.5 h-4 w-4 accent-[#5C6BC0]"
            />
            <span className="text-[#1A202C]">
              Dar 1 sello extra por completar el feedback
              <span className="mt-0.5 block text-xs text-[#8891A4]">
                Se otorga por dar la opinión, sin importar el puntaje y sin
                depender de que deje reseña en Google.
              </span>
            </span>
          </label>
        </div>
      </section>

      <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5">
        <h2 className="text-base font-bold text-[#1A202C]">
          Regalo de bienvenida
        </h2>
        <p className="mt-1 text-sm text-[#8891A4]">
          Opcional. Se le muestra a cada cliente nuevo en su primer check-in.
        </p>
        <label className="mt-4 block max-w-sm">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Beneficio
          </span>
          <select
            value={welcomeBenefitId}
            disabled={!canMutate || saving}
            onChange={(e) => void changeWelcome(e.target.value)}
            className={inputClass}
          >
            <option value="">Sin regalo de bienvenida</option>
            {redeemable.map((b) => (
              <option key={b.id} value={b.id}>
                {b.title}
              </option>
            ))}
          </select>
        </label>
      </section>

      {error ? <p className="text-sm text-[#C0392B]">{error}</p> : null}
      {saving ? (
        <p className="flex items-center gap-2 text-sm text-[#8891A4]">
          <Loader2 className="h-4 w-4 animate-spin" /> Guardando…
        </p>
      ) : null}
    </div>
  );
}
