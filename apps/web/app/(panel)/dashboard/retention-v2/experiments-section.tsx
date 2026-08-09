"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Plus, Sparkles } from "lucide-react";
import type {
  RetentionExperiment,
  RetentionIncentive,
  RetentionObjective,
  RetentionStrategyType,
} from "./types";
import {
  OBJECTIVE_LABEL,
  STATUS_LABEL,
  STRATEGIES_ALLOWED_FOR_OBJECTIVE,
  STRATEGY_LABEL,
} from "./types";

const inputClass =
  "mt-1 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm text-[#1A202C] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]";

const OBJECTIVES: RetentionObjective[] = [
  "SECOND_VISIT",
  "AT_RISK_RECOVERY",
  "INACTIVE_RECOVERY",
  "REWARD_GOAL_PROGRESS",
];

const INCENTIVE_STRATEGIES: RetentionStrategyType[] = ["SOFT_BENEFIT", "STRONG_BENEFIT"];

/**
 * Piloto V2 — las dos plantillas recomendadas para un primer experimento:
 * dos brazos únicamente (CONTROL + un solo challenger), nunca multi-arm.
 * Encadena create-experiment + 2×add-variant sobre los endpoints que ya
 * existen — no hay ningún endpoint nuevo detrás de esto.
 */
const TWO_ARM_TEMPLATES: {
  key: string;
  label: string;
  description: string;
  objective: RetentionObjective;
  challenger: RetentionStrategyType;
  challengerLabel: string;
}[] = [
  {
    key: "reminder",
    label: "CONTROL 30% / Recordatorio 70%",
    description: "Recomendado para el primer piloto — recupera clientes en riesgo o inactivos.",
    objective: "AT_RISK_RECOVERY",
    challenger: "REMINDER",
    challengerLabel: "Recordatorio",
  },
  {
    key: "progress",
    label: "CONTROL 30% / Progreso de recompensa 70%",
    description: "Solo para clientes con una meta de recompensa activa (Reward Goals).",
    objective: "REWARD_GOAL_PROGRESS",
    challenger: "PROGRESS_REMINDER",
    challengerLabel: "Recordatorio de progreso",
  },
];

interface NewExperimentForm {
  name: string;
  objective: RetentionObjective;
}

interface NewVariantForm {
  name: string;
  strategyType: RetentionStrategyType;
  incentiveDefinitionId: string;
  allocationPercent: string;
}

const emptyVariantForm: NewVariantForm = {
  name: "",
  strategyType: "CONTROL",
  incentiveDefinitionId: "",
  allocationPercent: "0",
};

