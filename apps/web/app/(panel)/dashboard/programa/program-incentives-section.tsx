"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Percent, Plus, Trash2 } from "lucide-react";
import FlikkerSelect from "@/components/ui/flikker-select";
import RouteProgressBar from "@/components/ui/route-progress-bar";
import { useToast } from "@/components/ui/toast";
import ProgramSectionHeading from "./program-section-heading";
import {
  CREATABLE_BENEFIT_TYPES,
  WEEKDAY_LABELS,
  type ProgramIncentive,
} from "./types";

const inputClass =
  "mt-1 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm text-[#1A202C] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]";

interface RetentionBudget {
  maxAutomatedIncentivesPerMonth: number | null;
  hasIncentiveBearingVariants: boolean;
  budgetConfigured: boolean;
}

async function readJson(res: Response) {
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String((data as { message: unknown }).message)
        : "Error inesperado";
    throw new Error(message);
  }
  return data;
}

/**
 * "Incentivos" — reglas especiales y bonus más allá del programa base:
 * "10% los martes", "2x1 los primeros 5 días del mes", etc.
 *
 * Auditado antes de construir esto: `retention-v2/incentives` YA es este
 * catálogo — ya scopeado a `businessId`, ya `@Roles(OWNER, ADMIN)` en las
 * escrituras, ya gateado por `CheckinV2Guard`, con el comentario propio
 * "Fase C.5 §3 — the owner's catalogue of incentives Flikker MAY offer".
 * Cero backend nuevo: esta sección es un cliente de ese endpoint que ya
 * existía sin tener todavía una pantalla propia en Programa.
 *
 * A propósito NO expone `automationEligible`/`rewardGoalEligible`: esos dos
 * flags son la autorización explícita para que el motor automático de
 * Retention V2 use la fila sola, y esa decisión sigue reservada a donde ya
 * vivía (Beneficios, y Herramientas Flikker para Platform Admin) — no se
 * duplica ni se expone acá.
 *
 * A propósito también filtra las filas con `benefitId` seteado (ver
 * `load()`): son el bridge técnico que Beneficios crea solo, no incentivos
 * que el dueño haya armado acá — mostrarlas duplicaba nombres entre las dos
 * pantallas y confundía su "Activo/Pausado" (propio del bridge) con la
 * autorización de reactivación (otro campo, editable desde Beneficios).
 */
