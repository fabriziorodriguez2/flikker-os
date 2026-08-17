"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import type { LoyaltyProgramOverview } from "./types";

/**
 * "Bonus por feedback" — sección propia (antes era un checkbox metido dentro
 * de "Configurar sellos"). Solo tiene sentido si hay tarjeta de sellos: el
 * bonus es UN SELLO EXTRA, así que sin tarjeta no hay nada que sumar.
 *
 * Nunca se relaciona con Google Review — es exclusivamente sobre el feedback
 * privado que el cliente deja en el check-in.
 */
export default function ProgramFeedbackBonusSection({
  overview,
  canMutate,
  onSaveConfig,
  onReload,
}: {
  overview: LoyaltyProgramOverview;
  canMutate: boolean;
  onSaveConfig: (patch: {
    stampsRequired: number;
    rewardBenefitId?: string;
    rewardTitle?: string;
    rewardType?: string;
    feedbackBonusEnabled?: boolean;
  }) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(overview.feedbackBonusEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stampsReady = overview.enabled && overview.stampsRequired !== null;

  async function toggle(next: boolean) {
    if (!stampsReady) return;
    setEnabled(next);
    setSaving(true);
    setError(null);
    try {
      // Se guarda con los mismos sellos/recompensa vigentes — esta sección
      // solo cambia el bonus, nunca la tarjeta.
      await onSaveConfig({
        stampsRequired: overview.stampsRequired as number,
        rewardBenefitId: overview.reward?.benefitId ?? undefined,
        feedbackBonusEnabled: next,
      });
      await onReload();
    } catch (e) {
      setEnabled(!next);
      setError(e instanceof Error ? e.message : "No pudimos guardar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5">
      <h2 className="font-display text-base font-bold text-[#1A202C]">Bonus por feedback</h2>
      <p className="mt-1 text-sm text-[#8891A4]">
        Cuando un cliente completa el feedback privado, recibe un sello
        extra.
      </p>

      {!stampsReady ? (
        <p className="mt-4 rounded-[10px] bg-[#F5F6FB] px-3.5 py-2.5 text-sm text-[#7B8295]">
          Activá la tarjeta de sellos primero — el bonus es un sello extra, y
          sin tarjeta no hay nada que sumar.
        </p>
      ) : null}

      <label
        className={`mt-4 flex items-start gap-2.5 text-sm ${
          stampsReady ? "" : "opacity-50"
        }`}
      >
        <input
          type="checkbox"
          checked={enabled}
          disabled={!canMutate || !stampsReady || saving}
          onChange={(e) => void toggle(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#5C6BC0]"
        />
        <span className="text-[#1A202C]">
          Dar +1 sello por completar feedback
          <span className="mt-0.5 block text-xs text-[#8891A4]">
            Se otorga por dar la opinión, sin importar el puntaje. No tiene
            relación con las reseñas de Google.
          </span>
        </span>
      </label>

      {saving ? (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-[#8891A4]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Guardando…
        </p>
      ) : null}
      {error ? <p className="mt-3 text-sm text-[#C0392B]">{error}</p> : null}
    </section>
  );
}