export default function ExperimentsSection({
  experiments,
  incentives,
  canMutate,
  onCreate,
  onAddVariant,
  onLifecycle,
}: {
  experiments: RetentionExperiment[];
  incentives: RetentionIncentive[];
  canMutate: boolean;
  onCreate: (payload: NewExperimentForm) => Promise<RetentionExperiment>;
  onAddVariant: (
    experimentId: string,
    payload: Record<string, unknown>,
  ) => Promise<void>;
  onLifecycle: (
    experimentId: string,
    action: "start" | "pause" | "finish",
  ) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NewExperimentForm>({
    name: "",
    objective: "AT_RISK_RECOVERY",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [templateBusy, setTemplateBusy] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);

  async function handleCreate() {
    setSaving(true);
    setError(null);
    try {
      await onCreate(form);
      setShowForm(false);
      setForm({ name: "", objective: "AT_RISK_RECOVERY" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos crear el experimento.");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Piloto V2 — crea el experimento de dos brazos recomendado en un solo
   * click: CONTROL 30% + un único challenger 70%. Encadena exactamente los
   * mismos dos endpoints que el formulario manual (crear experimento, luego
   * agregar cada variante) — nada nuevo del lado del servidor.
   */
  async function createTwoArmTemplate(template: (typeof TWO_ARM_TEMPLATES)[number]) {
    setTemplateBusy(template.key);
    setTemplateError(null);
    try {
      const experiment = await onCreate({
        name: `Piloto — ${template.challengerLabel}`,
        objective: template.objective,
      });
      await onAddVariant(experiment.id, {
        name: "Control",
        strategyType: "CONTROL",
        allocationPercent: 30,
      });
      await onAddVariant(experiment.id, {
        name: template.challengerLabel,
        strategyType: template.challenger,
        allocationPercent: 70,
      });
    } catch (e) {
      setTemplateError(
        e instanceof Error ? e.message : "No pudimos crear el experimento de piloto.",
      );
    } finally {
      setTemplateBusy(null);
    }
  }

  async function runLifecycle(id: string, action: "start" | "pause" | "finish") {
    setBusyId(id);
    try {
      await onLifecycle(id, action);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No se pudo completar la acción.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-[14px] border border-[#E8EAF0] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[#1A202C]">Experimentos</h2>
          <p className="mt-1 text-sm text-[#8891A4]">
            Cada experimento necesita un grupo de control para saber si el
            mensaje realmente cambió algo.
          </p>
        </div>
        {canMutate && !showForm ? (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[8px] border border-[#E8EAF0] px-4 text-sm font-semibold text-[#1A202C] hover:border-[#C7CCE6]"
          >
            <Plus className="h-4 w-4" />
            Experimento personalizado
          </button>
        ) : null}
      </div>

      {canMutate && experiments.length === 0 && !showForm ? (
        <div className="mt-4 rounded-[12px] border border-[#DCE3F7] bg-[#F5F7FF] p-4">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#5C6BC0]" />
            <div>
              <p className="text-sm font-bold text-[#1A202C]">
                Recomendado para tu primer piloto
              </p>
              <p className="mt-1 text-sm text-[#3B4252]">
                Empezá con dos brazos únicamente — concentra la muestra y es
                mucho más fácil de leer que un experimento con varias
                variantes a la vez.
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {TWO_ARM_TEMPLATES.map((template) => (
              <button
                key={template.key}
                type="button"
                onClick={() => void createTwoArmTemplate(template)}
                disabled={templateBusy !== null}
                className="rounded-[10px] border border-[#DCE3F7] bg-white px-3.5 py-3 text-left transition-colors hover:border-[#5C6BC0] disabled:opacity-50"
              >
                <p className="text-sm font-semibold text-[#1A202C]">
                  {template.label}
                </p>
                <p className="mt-0.5 text-xs text-[#8891A4]">{template.description}</p>
                {templateBusy === template.key ? (
                  <span className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-[#5C6BC0]">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Creando…
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          {templateError ? (
            <p className="mt-3 text-sm text-[#C0392B]">{templateError}</p>
          ) : null}
        </div>
      ) : null}

      {showForm ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (form.name.trim()) void handleCreate();
          }}
          className="mt-4 space-y-4 rounded-[12px] border border-[#E8EAF0] bg-[#FAFBFC] p-4"
        >
          <p className="text-sm font-bold text-[#1A202C]">Nuevo experimento</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
                Nombre
              </span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value.slice(0, 120) }))}
                className={inputClass}
                placeholder="Ej: Recuperar clientes en riesgo"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
                Objetivo
              </span>
              <select
                value={form.objective}
                onChange={(e) =>
                  setForm((p) => ({ ...p, objective: e.target.value as RetentionObjective }))
                }
                className={inputClass}
              >
                {OBJECTIVES.map((o) => (
                  <option key={o} value={o}>
                    {OBJECTIVE_LABEL[o]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error ? <p className="text-sm text-[#C0392B]">{error}</p> : null}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="h-10 rounded-[8px] border border-[#E8EAF0] px-4 text-sm font-semibold text-[#1A202C]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !form.name.trim()}
              className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Crear
            </button>
          </div>
        </form>
      ) : null}

      {experiments.length === 0 && !showForm ? (
        <p className="mt-4 text-sm text-[#8891A4]">
          Todavía no creaste ningún experimento.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {experiments.map((experiment) => (
            <div key={experiment.id} className="rounded-[12px] border border-[#E8EAF0]">
              <button
                type="button"
                onClick={() =>
                  setExpanded(expanded === experiment.id ? null : experiment.id)
                }
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <div>
                  <p className="text-sm font-semibold text-[#1A202C]">{experiment.name}</p>
                  <p className="text-xs text-[#8891A4]">
                    {OBJECTIVE_LABEL[experiment.objective]} · {experiment.variants.length}{" "}
                    variantes
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                      experiment.status === "RUNNING"
                        ? "bg-[#E7F5EA] text-[#2E7D32]"
                        : experiment.status === "PAUSED"
                          ? "bg-amber-50 text-amber-700"
                          : experiment.status === "COMPLETED"
                            ? "bg-[#F5F6FA] text-[#8891A4]"
                            : "bg-[#EEF0FB] text-[#5C6BC0]"
                    }`}
                  >
                    {STATUS_LABEL[experiment.status]}
                  </span>
                  {expanded === experiment.id ? (
                    <ChevronUp className="h-4 w-4 text-[#8891A4]" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-[#8891A4]" />
                  )}
                </div>
              </button>

              {expanded === experiment.id ? (
                <div className="border-t border-[#E8EAF0] px-4 py-4">
                  <ul className="space-y-2">
                    {experiment.variants.map((variant) => (
                      <li
                        key={variant.id}
                        className="flex items-center justify-between rounded-[8px] bg-[#FAFBFC] px-3 py-2 text-sm"
                      >
                        <span className="font-semibold text-[#1A202C]">{variant.name}</span>
                        <span className="text-[#8891A4]">
                          {STRATEGY_LABEL[variant.strategyType]}
                          {variant.incentiveDefinition
                            ? ` · ${variant.incentiveDefinition.name}`
                            : ""}
                        </span>
                        <span className="font-semibold text-[#1A202C]">
                          {variant.allocationPercent}%
                        </span>
                      </li>
                    ))}
                  </ul>

                  {canMutate && experiment.status === "DRAFT" ? (
                    <AddVariantForm
                      objective={experiment.objective}
                      incentives={incentives}
                      onAdd={(payload) => onAddVariant(experiment.id, payload)}
                    />
                  ) : null}

                  {canMutate ? (
                    <div className="mt-4 flex gap-2">
                      {(experiment.status === "DRAFT" || experiment.status === "PAUSED") ? (
                        <button
                          type="button"
                          onClick={() => runLifecycle(experiment.id, "start")}
                          disabled={busyId === experiment.id}
                          className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-3 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
                        >
                          {busyId === experiment.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : null}
                          Iniciar
                        </button>
                      ) : null}
                      {experiment.status === "RUNNING" ? (
                        <button
                          type="button"
                          onClick={() => runLifecycle(experiment.id, "pause")}
                          disabled={busyId === experiment.id}
                          className="h-9 rounded-[8px] border border-[#E8EAF0] px-3 text-sm font-semibold text-[#1A202C] disabled:opacity-50"
                        >
                          Pausar
                        </button>
                      ) : null}
                      {experiment.status !== "COMPLETED" ? (
                        <button
                          type="button"
                          onClick={() => runLifecycle(experiment.id, "finish")}
                          disabled={busyId === experiment.id}
                          className="h-9 rounded-[8px] border border-[#E8EAF0] px-3 text-sm font-semibold text-[#C0392B] disabled:opacity-50"
                        >
                          Finalizar
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AddVariantForm({
  objective,
  incentives,
  onAdd,
}: {
  objective: RetentionObjective;
  incentives: RetentionIncentive[];
  onAdd: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const allowedStrategies = STRATEGIES_ALLOWED_FOR_OBJECTIVE[objective];
  const [form, setForm] = useState<NewVariantForm>({
    ...emptyVariantForm,
    strategyType: allowedStrategies[0],
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const carriesIncentive = INCENTIVE_STRATEGIES.includes(form.strategyType);

  async function handleAdd() {
    setSaving(true);
    setError(null);
    try {
      await onAdd({
        name: form.name.trim(),
        strategyType: form.strategyType,
        incentiveDefinitionId: carriesIncentive
          ? form.incentiveDefinitionId || undefined
          : undefined,
        allocationPercent: Number(form.allocationPercent),
      });
      setForm(emptyVariantForm);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos agregar la variante.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (form.name.trim()) void handleAdd();
      }}
      className="mt-4 grid gap-3 rounded-[8px] border border-dashed border-[#E8EAF0] p-3 sm:grid-cols-4"
    >
      <input
        type="text"
        value={form.name}
        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value.slice(0, 120) }))}
        className={inputClass}
        placeholder="Nombre de la variante"
      />
      <select
        value={form.strategyType}
        onChange={(e) =>
          setForm((p) => ({ ...p, strategyType: e.target.value as RetentionStrategyType }))
        }
        className={inputClass}
      >
        {allowedStrategies.map((s) => (
          <option key={s} value={s}>
            {STRATEGY_LABEL[s]}
          </option>
        ))}
      </select>
      {carriesIncentive ? (
        <select
          value={form.incentiveDefinitionId}
          onChange={(e) => setForm((p) => ({ ...p, incentiveDefinitionId: e.target.value }))}
          className={inputClass}
        >
          <option value="">Elegir incentivo…</option>
          {incentives.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      ) : (
        <div />
      )}
      <input
        type="number"
        min={0}
        max={100}
        value={form.allocationPercent}
        onChange={(e) => setForm((p) => ({ ...p, allocationPercent: e.target.value }))}
        className={inputClass}
        placeholder="% asignado"
      />
      {error ? <p className="col-span-full text-sm text-[#C0392B]">{error}</p> : null}
      <div className="col-span-full flex justify-end">
        <button
          type="submit"
          disabled={saving || !form.name.trim()}
          className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-3 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Agregar variante
        </button>
      </div>
    </form>
  );
}