export default function ProgramIncentivesSection({
  canMutate,
}: {
  canMutate: boolean;
}) {
  const [incentives, setIncentives] = useState<ProgramIncentive[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Límite mensual de beneficios automáticos — reusa
  // `GET/PATCH /retention-v2/settings`, que ya existe y ya valida esto
  // (`RetentionSettingsService`). No hay backend nuevo acá.
  const [budget, setBudget] = useState<RetentionBudget | null>(null);
  const [limitDraft, setLimitDraft] = useState("");
  const [savingLimit, setSavingLimit] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/proxy/retention-v2/incentives");
      const data = (await readJson(res)) as ProgramIncentive[];
      // Auditado: el mismo endpoint devuelve tanto los incentivos que el
      // dueño crea acá (`benefitId: null`) como las filas técnicas que
      // `setRetentionBridge` auto-crea al marcar "Recompensa de tarjeta" o
      // "Autorizado para reactivar" en Beneficios (`benefitId` seteado,
      // mismo nombre que el Benefit). Sin este filtro, Incentivos mostraba
      // dos veces casi lo mismo — y su "Activo/Pausado" (`active`) es un
      // campo propio del bridge, sin relación con esa autorización, así que
      // aparecía como "Activo" aunque el dueño la hubiera desmarcado.
      // Filtro solo de esta pantalla — no toca el backend ni el modelo, y
      // Herramientas Flikker (Platform Admin) sigue viendo todas las filas.
      setIncentives(data.filter((incentive) => incentive.benefitId === null));
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "No pudimos cargar los incentivos.",
      );
    }
  }, []);

  const loadBudget = useCallback(async () => {
    try {
      const res = await fetch("/api/proxy/retention-v2/settings");
      const data = (await readJson(res)) as RetentionBudget;
      setBudget(data);
      setLimitDraft(
        data.maxAutomatedIncentivesPerMonth != null
          ? String(data.maxAutomatedIncentivesPerMonth)
          : "",
      );
    } catch {
      // Informativo — si falla, el catálogo de incentivos de arriba sigue
      // funcionando igual.
    }
  }, []);

  useEffect(() => {
    void load();
    void loadBudget();
  }, [load, loadBudget]);

  async function saveLimit() {
    const n = Number(limitDraft);
    if (!Number.isInteger(n) || n < 0) return;
    setSavingLimit(true);
    setError(null);
    try {
      const res = await fetch("/api/proxy/retention-v2/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxAutomatedIncentivesPerMonth: n }),
      });
      const data = (await readJson(res)) as RetentionBudget;
      setBudget(data);
      toast.success("Cambios guardados");
    } catch (e) {
      const detail = e instanceof Error ? e.message : "No pudimos guardar.";
      setError(detail);
      toast.error(detail);
    } finally {
      setSavingLimit(false);
    }
  }

  /**
   * Único envoltorio de escritura de esta sección — por eso la confirmación
   * vive acá y no repetida en cada handler. El `recargar` posterior no
   * dispara su propio toast: es una lectura, y además el dedupe del
   * `ToastProvider` evitaría el duplicado igual.
   */
  async function run(
    id: string,
    action: () => Promise<void>,
    successMessage: string,
  ) {
    setBusyId(id);
    setError(null);
    try {
      await action();
      await load();
      toast.success(successMessage);
    } catch (e) {
      const detail = e instanceof Error ? e.message : "No pudimos guardar.";
      setError(detail);
      toast.error(detail);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    await run(
      id,
      async () => {
        const res = await fetch(`/api/proxy/retention-v2/incentives/${id}`, {
          method: "DELETE",
        });
        if (!res.ok && res.status !== 204) await readJson(res);
      },
      "Incentivo eliminado",
    );
  }

  async function toggleActive(incentive: ProgramIncentive) {
    await run(
      incentive.id,
      async () => {
        const res = await fetch(
          `/api/proxy/retention-v2/incentives/${incentive.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ active: !incentive.active }),
          },
        );
        await readJson(res);
      },
      incentive.active ? "Incentivo desactivado" : "Incentivo activado",
    );
  }

  if (loadError) {
    return (
      <section className="rounded-[16px] border border-red-200 bg-red-50 p-5 text-sm text-[#C0392B]">
        {loadError}
      </section>
    );
  }

  if (incentives === null) {
    return <RouteProgressBar />;
  }

  return (
    <div className="space-y-5">
      {/*
        Presupuesto de reactivación automática — mueve acá lo que antes
        vivía en Notificaciones. Reusa `retention-v2/settings`, que ya
        validaba esto (`RetentionSettingsService.assertBudgetReadyToAuthorize`,
        llamado también desde `BenefitsService#setRetentionBridge` cuando el
        dueño autoriza un beneficio para reactivación en Programa → Beneficios).
      */}
      <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-6">
        <ProgramSectionHeading
          icon={Percent}
          title="Presupuesto de reactivación automática"
          description={
            'Cuántos beneficios como máximo puede ofrecer Flikker por mes al reactivar clientes. Sin esto, un beneficio autorizado para reactivación (Beneficios → "Autorizado para reactivar clientes") no se puede activar.'
          }
        />
        {budget?.hasIncentiveBearingVariants && !budget.budgetConfigured ? (
          <p className="mt-3 rounded-[10px] bg-[#FFF7EE] px-3.5 py-2.5 text-sm text-[#8A520D]">
            Tenés un beneficio autorizado para reactivación sin límite
            configurado — Flikker no puede entregarlo hasta que definas uno acá
            abajo.
          </p>
        ) : null}
        <div className="mt-3 flex items-center gap-2">
          <input
            type="number"
            min={0}
            step={1}
            value={limitDraft}
            placeholder="10"
            disabled={!canMutate || savingLimit}
            onChange={(e) => setLimitDraft(e.target.value)}
            className="h-10 w-28 rounded-[8px] border border-[#E8EAF0] bg-white px-3 text-sm text-[#1A202C] outline-none focus:border-[#5C6BC0] disabled:opacity-60"
          />
          {canMutate &&
          String(budget?.maxAutomatedIncentivesPerMonth ?? "") !==
            limitDraft.trim() ? (
            <button
              type="button"
              disabled={savingLimit}
              onClick={() => void saveLimit()}
              className="flk-glossy inline-flex h-10 items-center rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-60"
            >
              {savingLimit ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : null}
              Guardar
            </button>
          ) : null}
        </div>
        {budget?.maxAutomatedIncentivesPerMonth != null ? (
          <p className="mt-2 text-xs leading-5 text-[#8891A4]">
            Flikker nunca entregará más de{" "}
            {budget.maxAutomatedIncentivesPerMonth} beneficios automáticos por
            mes. Los recordatorios sin beneficio no cuentan para este límite.
          </p>
        ) : null}
      </section>

      <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-6">
        <ProgramSectionHeading
          icon={Percent}
          title="Incentivos"
          description="Reglas especiales y bonus además de tu programa base — ej. un extra los fines de semana."
          action={
            canMutate ? (
              <button
                type="button"
                onClick={() => setCreating((v) => !v)}
                className="flk-glossy inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0]"
              >
                <Plus className="h-4 w-4" /> Nuevo incentivo
              </button>
            ) : null
          }
        />

        {creating ? (
          <IncentiveForm
            onCancel={() => setCreating(false)}
            onSubmit={async (payload) => {
              await run(
                "new",
                async () => {
                  const res = await fetch("/api/proxy/retention-v2/incentives", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  });
                  await readJson(res);
                },
                "Incentivo creado",
              );
              setCreating(false);
            }}
            busy={busyId === "new"}
          />
        ) : null}

        {error ? <p className="mt-4 text-sm text-[#C0392B]">{error}</p> : null}

        {incentives.length === 0 ? (
          <p className="mt-5 text-sm text-[#8891A4]">
            Todavía no creaste ningún incentivo especial. Tu programa base
            (sellos y beneficios) sigue funcionando igual sin esto.
          </p>
        ) : (
          <ul className="mt-5 space-y-3">
            {incentives.map((incentive) => (
              <li
                key={incentive.id}
                className="rounded-[12px] border border-[#E8EAF0] bg-white p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-bold text-[#1A202C]">
                        {incentive.name}
                      </p>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${
                          incentive.active
                            ? "bg-[#EAF6EE] text-[#1D9E75]"
                            : "bg-[#F0F1F6] text-[#8891A4]"
                        }`}
                      >
                        {incentive.active ? "Activo" : "Pausado"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-[#8891A4]">
                      {incentive.percentageValue
                        ? `${incentive.percentageValue}% off`
                        : incentive.fixedValue
                          ? `$${incentive.fixedValue} off`
                          : "Sin valor numérico"}
                      {incentive.validDays.length > 0
                        ? ` · ${incentive.validDays
                            .map(
                              (d) =>
                                WEEKDAY_LABELS.find((w) => w.value === d)
                                  ?.label,
                            )
                            .join(", ")}`
                        : ""}
                    </p>
                    {incentive.conditions ? (
                      <p className="mt-1 text-xs text-[#8891A4]">
                        {incentive.conditions}
                      </p>
                    ) : null}
                  </div>
                  {canMutate ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        disabled={busyId === incentive.id}
                        onClick={() => void toggleActive(incentive)}
                        className="text-sm font-semibold text-[#5C6BC0] hover:underline disabled:opacity-50"
                      >
                        {incentive.active ? "Pausar" : "Activar"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === incentive.id}
                        onClick={() => void remove(incentive.id)}
                        aria-label={`Eliminar ${incentive.name}`}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#E8EAF0] text-[#8891A4] hover:border-[#C0392B] hover:text-[#C0392B] disabled:opacity-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function IncentiveForm({
  onCancel,
  onSubmit,
  busy,
}: {
  onCancel: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("discount");
  const [percentageValue, setPercentageValue] = useState("");
  const [conditions, setConditions] = useState("");
  const [validDays, setValidDays] = useState<number[]>([]);

  function toggleDay(day: number) {
    setValidDays((days) =>
      days.includes(day) ? days.filter((d) => d !== day) : [...days, day],
    );
  }

  async function submit() {
    if (!name.trim()) return;
    await onSubmit({
      name: name.trim(),
      type,
      ...(percentageValue ? { percentageValue: Number(percentageValue) } : {}),
      ...(conditions.trim() ? { conditions: conditions.trim() } : {}),
      validDays,
    });
    setName("");
    setPercentageValue("");
    setConditions("");
    setValidDays([]);
  }

  return (
    <div className="mt-5 rounded-[12px] border border-[#E8EAF0] bg-[#F9FAFD] p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Nombre
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="10% los martes"
            className={inputClass}
          />
        </label>
        <div>
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Tipo
          </span>
          <FlikkerSelect
            value={type}
            onChange={setType}
            ariaLabel="Tipo de incentivo"
            className="mt-1"
            options={CREATABLE_BENEFIT_TYPES}
          />
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            % de descuento (opcional)
          </span>
          <input
            type="number"
            min={1}
            max={90}
            value={percentageValue}
            onChange={(e) => setPercentageValue(e.target.value)}
            placeholder="10"
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Condiciones (opcional)
          </span>
          <input
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
            placeholder="Solo en almuerzo"
            className={inputClass}
          />
        </label>
      </div>

      <div className="mt-3">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
          Días válidos (vacío = todos)
        </span>
        <div className="mt-2 flex flex-wrap gap-2">
          {WEEKDAY_LABELS.map((day) => (
            <button
              key={day.value}
              type="button"
              onClick={() => toggleDay(day.value)}
              className={`rounded-[8px] border px-3 py-1.5 text-xs font-semibold transition-colors ${
                validDays.includes(day.value)
                  ? "border-[#5C6BC0] bg-[#EEF0FB] text-[#5C6BC0]"
                  : "border-[#E8EAF0] bg-white text-[#8891A4] hover:border-[#5C6BC0]"
              }`}
            >
              {day.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="text-sm font-semibold text-[#8891A4] hover:text-[#1A202C]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || !name.trim()}
          className="flk-glossy inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Crear
        </button>
      </div>
    </div>
  );
}
