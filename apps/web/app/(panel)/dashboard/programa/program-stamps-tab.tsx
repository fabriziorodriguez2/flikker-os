"use client";

import { useState } from "react";
import { Loader2, Stamp } from "lucide-react";
import ProgramDesignTab from "./program-design-tab";
import type { LoyaltyAppearance, LoyaltyProgramOverview, ProgramBenefit } from "./types";

const inputClass =
  "mt-1 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm text-[#1A202C] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]";

const REWARD_TYPES = [
  { value: "gift", label: "Regalo" },
  { value: "discount", label: "Descuento porcentual" },
  { value: "promotion", label: "2x1" },
  { value: "upgrade", label: "Upgrade" },
  { value: "other", label: "Personalizado" },
];

/**
 * "Sellos" — la tarjeta es OPCIONAL, no el corazón de Programa. Con el
 * toggle OFF: no se crean Reward Goals nuevos, no se muestra progreso al
 * cliente y no se manda recordatorio — los beneficios y el resto de
 * Retention siguen funcionando igual (eso lo garantiza el backend, acá solo
 * se refleja el estado).
 *
 * El diseño de la tarjeta vive ACÁ adentro, como subsección, y solo se
 * muestra con la tarjeta activa — configurar cómo se ve algo que no existe
 * no tiene sentido.
 */
