"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import type { BenefitType, RetentionIncentive } from "./types";
import { TYPE_LABEL } from "./types";

const inputClass =
  "mt-1 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm text-[#1A202C] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]";

const TYPE_OPTIONS: BenefitType[] = ["discount", "gift", "raffle", "promotion", "other"];

interface FormState {
  name: string;
  type: BenefitType;
  percentageValue: string;
  fixedValue: string;
  estimatedCost: string;
  expiresInDays: string;
  automationEligible: boolean;
}

const emptyForm: FormState = {
  name: "",
  type: "discount",
  percentageValue: "",
  fixedValue: "",
  estimatedCost: "",
  expiresInDays: "7",
  automationEligible: false,
};

function toForm(i: RetentionIncentive): FormState {
  return {
    name: i.name,
    type: i.type,
    percentageValue: i.percentageValue?.toString() ?? "",
    fixedValue: i.fixedValue?.toString() ?? "",
    estimatedCost: i.estimatedCost?.toString() ?? "",
    expiresInDays: String(i.expiresInDays),
    automationEligible: i.automationEligible,
  };
}

function buildPayload(form: FormState) {
  return {
    name: form.name.trim(),
    type: form.type,
    percentageValue: form.percentageValue ? Number(form.percentageValue) : undefined,
    fixedValue: form.fixedValue ? Number(form.fixedValue) : undefined,
    estimatedCost: form.estimatedCost ? Number(form.estimatedCost) : undefined,
    expiresInDays: Number(form.expiresInDays),
    automationEligible: form.automationEligible,
  };
}

