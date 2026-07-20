"use client";

import { useEffect, useState } from "react";
import { Check, Gift, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useCanMutate } from "../../role-context";

// ─── Types ────────────────────────────────────────────────────────────────────

type BenefitType = "discount" | "gift" | "raffle" | "promotion" | "other";

interface Benefit {
  id: string;
  type: BenefitType | "none";
  title: string;
  description: string | null;
  terms: string | null;
  startDate: string | null;
  endDate: string | null;
  recurrence: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const TYPE_OPTIONS: { value: BenefitType; label: string }[] = [
  { value: "discount", label: "Descuento" },
  { value: "gift", label: "Regalo" },
  { value: "raffle", label: "Sorteo" },
  { value: "promotion", label: "Promoción" },
  { value: "other", label: "Otro" },
];

const TYPE_LABEL: Record<string, string> = {
  none: "Ninguno",
  discount: "Descuento",
  gift: "Regalo",
  raffle: "Sorteo",
  promotion: "Promoción",
  other: "Otro",
};

// ─── Form ─────────────────────────────────────────────────────────────────────

interface FormState {
  type: BenefitType;
  title: string;
  description: string;
  terms: string;
  startDate: string;
  endDate: string;
  recurrence: string;
}

const emptyForm: FormState = {
  type: "discount",
  title: "",
  description: "",
  terms: "",
  startDate: "",
  endDate: "",
  recurrence: "",
};

const inputClass =
  "mt-1 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm text-[#1A202C] outline-none placeholder:text-[#B0B8C9] focus:border-[#5C6BC0]";

function BenefitForm({
  initial,
  editing,
  saving,
  error,
  onCancel,
  onSubmit,
}: {
  initial: FormState;
  editing: boolean;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (form: FormState) => void;
}) {
  const [form, setForm] = useState<FormState>(initial);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const canSubmit = form.title.trim().length > 0 && !saving;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (canSubmit) onSubmit(form);
      }}
      className="rounded-[12px] border border-[#E8EAF0] bg-white p-5 space-y-4"
    >
      <p className="text-sm font-bold text-[#1A202C]">
        {editing ? "Editar beneficio" : "Nuevo beneficio"}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Tipo
          </span>
          <select
            value={form.type}
            onChange={(e) => set("type", e.target.value as BenefitType)}
            className={inputClass}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Título
          </span>
          <input
            type="text"
            value={form.title}
            onChange={(e) => set("title", e.target.value.slice(0, 120))}
            placeholder="10% en tu próxima visita"
            className={inputClass}
            required
          />
        </label>
      </div>

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
          Descripción (opcional)
        </span>
        <textarea
          value={form.description}
          onChange={(e) => set("description", e.target.value.slice(0, 500))}
          rows={2}
          placeholder="Contale al cliente en qué consiste el beneficio."
          className={`${inputClass} resize-none`}
        />
      </label>

      <label className="block">
        <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
          Condiciones (opcional)
        </span>
        <textarea
          value={form.terms}
          onChange={(e) => set("terms", e.target.value.slice(0, 500))}
          rows={2}
          placeholder="Ej: válido de lunes a jueves, no acumulable."
          className={`${inputClass} resize-none`}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Desde (opcional)
          </span>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => set("startDate", e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Hasta (opcional)
          </span>
          <input
            type="date"
            value={form.endDate}
            onChange={(e) => set("endDate", e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Recurrencia (opcional)
          </span>
          <input
            type="text"
            value={form.recurrence}
            onChange={(e) => set("recurrence", e.target.value.slice(0, 60))}
            placeholder="Ej: mensual"
            className={inputClass}
          />
        </label>
      </div>

      {error ? (
        <p className="rounded-[8px] border border-[#C0392B]/20 bg-[#C0392B]/10 px-3 py-2 text-xs text-[#C0392B]">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex h-10 items-center rounded-[8px] border border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA]"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {editing ? "Guardar cambios" : "Crear beneficio"}
        </button>
      </div>
    </form>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function BenefitCard({
  benefit,
  canMutate,
  busy,
  onToggleActive,
  onEdit,
  onDelete,
}: {
  benefit: Benefit;
  canMutate: boolean;
  busy: boolean;
  onToggleActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const from = formatDate(benefit.startDate);
  const to = formatDate(benefit.endDate);
  const range =
    from && to
      ? `${from} – ${to}`
      : from
        ? `Desde ${from}`
        : to
          ? `Hasta ${to}`
          : null;

  return (
    <article
      className={`rounded-[12px] border bg-white p-5 ${
        benefit.active ? "border-[#5C6BC0]" : "border-[#E8EAF0]"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#EEF0FB] px-2.5 py-1 text-xs font-semibold text-[#5C6BC0]">
              {TYPE_LABEL[benefit.type] ?? benefit.type}
            </span>
            {benefit.active ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#639922]/10 px-2.5 py-1 text-xs font-semibold text-[#639922]">
                <Check className="h-3 w-3" /> Activo
              </span>
            ) : null}
            {benefit.recurrence ? (
              <span className="rounded-full bg-[#F5F6FA] px-2.5 py-1 text-xs font-medium text-[#8891A4]">
                {benefit.recurrence}
              </span>
            ) : null}
          </div>
          <h3 className="mt-2 text-base font-bold text-[#1A202C]">
            {benefit.title}
          </h3>
          {benefit.description ? (
            <p className="mt-1 text-sm text-[#4A5568]">{benefit.description}</p>
          ) : null}
          {benefit.terms ? (
            <p className="mt-1 text-xs text-[#8891A4]">
              <span className="font-semibold">Condiciones:</span> {benefit.terms}
            </p>
          ) : null}
          {range ? (
            <p className="mt-2 text-xs text-[#B0B8C9]">{range}</p>
          ) : null}
        </div>

        {canMutate ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onToggleActive}
              disabled={busy}
              className={`inline-flex h-9 items-center rounded-[8px] px-3 text-xs font-semibold disabled:opacity-50 ${
                benefit.active
                  ? "border border-[#E8EAF0] bg-white text-[#8891A4] hover:bg-[#F5F6FA]"
                  : "bg-[#5C6BC0] text-white hover:bg-[#4f5eb0]"
              }`}
            >
              {benefit.active ? "Desactivar" : "Activar"}
            </button>
            <button
              type="button"
              onClick={onEdit}
              disabled={busy}
              aria-label="Editar"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#E8EAF0] text-[#8891A4] hover:text-[#5C6BC0] disabled:opacity-50"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={busy}
              aria-label="Eliminar"
              className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[#E8EAF0] text-[#8891A4] hover:text-[#C0392B] disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function toFormState(b: Benefit): FormState {
  const type: BenefitType = b.type === "none" ? "other" : b.type;
  return {
    type,
    title: b.title,
    description: b.description ?? "",
    terms: b.terms ?? "",
    startDate: b.startDate ? b.startDate.slice(0, 10) : "",
    endDate: b.endDate ? b.endDate.slice(0, 10) : "",
    recurrence: b.recurrence ?? "",
  };
}

function buildPayload(form: FormState) {
  return {
    type: form.type,
    title: form.title.trim(),
    description: form.description.trim() || null,
    terms: form.terms.trim() || null,
    startDate: form.startDate || undefined,
    endDate: form.endDate || undefined,
    recurrence: form.recurrence.trim() || null,
  };
}

export default function BenefitsPage() {
  const canMutate = useCanMutate();
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Benefit | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/proxy/benefits");
      if (!res.ok) throw new Error("No pudimos cargar los beneficios.");
      setBenefits((await res.json()) as Benefit[]);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Error al cargar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openCreate() {
    setEditing(null);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(benefit: Benefit) {
    setEditing(benefit);
    setFormError(null);
    setShowForm(true);
  }

  async function handleSubmit(form: FormState) {
    setSaving(true);
    setFormError(null);
    try {
      const url = editing
        ? `/api/proxy/benefits/${editing.id}`
        : "/api/proxy/benefits";
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload(form)),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(data.message ?? "No pudimos guardar el beneficio.");
      }
      setShowForm(false);
      setEditing(null);
      await load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Error al guardar.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(benefit: Benefit) {
    setBusyId(benefit.id);
    try {
      const action = benefit.active ? "deactivate" : "activate";
      await fetch(`/api/proxy/benefits/${benefit.id}/${action}`, {
        method: "POST",
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(benefit: Benefit) {
    if (!window.confirm("¿Eliminar este beneficio?")) return;
    setBusyId(benefit.id);
    try {
      await fetch(`/api/proxy/benefits/${benefit.id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#1A202C]">
            Beneficios
          </h1>
          <p className="mt-1 text-sm text-[#8891A4]">
            Son opcionales. Ofrecé un beneficio para incentivar que tus clientes
            vuelvan. Solo uno puede estar activo a la vez.
          </p>
        </div>
        {canMutate && !showForm ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0]"
          >
            <Plus className="h-4 w-4" />
            Nuevo beneficio
          </button>
        ) : null}
      </div>

      {showForm ? (
        <BenefitForm
          initial={editing ? toFormState(editing) : emptyForm}
          editing={!!editing}
          saving={saving}
          error={formError}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSubmit={handleSubmit}
        />
      ) : null}

      {loading ? (
        <div className="flex h-32 items-center justify-center text-sm text-[#8891A4]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Cargando…
        </div>
      ) : loadError ? (
        <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
          {loadError}
        </div>
      ) : benefits.length === 0 && !showForm ? (
        <div className="rounded-[12px] border border-dashed border-[#E8EAF0] bg-white px-6 py-10 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF0FB] text-[#5C6BC0]">
            <Gift className="h-6 w-6" />
          </div>
          <p className="text-sm font-semibold text-[#1A202C]">
            Todavía no ofrecés beneficios
          </p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-[#8891A4]">
            Es opcional. Podés usar Flikker solo para reseñas, o crear un
            beneficio para incentivar el regreso de tus clientes.
          </p>
          {canMutate ? (
            <button
              type="button"
              onClick={openCreate}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0]"
            >
              <Plus className="h-4 w-4" />
              Crear mi primer beneficio
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {benefits.map((benefit) => (
            <BenefitCard
              key={benefit.id}
              benefit={benefit}
              canMutate={canMutate}
              busy={busyId === benefit.id}
              onToggleActive={() => void toggleActive(benefit)}
              onEdit={() => openEdit(benefit)}
              onDelete={() => void remove(benefit)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