export default function ProgramStampsTab({
  overview,
  benefits,
  appearance,
  businessName,
  canMutate,
  onToggle,
  onSaveConfig,
  onSaveDesign,
  onReload,
}: {
  overview: LoyaltyProgramOverview;
  benefits: ProgramBenefit[];
  appearance: LoyaltyAppearance;
  businessName: string;
  canMutate: boolean;
  onToggle: (enabled: boolean) => Promise<void>;
  onSaveConfig: (patch: {
    stampsRequired: number;
    rewardBenefitId?: string;
    rewardTitle?: string;
    rewardType?: string;
    feedbackBonusEnabled?: boolean;
  }) => Promise<void>;
  onSaveDesign: (patch: Record<string, unknown>) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const redeemable = benefits.filter((b) => b.type !== "none");
  const [rewardBenefitId, setRewardBenefitId] = useState(
    overview.reward?.benefitId ?? "",
  );
  const [newRewardTitle, setNewRewardTitle] = useState("");
  const [newRewardType, setNewRewardType] = useState("gift");
  const [stamps, setStamps] = useState(overview.stampsRequired ?? 5);
  const [feedbackBonus, setFeedbackBonus] = useState(
    overview.feedbackBonusEnabled,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function saveConfig() {
    if (!rewardBenefitId && !newRewardTitle.trim()) {
      setError("Elegí o creá una recompensa");
      return;
    }
    await run(() =>
      onSaveConfig({
        stampsRequired: stamps,
        ...(rewardBenefitId
          ? { rewardBenefitId }
          : { rewardTitle: newRewardTitle.trim(), rewardType: newRewardType }),
        feedbackBonusEnabled: feedbackBonus,
      }),
    );
  }

  if (!overview.enabled) {
    return (
      <div className="space-y-5">
        <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF0FB] text-[#5C6BC0]">
            <Stamp className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 text-base font-bold text-[#1A202C]">
            Tarjeta de sellos desactivada
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-[#8891A4]">
            Podés activarla si querés premiar las visitas frecuentes. Los
            beneficios y el resto de Notificaciones siguen funcionando igual,
            estén activos o no.
          </p>
        </section>

        {canMutate ? (
          <ConfigForm
            redeemable={redeemable}
            rewardBenefitId={rewardBenefitId}
            setRewardBenefitId={setRewardBenefitId}
            newRewardTitle={newRewardTitle}
            setNewRewardTitle={setNewRewardTitle}
            newRewardType={newRewardType}
            setNewRewardType={setNewRewardType}
            stamps={stamps}
            setStamps={setStamps}
            feedbackBonus={feedbackBonus}
            setFeedbackBonus={setFeedbackBonus}
            saving={saving}
            error={error}
            onSubmit={() => void saveConfig()}
            submitLabel="Activar tarjeta de sellos"
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#1A202C]">
              Tarjeta de sellos activa
            </h2>
            <p className="mt-1 text-sm text-[#8891A4]">
              Tus clientes juntan sellos en cada visita y, al completar la
              tarjeta, se llevan la recompensa.
            </p>
          </div>
          {canMutate ? (
            <button
              type="button"
              onClick={() => void run(() => onToggle(false))}
              disabled={saving}
              className="shrink-0 text-sm font-semibold text-[#8891A4] hover:text-[#C0392B] disabled:opacity-50"
            >
              Desactivar
            </button>
          ) : null}
        </div>

        {overview.reward && overview.stampsRequired ? (
          <p className="mt-4 rounded-[12px] bg-[#F5F6FB] px-4 py-3 text-sm font-semibold text-[#1A202C]">
            {overview.stampsRequired} sellos → {overview.reward.name}
          </p>
        ) : null}
      </section>

      {canMutate ? (
        <ConfigForm
          redeemable={redeemable}
          rewardBenefitId={rewardBenefitId}
          setRewardBenefitId={setRewardBenefitId}
          newRewardTitle={newRewardTitle}
          setNewRewardTitle={setNewRewardTitle}
          newRewardType={newRewardType}
          setNewRewardType={setNewRewardType}
          stamps={stamps}
          setStamps={setStamps}
          feedbackBonus={feedbackBonus}
          setFeedbackBonus={setFeedbackBonus}
          saving={saving}
          error={error}
          onSubmit={() => void saveConfig()}
          submitLabel="Guardar cambios"
          note="Los clientes con una tarjeta en curso conservan el objetivo y la recompensa con la que empezaron — este cambio afecta solo a las tarjetas nuevas."
        />
      ) : null}

      <ProgramDesignTab
        appearance={appearance}
        businessName={businessName}
        rewardName={overview.reward?.name ?? "Tu recompensa"}
        stampsRequired={overview.stampsRequired ?? 5}
        canMutate={canMutate}
        onSave={onSaveDesign}
      />
    </div>
  );
}

function ConfigForm({
  redeemable,
  rewardBenefitId,
  setRewardBenefitId,
  newRewardTitle,
  setNewRewardTitle,
  newRewardType,
  setNewRewardType,
  stamps,
  setStamps,
  feedbackBonus,
  setFeedbackBonus,
  saving,
  error,
  onSubmit,
  submitLabel,
  note,
}: {
  redeemable: ProgramBenefit[];
  rewardBenefitId: string;
  setRewardBenefitId: (v: string) => void;
  newRewardTitle: string;
  setNewRewardTitle: (v: string) => void;
  newRewardType: string;
  setNewRewardType: (v: string) => void;
  stamps: number;
  setStamps: (v: number) => void;
  feedbackBonus: boolean;
  setFeedbackBonus: (v: boolean) => void;
  saving: boolean;
  error: string | null;
  onSubmit: () => void;
  submitLabel: string;
  note?: string;
}) {
  return (
    <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5">
      <h2 className="text-base font-bold text-[#1A202C]">Configurar sellos</h2>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Recompensa
          </span>
          <select
            value={rewardBenefitId}
            onChange={(e) => setRewardBenefitId(e.target.value)}
            className={inputClass}
          >
            <option value="">Crear una nueva…</option>
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
            max={20}
            value={stamps}
            onChange={(e) =>
              setStamps(Math.min(20, Math.max(1, Number(e.target.value) || 1)))
            }
            className={inputClass}
          />
        </label>
      </div>

      {!rewardBenefitId ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-[160px_1fr]">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
              Tipo
            </span>
            <select
              value={newRewardType}
              onChange={(e) => setNewRewardType(e.target.value)}
              className={inputClass}
            >
              {REWARD_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
              ¿Qué se llevan?
            </span>
            <input
              value={newRewardTitle}
              onChange={(e) => setNewRewardTitle(e.target.value)}
              placeholder="3 medialunas gratis"
              className={inputClass}
            />
          </label>
        </div>
      ) : null}

      <label className="mt-4 flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={feedbackBonus}
          onChange={(e) => setFeedbackBonus(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#5C6BC0]"
        />
        <span className="text-[#1A202C]">
          Dar +1 sello por completar feedback
          <span className="mt-0.5 block text-xs text-[#8891A4]">
            Se otorga por dar la opinión, sin importar el puntaje.
          </span>
        </span>
      </label>

      {note ? (
        <p className="mt-4 rounded-[10px] bg-[#F5F6FB] px-3 py-2 text-xs leading-5 text-[#7B8295]">
          {note}
        </p>
      ) : null}

      {error ? <p className="mt-3 text-sm text-[#C0392B]">{error}</p> : null}

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving}
          className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitLabel}
        </button>
      </div>
    </section>
  );
}