export default function IncentivesSection({
  incentives,
  canMutate,
  onCreate,
  onUpdate,
  onRemove,
}: {
  incentives: RetentionIncentive[];
  canMutate: boolean;
  onCreate: (payload: Record<string, unknown>) => Promise<void>;
  onUpdate: (id: string, payload: Record<string, unknown>) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<RetentionIncentive | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setShowForm(true);
  }

  function openEdit(incentive: RetentionIncentive) {
    setEditing(incentive);
    setForm(toForm(incentive));
    setError(null);
    setShowForm(true);
  }

  async function handleSubmit() {
    setSaving(true);
    setError(null);
    try {
      const payload = buildPayload(form);
      if (editing) {
        await onUpdate(editing.id, payload);
      } else {
        await onCreate(payload);
      }
      setShowForm(false);
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos guardar el incentivo.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(incentive: RetentionIncentive) {
    setBusyId(incentive.id);
    try {
      await onUpdate(incentive.id, { active: !incentive.active });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(incentive: RetentionIncentive) {
    if (!window.confirm(`¿Eliminar "${incentive.name}"?`)) return;
    setBusyId(incentive.id);
    try {
      await onRemove(incentive.id);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "No pudimos eliminarlo.");
    } finally {
      setBusyId(null);
    }
  }

  const canSubmit = form.name.trim().length > 0 && !saving;

  return (
    <section className="rounded-[14px] border border-[#E8EAF0] bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-[#1A202C]">Incentivos permitidos</h2>
          <p className="mt-1 text-sm text-[#8891A4]">
            Flikker nunca va a utilizar automáticamente un beneficio que no
            esté autorizado acá.
          </p>
        </div>
        {canMutate && !showForm ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0]"
          >
            <Plus className="h-4 w-4" />
            Nuevo incentivo
          </button>
        ) : null}
      </div>

      {showForm ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) void handleSubmit();
          }}
          className="mt-4 space-y-4 rounded-[12px] border border-[#E8EAF0] bg-[#FAFBFC] p-4"
        >
          <p className="text-sm font-bold text-[#1A202C]">
            {editing ? "Editar incentivo" : "Nuevo incentivo"}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
                Nombre
              </span>
              <input
                type="text"
                value={form.name}
                onChange={(e) => set("name", e.target.value.slice(0, 120))}
                className={inputClass}
                placeholder="Ej: 10% OFF"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
                Tipo
              </span>
              <select
                value={form.type}
                onChange={(e) => set("type", e.target.value as BenefitType)}
                className={inputClass}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
                % de descuento
              </span>
              <input
                type="number"
                min={1}
                max={90}
                value={form.percentageValue}
                onChange={(e) => set("percentageValue", e.target.value)}
                className={inputClass}
                placeholder="Ej: 10"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
                Valor fijo ($)
              </span>
              <input
                type="number"
                min={0}
                value={form.fixedValue}
                onChange={(e) => set("fixedValue", e.target.value)}
                className={inputClass}
                placeholder="Alternativa al %"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
                Costo estimado ($)
              </span>
              <input
                type="number"
                min={0}
                value={form.estimatedCost}
                onChange={(e) => set("estimatedCost", e.target.value)}
                className={inputClass}
                placeholder="Opcional"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
                Días de validez
              </span>
              <input
                type="number"
                min={1}
                max={90}
                value={form.expiresInDays}
                onChange={(e) => set("expiresInDays", e.target.value)}
                className={inputClass}
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm font-semibold text-[#1A202C]">
            <input
              type="checkbox"
              checked={form.automationEligible}
              onChange={(e) => set("automationEligible", e.target.checked)}
              className="h-4 w-4 accent-[#5C6BC0]"
            />
            Autorizar para uso automático por el motor de retención
          </label>

          {error ? <p className="text-sm text-[#C0392B]">{error}</p> : null}

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditing(null);
              }}
              className="h-10 rounded-[8px] border border-[#E8EAF0] px-4 text-sm font-semibold text-[#1A202C]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editing ? "Guardar cambios" : "Crear incentivo"}
            </button>
          </div>
        </form>
      ) : null}

      {incentives.length === 0 && !showForm ? (
        <p className="mt-4 text-sm text-[#8891A4]">
          Todavía no configuraste ningún incentivo.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="flk-table w-full min-w-[640px] text-left text-sm">
            <thead className="bg-[#F5F6FA] text-[12px] uppercase tracking-[0.08em] text-[#8891A4]">
              <tr>
                <th className="px-4 py-3 font-semibold">Nombre</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Valor</th>
                <th className="px-4 py-3 font-semibold">Automático</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 text-right font-semibold">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {incentives.map((incentive) => (
                <tr key={incentive.id} className="border-t border-[#E8EAF0]">
                  <td className="px-4 py-3 font-semibold text-[#1A202C]">
                    {incentive.name}
                  </td>
                  <td className="px-4 py-3 text-[#1A202C]">{TYPE_LABEL[incentive.type]}</td>
                  <td className="px-4 py-3 text-[#1A202C]">
                    {incentive.percentageValue
                      ? `${incentive.percentageValue}%`
                      : incentive.fixedValue
                        ? `$${incentive.fixedValue}`
                        : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        incentive.automationEligible
                          ? "bg-[#E7F5EA] text-[#2E7D32]"
                          : "bg-[#F5F6FA] text-[#8891A4]"
                      }`}
                    >
                      {incentive.automationEligible ? "Autorizado" : "No autorizado"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        incentive.active
                          ? "bg-[#E7F5EA] text-[#2E7D32]"
                          : "bg-[#F5F6FA] text-[#8891A4]"
                      }`}
                    >
                      {incentive.active ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {canMutate ? (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(incentive)}
                          className="text-xs font-semibold text-[#5C6BC0] hover:underline"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(incentive)}
                          disabled={busyId === incentive.id}
                          className="text-xs font-semibold text-[#5C6BC0] hover:underline disabled:opacity-50"
                        >
                          {incentive.active ? "Desactivar" : "Activar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(incentive)}
                          disabled={busyId === incentive.id}
                          className="text-xs font-semibold text-[#C0392B] hover:underline disabled:opacity-50"
                        >
                          Eliminar
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
