"use client";

import { useState } from "react";
import { Loader2, Stamp } from "lucide-react";
import FlikkerSelect from "@/components/ui/flikker-select";
import ProgramSectionHeading from "./program-section-heading";
import type { LoyaltyProgramOverview, ProgramBenefit } from "./types";

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
 * "Tarjeta de sellos" — sección propia dentro de Configuración. La tarjeta es
 * OPCIONAL, no el corazón de Programa. Con el toggle OFF: no se crean Reward
 * Goals nuevos, no se muestra progreso al cliente y no se manda recordatorio
 * — los beneficios y el resto de Retention siguen funcionando igual, estén
 * activos o no (eso lo garantiza el backend, acá solo se refleja el estado).
 *
 * El diseño y el bonus por feedback se movieron a sus propias secciones — acá
 * solo se decide UNA cosa: cuántos sellos, y qué única recompensa los cierra.
 * No es el catálogo de Beneficios (eso vive aparte).
 */
export default function ProgramStampsSection({
  overview,
  benefits,
  canMutate,
  onToggle,
  onSaveConfig,
  onReload,
}: {
  overview: LoyaltyProgramOverview;
  benefits: ProgramBenefit[];
  canMutate: boolean;
  onToggle: (enabled: boolean) => Promise<void>;
  onSaveConfig: (patch: {
    stampsRequired: number;
    rewardBenefitId?: string;
    rewardTitle?: string;
    rewardType?: string;
    feedbackBonusEnabled?: boolean;
  }) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const redeemable = benefits.filter((b) => b.type !== "none");
  const [rewardBenefitId, setRewardBenefitId] = useState(
    overview.reward?.benefitId ?? "",
  );
  const [newRewardTitle, setNewRewardTitle] = useState("");
  const [newRewardType, setNewRewardType] = useState("gift");
  const [stamps, setStamps] = useState(overview.stampsRequired ?? 5);
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
        // El bonus por feedback ahora se guarda desde su propia sección — acá
        // se manda el valor actual sin cambiarlo, para no pisarlo.
        feedbackBonusEnabled: overview.feedbackBonusEnabled,
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
          <h2 className="mt-4 font-display text-base font-bold text-[#1A202C]">
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
      <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-6">
        <ProgramSectionHeading
          icon={Stamp}
          title="Tarjeta de sellos activa"
          description="Tus clientes juntan sellos en cada visita y, al completar la tarjeta, se llevan la recompensa."
          action={
            canMutate ? (
              <button
                type="button"
                onClick={() => void run(() => onToggle(false))}
                disabled={saving}
                className="shrink-0 text-sm font-semibold text-[#8891A4] hover:text-[#C0392B] disabled:opacity-50"
              >
                Desactivar
              </button>
            ) : null
          }
        />

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
          saving={saving}
          error={error}
          onSubmit={() => void saveConfig()}
          submitLabel="Guardar cambios"
          note="Los clientes con una tarjeta en curso conservan el objetivo y la recompensa con la que empezaron — este cambio afecta solo a las tarjetas nuevas."
        />
      ) : null}
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
  saving: boolean;
  error: string | null;
  onSubmit: () => void;
  submitLabel: string;
  note?: string;
}) {
  return (
    <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-6">
      {/* Sección 8 — clarísimo por estructura: es UNA recompensa para la
          tarjeta, no el catálogo completo (eso está en "Beneficios"). */}
      <ProgramSectionHeading
        icon={Stamp}
        title="Configurar sellos"
        description={
          <>
            Elegí la única recompensa que se entrega al completar la tarjeta. El
            resto de tu catálogo vive en{" "}
            <span className="font-semibold text-[#5C6BC0]">Beneficios</span>.
          </>
        }
      />

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Recompensa de la tarjeta
          </span>
          <FlikkerSelect
            value={rewardBenefitId}
            onChange={setRewardBenefitId}
            ariaLabel="Recompensa de la tarjeta"
            className="mt-1"
            options={[
              {
                value: "",
                label: "Crear una nueva…",
                description: "Definir una recompensa personalizada",
              },
              ...redeemable.map((benefit) => ({
                value: benefit.id,
                label: benefit.title,
              })),
            ]}
          />
        </div>

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
          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
              Tipo
            </span>
            <FlikkerSelect
              value={newRewardType}
              onChange={setNewRewardType}
              ariaLabel="Tipo de recompensa"
              className="mt-1"
              options={REWARD_TYPES}
            />
          </div>
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

      {/*
        Acá vivía un resumen "N sellos → recompensa" que repetía, palabra por
        palabra, lo que ya dicen los dos campos que están justo arriba y el
        bloque de "Tarjeta de sellos activa". Se saca por redundante: no
        aportaba un dato nuevo, solo ruido visual. La lógica de configuración
        y el snapshot de las goals existentes no se tocan.
      */}

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
          className="flk-glossy inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {submitLabel}
        </button>
      </div>
    </section>
  );
}
