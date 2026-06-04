"use client";

import { useState } from "react";

type PlanType = "FREE_TRIAL" | "BASE" | "PRO";

export interface BusinessPlanRow {
  id: string;
  businessId: string;
  plan: PlanType;
  trialGoal: number | null;
  trialStart: string | null;
  startDate: string;
  notes: string | null;
  createdAt: string;
  createdById: string | null;
  createdBy?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  } | null;
}

interface PlanClientProps {
  businessId: string;
  initialCurrent: BusinessPlanRow | null;
  initialHistory: BusinessPlanRow[];
}

const PLAN_OPTIONS: Array<{
  value: PlanType;
  label: string;
  description: string;
}> = [
  {
    value: "FREE_TRIAL",
    label: "① Prueba gratis",
    description: "Piloto activo, meta fija de reseñas, sin cobro.",
  },
  {
    value: "BASE",
    label: "② Plan Base",
    description: "$1.000 UYU/mes, 200 mensajes incluidos.",
  },
  {
    value: "PRO",
    label: "③ Plan Pro",
    description: "$2.000 UYU/mes, 500 mensajes incluidos.",
  },
];

const PLAN_LABEL: Record<PlanType, string> = {
  FREE_TRIAL: "Prueba gratis",
  BASE: "Plan Base",
  PRO: "Plan Pro",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-UY", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function fmtDay(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-UY", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function PlanClient({
  businessId,
  initialCurrent,
  initialHistory,
}: PlanClientProps) {
  const [current, setCurrent] = useState<BusinessPlanRow | null>(initialCurrent);
  const [history, setHistory] = useState<BusinessPlanRow[]>(initialHistory);

  const [plan, setPlan] = useState<PlanType>(current?.plan ?? "FREE_TRIAL");
  const [trialGoal, setTrialGoal] = useState<string>(
    String(current?.trialGoal ?? 25),
  );
  const [trialStart, setTrialStart] = useState<string>(
    current?.trialStart ? current.trialStart.slice(0, 10) : todayIso(),
  );
  const [startDate, setStartDate] = useState<string>(
    current?.startDate ? current.startDate.slice(0, 10) : todayIso(),
  );
  const [notes, setNotes] = useState<string>(current?.notes ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  async function resetOnboarding() {
    if (!confirm("¿Resetear el onboarding del dueño? Verá la guía de bienvenida la próxima vez que entre.")) {
      return;
    }
    setResetting(true);
    setResetMessage(null);
    try {
      const res = await fetch(
        `/api/proxy/platform/businesses/${businessId}/reset-onboarding`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "No se pudo resetear");
      }
      const data = (await res.json()) as { resetCount: number };
      setResetMessage(
        data.resetCount > 0
          ? `Onboarding reseteado (${data.resetCount} usuario${data.resetCount === 1 ? "" : "s"}).`
          : "No hay OWNERs activos para resetear.",
      );
    } catch (err) {
      setResetMessage(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setResetting(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const isTrial = plan === "FREE_TRIAL";
    const goal = parseInt(trialGoal, 10);
    if (isTrial && (!Number.isFinite(goal) || goal < 1)) {
      setError("La meta de reseñas debe ser un número mayor a 0.");
      setSaving(false);
      return;
    }

    const payload: Record<string, unknown> = { plan };
    if (isTrial) {
      payload.trialGoal = goal;
      payload.trialStart = new Date(`${trialStart}T00:00:00`).toISOString();
    } else {
      payload.startDate = new Date(`${startDate}T00:00:00`).toISOString();
      if (notes.trim()) payload.notes = notes.trim();
    }

    try {
      const res = await fetch(
        `/api/proxy/platform/businesses/${businessId}/plans`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          message?: string;
        };
        throw new Error(body.message ?? "No se pudo guardar el plan");
      }
      const created = (await res.json()) as BusinessPlanRow;
      setCurrent(created);
      setHistory((prev) => [created, ...prev]);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Current plan card */}
      <section className="rounded-[12px] border border-[#E8EAF0] bg-white p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8891A4]">
          Plan actual
        </p>
        {current ? (
          <div className="mt-3 flex flex-wrap items-baseline gap-3">
            <span className="rounded-full bg-[#EEF0FB] px-3 py-1 text-sm font-semibold text-[#5C6BC0]">
              {PLAN_LABEL[current.plan]}
            </span>
            {current.plan === "FREE_TRIAL" && current.trialGoal != null && (
              <span className="text-sm text-[#1A202C]">
                Meta: <strong>{current.trialGoal}</strong> reseñas
              </span>
            )}
            <span className="text-xs text-[#8891A4]">
              Activo desde {fmtDay(current.startDate)}
            </span>
          </div>
        ) : (
          <p className="mt-3 text-sm text-[#8891A4]">
            Este negocio aún no tiene un plan asignado. Asigná uno abajo.
          </p>
        )}
      </section>

      {/* Plan form */}
      <form
        onSubmit={submit}
        className="rounded-[12px] border border-[#E8EAF0] bg-white p-5 space-y-5"
      >
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8891A4]">
            {current ? "Cambiar plan" : "Asignar plan"}
          </p>
          <p className="mt-1 text-sm text-[#8891A4]">
            Elegí el plan que querés asignar.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {PLAN_OPTIONS.map((opt) => {
            const selected = plan === opt.value;
            return (
              <label
                key={opt.value}
                className={`cursor-pointer rounded-[10px] border p-4 transition-colors ${
                  selected
                    ? "border-[#5C6BC0] bg-[#EEF0FB]"
                    : "border-[#E8EAF0] hover:bg-[#F5F6FA]"
                }`}
              >
                <input
                  type="radio"
                  name="plan"
                  value={opt.value}
                  checked={selected}
                  onChange={() => setPlan(opt.value)}
                  className="sr-only"
                />
                <p
                  className={`text-sm font-semibold ${
                    selected ? "text-[#5C6BC0]" : "text-[#1A202C]"
                  }`}
                >
                  {opt.label}
                </p>
                <p className="mt-1 text-xs text-[#8891A4]">{opt.description}</p>
              </label>
            );
          })}
        </div>

        {plan === "FREE_TRIAL" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-[#1A202C]">
                Meta de reseñas
              </span>
              <input
                type="number"
                min={1}
                value={trialGoal}
                onChange={(e) => setTrialGoal(e.target.value)}
                className="w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm outline-none focus:border-[#5C6BC0]"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-[#1A202C]">
                Fecha de inicio del piloto
              </span>
              <input
                type="date"
                value={trialStart}
                onChange={(e) => setTrialStart(e.target.value)}
                className="w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm outline-none focus:border-[#5C6BC0]"
                required
              />
            </label>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-[#1A202C]">
                Fecha de inicio de facturación
              </span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm outline-none focus:border-[#5C6BC0] sm:max-w-xs"
                required
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-semibold text-[#1A202C]">
                Notas internas
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                maxLength={2000}
                className="w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-sm outline-none focus:border-[#5C6BC0]"
                placeholder="Notas para el equipo admin..."
              />
            </label>
          </div>
        )}

        {error ? (
          <div className="rounded-[8px] border border-red-200 bg-red-50 px-3 py-2 text-sm text-[#C0392B]">
            {error}
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center rounded-[8px] bg-[#5C6BC0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#4e5db0] disabled:opacity-60"
          >
            {saving ? "Guardando..." : current ? "Cambiar plan" : "Asignar plan"}
          </button>
          {savedAt && Date.now() - savedAt < 8000 && (
            <span className="text-xs font-semibold text-[#639922]">
              ✓ Plan guardado
            </span>
          )}
        </div>
      </form>

      {/* History */}
      <section className="rounded-[12px] border border-[#E8EAF0] bg-white overflow-hidden">
        <div className="border-b border-[#E8EAF0] px-5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8891A4]">
            Historial de cambios
          </p>
        </div>
        {history.length === 0 ? (
          <p className="px-5 py-4 text-sm text-[#8891A4]">
            Aún no hay cambios registrados.
          </p>
        ) : (
          <ul className="divide-y divide-[#E8EAF0]">
            {history.map((row, i) => {
              const prev = history[i + 1];
              const fromLabel = prev ? PLAN_LABEL[prev.plan] : "Sin plan";
              const toLabel = PLAN_LABEL[row.plan];
              const adminName = row.createdBy
                ? `${row.createdBy.firstName} ${row.createdBy.lastName}`.trim() ||
                  row.createdBy.email
                : "—";
              return (
                <li key={row.id} className="px-5 py-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-[#1A202C]">
                      {fromLabel} → {toLabel}
                    </p>
                    <p className="text-xs text-[#8891A4]">{fmtDate(row.createdAt)}</p>
                  </div>
                  <p className="mt-1 text-xs text-[#8891A4]">
                    Cambio realizado por {adminName}
                  </p>
                  {row.plan === "FREE_TRIAL" && row.trialGoal != null && (
                    <p className="mt-1 text-xs text-[#8891A4]">
                      Meta: {row.trialGoal} reseñas · Inicio piloto{" "}
                      {fmtDay(row.trialStart)}
                    </p>
                  )}
                  {row.notes && (
                    <p className="mt-2 rounded-[6px] bg-[#F9F9FB] px-3 py-2 text-xs text-[#1A202C]">
                      {row.notes}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* QA tools (admin-only) */}
      <section className="rounded-[12px] border border-dashed border-[#E8EAF0] bg-white p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8891A4]">
          Herramientas QA
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void resetOnboarding()}
            disabled={resetting}
            className="inline-flex items-center justify-center rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2 text-xs font-semibold text-[#1A202C] hover:bg-[#F5F6FA] disabled:opacity-60"
          >
            {resetting ? "Reseteando..." : "Resetear onboarding del dueño"}
          </button>
          {resetMessage && (
            <span className="text-xs font-semibold text-[#5C6BC0]">
              {resetMessage}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
