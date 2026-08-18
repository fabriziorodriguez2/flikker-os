"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  BENEFIT_TYPE_LABELS,
  CREATABLE_BENEFIT_TYPES,
  type ProgramBenefit,
} from "./types";

const inputClass =
  "mt-1 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm text-[#1A202C] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]";

/**
 * Catálogo de beneficios con sus tres usos INDEPENDIENTES. Cada uno vive en
 * un campo distinto del backend, así que marcar uno nunca cambia otro:
 *
 *   Recompensa de tarjeta  → RetentionIncentiveDefinition.rewardGoalEligible
 *   Regalo de bienvenida   → Business.welcomeBenefitId
 *   Reactivar clientes     → RetentionIncentiveDefinition.automationEligible
 *
 * `Benefit.active` NO participa de ninguno de los tres: significa "beneficio
 * visible en el check-in" y se re-asegura en cada visita, así que no puede
 * representar "se entrega una vez, en la primera visita".
 */
export default function ProgramBenefitsTab({
  benefits,
  welcomeBenefitId,
  canMutate,
  benefitsEnabled = true,
  trialExpired = false,
  onCreate,
  onDelete,
  onSetUse,
  onToggleBenefits,
  onReload,
}: {
  benefits: ProgramBenefit[];
  /** Cual es hoy el regalo de bienvenida (Business.welcomeBenefitId). */
  welcomeBenefitId: string | null;
  canMutate: boolean;
  /**
   * Capacidad independiente de sellos (Programa → Configuración): visibilidad
   * pública del catálogo. Apagarlo NUNCA borra beneficios ni historial — solo
   * deja de mostrarlos/entregarlos en el check-in (`RetentionSettings.
   * benefitsEnabled`). El catálogo sigue totalmente editable acá abajo.
   */
  benefitsEnabled?: boolean;
  /**
   * Self-service Beneficios: la prueba de 30 días venció. El catálogo
   * existente (edición, checkboxes de uso, borrado) sigue funcionando
   * intacto — el backend (`BenefitsService#create`) solo bloquea crear
   * beneficios NUEVOS, así que esto solo deshabilita ESE botón.
   */
  trialExpired?: boolean;
  onCreate: (payload: {
    type: string;
    title: string;
    description?: string;
  }) => Promise<void>;
  onDelete: (benefitId: string) => Promise<void>;
  onSetUse: (
    benefitId: string,
    use: "rewardCard" | "welcomeGift" | "reactivation",
    value: boolean,
  ) => Promise<void>;
  onToggleBenefits: (enabled: boolean) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [type, setType] = useState("gift");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [togglingCatalog, setTogglingCatalog] = useState(false);

  async function run(id: string, action: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar.");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleCatalog() {
    setTogglingCatalog(true);
    setError(null);
    try {
      await onToggleBenefits(!benefitsEnabled);
      await onReload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar.");
    } finally {
      setTogglingCatalog(false);
    }
  }

  async function submit() {
    if (!title.trim()) return;
    await run("new", async () => {
      await onCreate({
        type,
        title: title.trim(),
        description: description.trim() || undefined,
      });
      setTitle("");
      setDescription("");
      setCreating(false);
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-[#1A202C]">Beneficios</h2>
            <p className="mt-1 text-sm text-[#8891A4]">
              Un beneficio es algo que tu negocio ofrece para darle a un
              cliente una razón para volver — café gratis, 10% de descuento,
              2x1, un upgrade. Cada uno puede usarse para una o varias cosas a
              la vez: recompensa de la tarjeta, regalo de bienvenida,
              reactivación o promoción suelta.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {canMutate ? (
              <label className="flex items-center gap-2 text-sm font-semibold text-[#4A56A6]">
                <input
                  type="checkbox"
                  checked={benefitsEnabled}
                  disabled={togglingCatalog}
                  onChange={() => void toggleCatalog()}
                  className="h-4 w-4 accent-[#5C6BC0]"
                  aria-label="Mostrar el catálogo de beneficios a tus clientes"
                />
                Visible para tus clientes
              </label>
            ) : null}
            {canMutate ? (
              <button
                type="button"
                onClick={() => setCreating((v) => !v)}
                disabled={trialExpired}
                title={
                  trialExpired
                    ? "Tu prueba de 30 días terminó — actualizá tu plan para crear beneficios nuevos."
                    : undefined
                }
                className="flk-glossy inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> Nuevo beneficio
              </button>
            ) : null}
          </div>
        </div>

        {!benefitsEnabled ? (
          <p className="mt-4 rounded-[10px] bg-[#F0F1F6] px-3.5 py-2.5 text-sm text-[#5C6478]">
            Tus clientes no ven el catálogo ahora mismo — nada se borró, podés
            volver a mostrarlo cuando quieras. Podés seguir editándolo acá
            abajo mientras está apagado.
          </p>
        ) : null}

        {trialExpired ? (
          <p className="mt-4 rounded-[10px] bg-[#FFF7EE] px-3.5 py-2.5 text-sm text-[#8A520D]">
            Tu prueba de 30 días terminó — tu catálogo sigue funcionando
            igual, pero para agregar beneficios nuevos necesitás actualizar
            tu plan.
          </p>
        ) : null}

        {creating && !trialExpired ? (
          <div className="mt-5 rounded-[12px] border border-[#E8EAF0] bg-[#F9FAFD] p-4">
            <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
                  Tipo
                </span>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className={inputClass}
                >
                  {CREATABLE_BENEFIT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
                  Nombre
                </span>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ej: 3 medialunas gratis"
                  className={inputClass}
                />
              </label>
            </div>
            <label className="mt-3 block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
                Detalle (opcional)
              </span>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Condiciones o aclaraciones"
                className={inputClass}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCreating(false)}
                className="text-sm font-semibold text-[#8891A4] hover:text-[#1A202C]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busyId === "new" || !title.trim()}
                className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
              >
                {busyId === "new" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Crear
              </button>
            </div>
          </div>
        ) : null}

        {error ? <p className="mt-4 text-sm text-[#C0392B]">{error}</p> : null}

        {benefits.length === 0 ? (
          <p className="mt-5 text-sm text-[#8891A4]">
            Todavía no creaste ningún beneficio. Empezá por el que vas a dar
            como recompensa de la tarjeta.
          </p>
        ) : (
          <ul className="mt-5 space-y-3">
            {benefits.map((benefit) => {
              const busy = busyId === benefit.id;
              return (
                <li
                  key={benefit.id}
                  className="rounded-[12px] border border-[#E8EAF0] bg-white p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="rounded-full bg-[#EEF0FB] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#5C6BC0]">
                        {BENEFIT_TYPE_LABELS[benefit.type] ?? benefit.type}
                      </span>
                      <p className="mt-2 text-base font-bold text-[#1A202C]">
                        {benefit.title}
                      </p>
                      {benefit.description ? (
                        <p className="mt-0.5 text-sm text-[#8891A4]">
                          {benefit.description}
                        </p>
                      ) : null}
                    </div>
                    {canMutate ? (
                      <button
                        type="button"
                        onClick={() => void run(benefit.id, () => onDelete(benefit.id))}
                        disabled={busy}
                        aria-label={`Eliminar ${benefit.title}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#E8EAF0] text-[#8891A4] hover:border-[#C0392B] hover:text-[#C0392B] disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-4 space-y-2 border-t border-[#F0F2FA] pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
                      Se usa para
                    </p>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={benefit.retentionBridge.rewardGoalEnabled}
                        disabled={!canMutate || busy}
                        onChange={(e) =>
                          void run(benefit.id, () =>
                            onSetUse(benefit.id, "rewardCard", e.target.checked),
                          )
                        }
                        className="mt-0.5 h-4 w-4 accent-[#5C6BC0]"
                      />
                      <span className="text-[#1A202C]">
                        Recompensa de tarjeta
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={welcomeBenefitId === benefit.id}
                        disabled={!canMutate || busy}
                        onChange={(e) =>
                          void run(benefit.id, () =>
                            onSetUse(benefit.id, "welcomeGift", e.target.checked),
                          )
                        }
                        className="mt-0.5 h-4 w-4 accent-[#5C6BC0]"
                      />
                      <span className="text-[#1A202C]">
                        Regalo de bienvenida
                        <span className="mt-0.5 block text-xs text-[#8891A4]">
                          Se entrega una sola vez, en la primera visita.
                        </span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={benefit.retentionBridge.recoveryEnabled}
                        disabled={!canMutate || busy}
                        onChange={(e) =>
                          void run(benefit.id, () =>
                            onSetUse(
                              benefit.id,
                              "reactivation",
                              e.target.checked,
                            ),
                          )
                        }
                        className="mt-0.5 h-4 w-4 accent-[#5C6BC0]"
                      />
                      <span className="text-[#1A202C]">
                        Autorizado para reactivar clientes
                        <span className="mt-0.5 block text-xs text-[#8891A4]">
                          Flikker solo puede enviarlo a clientes que dejaron de
                          venir si está tildado acá.
                        </span>
                      </span>
                    </label>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
