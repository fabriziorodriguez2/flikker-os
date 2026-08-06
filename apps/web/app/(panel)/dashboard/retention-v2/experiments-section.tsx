"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Plus } from "lucide-react";
import type {
  RetentionExperiment,
  RetentionIncentive,
  RetentionObjective,
  RetentionStrategyType,
} from "./types";
import { OBJECTIVE_LABEL, STATUS_LABEL, STRATEGY_LABEL } from "./types";

const inputClass =
  "mt-1 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm text-[#1A202C] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]";

const OBJECTIVES: RetentionObjective[] = [
  "SECOND_VISIT",
  "AT_RISK_RECOVERY",
  "INACTIVE_RECOVERY",
];

const STRATEGIES: RetentionStrategyType[] = [
  "CONTROL",
  "REMINDER",
  "SOFT_BENEFIT",
  "STRONG_BENEFIT",
];

const INCENTIVE_STRATEGIES: RetentionStrategyType[] = ["SOFT_BENEFIT", "STRONG_BENEFIT"];

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
  onCreate: (payload: NewExperimentForm) => Promise<void>;
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
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0]"
          >
            <Plus className="h-4 w-4" />
            Nuevo experimento
          </button>
        ) : null}
      </div>

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
  incentives,
  onAdd,
}: {
  incentives: RetentionIncentive[];
  onAdd: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [form, setForm] = useState<NewVariantForm>(emptyVariantForm);
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
        {STRATEGIES.map((s) => (
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
