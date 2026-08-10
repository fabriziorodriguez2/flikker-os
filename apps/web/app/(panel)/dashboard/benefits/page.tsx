"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Download,
  Gift,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { useCanMutate } from "../../role-context";
import RedeemValidator from "./redeem-validator";
import { useIsCheckinV2 } from "../../experience-context";
import PageHeader from "@/components/ui/page-header";

// ─── Types ────────────────────────────────────────────────────────────────────

type BenefitType = "discount" | "gift" | "raffle" | "promotion" | "other";

interface LastDraw {
  winnerName: string | null;
  winnerPhone: string | null;
  participantsCount: number;
  periodKey: string;
  drawnAt: string;
}

/**
 * Piloto V2 — puente aditivo hacia Retention V2. `hasKnownValue` es lo que
 * decide si activar "recuperación" pide costo estimado o no: una vez que el
 * motor conoce un valor (de cualquier fuente), no se vuelve a pedir.
 */
interface RetentionBridge {
  recoveryEnabled: boolean;
  rewardGoalEnabled: boolean;
  hasKnownValue: boolean;
}

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
  lastDraw: LastDraw | null;
  retentionBridge: RetentionBridge;
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

/** "2026-07" -> "julio 2026" */
function formatPeriodKey(periodKey: string): string {
  const [year, month] = periodKey.split("-").map(Number);
  if (!year || !month) return periodKey;
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString("es-UY", { month: "long", year: "numeric" });
}

function BenefitCard({
  benefit,
  canMutate,
  showRetentionBridge,
  busy,
  onToggleActive,
  onEdit,
  onDelete,
  onViewParticipants,
  onSetRetentionBridge,
}: {
  benefit: Benefit;
  canMutate: boolean;
  showRetentionBridge: boolean;
  busy: boolean;
  onToggleActive: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onViewParticipants: () => void;
  onSetRetentionBridge: (patch: {
    recoveryEnabled?: boolean;
    rewardGoalEnabled?: boolean;
    estimatedCost?: number;
  }) => Promise<void>;
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

  const [bridgeBusy, setBridgeBusy] = useState<"recovery" | "reward" | "cost" | null>(
    null,
  );
  // Pre-piloto #2 — el costo estimado ya NUNCA es obligatorio para activar
  // recuperación/recompensa (antes bloqueaba con NEEDS_ESTIMATED_COST). Este
  // campo es una mejora opcional para economía, no un requisito de puerta.
  const [costPromptOpen, setCostPromptOpen] = useState(false);
  const [costInput, setCostInput] = useState("");
  const [bridgeError, setBridgeError] = useState<string | null>(null);

  async function toggleRecovery(nextValue: boolean) {
    setBridgeError(null);
    setBridgeBusy("recovery");
    try {
      await onSetRetentionBridge({ recoveryEnabled: nextValue });
    } catch (e) {
      setBridgeError(e instanceof Error ? e.message : "No pudimos guardar.");
    } finally {
      setBridgeBusy(null);
    }
  }

  async function saveEstimatedCost() {
    const cost = Number(costInput);
    if (!costInput.trim() || Number.isNaN(cost) || cost < 0) {
      setBridgeError("Ingresá un costo válido.");
      return;
    }
    setBridgeError(null);
    setBridgeBusy("cost");
    try {
      await onSetRetentionBridge({ estimatedCost: cost });
      setCostPromptOpen(false);
      setCostInput("");
    } catch (e) {
      setBridgeError(e instanceof Error ? e.message : "No pudimos guardar.");
    } finally {
      setBridgeBusy(null);
    }
  }

  async function toggleReward(nextValue: boolean) {
    setBridgeError(null);
    setBridgeBusy("reward");
    try {
      await onSetRetentionBridge({ rewardGoalEnabled: nextValue });
    } catch (e) {
      setBridgeError(e instanceof Error ? e.message : "No pudimos guardar.");
    } finally {
      setBridgeBusy(null);
    }
  }

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

      {showRetentionBridge ? (
        <div className="mt-4 space-y-2.5 rounded-[10px] border border-[#F0F2FA] bg-[#FAFBFC] px-3.5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
            Retención
          </p>
          <p className="text-xs text-[#8891A4]">
            Independiente de &quot;Activo&quot; — activar/desactivar solo
            cambia qué se muestra en el check-in.
          </p>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:gap-8">
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={benefit.retentionBridge.recoveryEnabled}
                disabled={!canMutate || bridgeBusy !== null}
                onChange={(e) => void toggleRecovery(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#5C6BC0]"
              />
              <span className="text-[#1A202C]">Usar para recuperar clientes</span>
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={benefit.retentionBridge.rewardGoalEnabled}
                disabled={!canMutate || bridgeBusy !== null}
                onChange={(e) => void toggleReward(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[#5C6BC0]"
              />
              <span className="text-[#1A202C]">
                Usar como recompensa por visitas
              </span>
            </label>
          </div>

          {/* El costo NUNCA es obligatorio para autorizar — esto es
              puramente opcional, solo mejora la estimación económica y solo
              importa si más adelante querés presupuestar por MONTO. */}
          {(benefit.retentionBridge.recoveryEnabled ||
            benefit.retentionBridge.rewardGoalEnabled) &&
          !benefit.retentionBridge.hasKnownValue ? (
            costPromptOpen ? (
              <div className="flex flex-wrap items-center gap-2 rounded-[8px] bg-white px-3 py-2 ring-1 ring-[#E8EAF0]">
                <span className="text-xs text-[#8891A4]">
                  Costo estimado (opcional):
                </span>
                <input
                  type="number"
                  min={0}
                  value={costInput}
                  onChange={(e) => setCostInput(e.target.value)}
                  placeholder="$"
                  className="h-8 w-24 rounded-[6px] border border-[#E8EAF0] px-2 text-sm outline-none focus:border-[#5C6BC0]"
                />
                <button
                  type="button"
                  onClick={() => void saveEstimatedCost()}
                  disabled={bridgeBusy !== null}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[6px] bg-[#5C6BC0] px-3 text-xs font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-50"
                >
                  {bridgeBusy === "cost" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCostPromptOpen(false);
                    setCostInput("");
                  }}
                  className="text-xs font-semibold text-[#8891A4] hover:text-[#1A202C]"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCostPromptOpen(true)}
                className="text-xs font-semibold text-[#5C6BC0] hover:underline"
              >
                + Agregar costo estimado (opcional)
              </button>
            )
          ) : null}

          {bridgeError ? (
            <p className="text-xs text-[#C0392B]">{bridgeError}</p>
          ) : null}
        </div>
      ) : null}

      {benefit.type === "raffle" ? (
        <div className="mt-4 space-y-3 border-t border-[#F0F2FA] pt-3">
          {benefit.lastDraw ? (
            <div className="flex items-start gap-3 rounded-[10px] border border-[#FAAB4B]/30 bg-[#FFF9F0] px-3 py-2.5">
              <span className="mt-0.5 shrink-0 text-[#D4600A]">
                <Trophy className="h-4 w-4" />
              </span>
              <p className="text-xs leading-relaxed text-[#8A520D]">
                <span className="font-semibold">
                  Último ganador ({formatPeriodKey(benefit.lastDraw.periodKey)}):
                </span>{" "}
                {benefit.lastDraw.winnerName ?? "Sin nombre"}
                {benefit.lastDraw.winnerPhone
                  ? ` (${benefit.lastDraw.winnerPhone})`
                  : ""}
                {" — "}
                {benefit.lastDraw.participantsCount}{" "}
                {benefit.lastDraw.participantsCount === 1
                  ? "participante"
                  : "participantes"}
              </p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={onViewParticipants}
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#5C6BC0] hover:underline"
          >
            <Users className="h-4 w-4" />
            Ver participantes
          </button>
        </div>
      ) : null}
    </article>
  );
}

// ─── Participants modal ───────────────────────────────────────────────────────

interface Participant {
  id: string;
  createdAt: string;
  customer: {
    id: string;
    name: string;
    phoneE164: string;
    email: string | null;
  };
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function downloadParticipantsCsv(benefitTitle: string, rows: Participant[]) {
  const header = ["Nombre", "Teléfono", "Email", "Fecha"];
  const lines = rows.map((r) =>
    [
      csvEscape(r.customer.name),
      csvEscape(r.customer.phoneE164),
      csvEscape(r.customer.email ?? ""),
      csvEscape(formatDate(r.createdAt) ?? ""),
    ].join(","),
  );
  const csv = [header.join(","), ...lines].join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const safeName = benefitTitle.toLowerCase().replace(/\s+/g, "-") || "sorteo";
  const link = document.createElement("a");
  link.href = url;
  link.download = `participantes-${safeName}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function ParticipantsModal({
  benefit,
  isRaffle,
  onClose,
}: {
  benefit: Benefit;
  isRaffle: boolean;
  onClose: () => void;
}) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/proxy/benefits/${benefit.id}/participants`,
        );
        if (!res.ok) throw new Error("No pudimos cargar los participantes.");
        const data = (await res.json()) as Participant[];
        if (!cancelled) setParticipants(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error al cargar.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [benefit.id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-[16px] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#E8EAF0] p-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
              Participantes del sorteo
            </p>
            <h2 className="mt-1 truncate text-lg font-bold text-[#1A202C]">
              {benefit.title}
            </h2>
            {isRaffle ? (
              <p className="mt-1 text-xs text-[#8891A4]">
                Muestra solo el mes en curso. La lista se reinicia sola al
                sortear el ganador.
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-[#8891A4] hover:bg-[#F5F6FA]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex h-24 items-center justify-center text-sm text-[#8891A4]">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : error ? (
            <div className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
              {error}
            </div>
          ) : participants.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#8891A4]">
              Todavía no hay participantes en este sorteo.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-xs font-semibold uppercase tracking-[0.08em] text-[#8891A4]">
                    <th className="pb-2 pr-3">Nombre</th>
                    <th className="pb-2 pr-3">Teléfono</th>
                    <th className="pb-2">Fecha</th>
                  </tr>
                </thead>
                <tbody className="text-[#1A202C]">
                  {participants.map((p) => (
                    <tr key={p.id} className="border-t border-[#F0F2FA]">
                      <td className="py-2 pr-3">{p.customer.name}</td>
                      <td className="py-2 pr-3">{p.customer.phoneE164}</td>
                      <td className="py-2 text-[#8891A4]">
                        {formatDate(p.createdAt) ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[#E8EAF0] p-5">
          <span className="text-sm text-[#8891A4]">
            {participants.length}{" "}
            {participants.length === 1 ? "participante" : "participantes"}
          </span>
          <button
            type="button"
            onClick={() => downloadParticipantsCsv(benefit.title, participants)}
            disabled={participants.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA] disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Descargar CSV
          </button>
        </div>
      </div>
    </div>
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
  const isCheckinV2 = useIsCheckinV2();
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Benefit | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [participantsFor, setParticipantsFor] = useState<Benefit | null>(null);

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

  async function setRetentionBridge(
    benefit: Benefit,
    patch: {
      recoveryEnabled?: boolean;
      rewardGoalEnabled?: boolean;
      estimatedCost?: number;
    },
  ) {
    const res = await fetch(
      `/api/proxy/benefits/${benefit.id}/retention-bridge`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      },
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
      };
      throw new Error(data.message ?? "No pudimos guardar.");
    }
    await load();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 xl:max-w-5xl 2xl:max-w-6xl">
      <PageHeader
        title="Beneficios"
        subtitle={
          isCheckinV2
            ? "Ofrecé incentivos para que tus clientes vuelvan. \"Activo\" decide cuál se muestra en el check-in — podés autorizar varios para recuperación o recompensa al mismo tiempo, estén activos o no."
            : "Ofrecé un incentivo para que tus clientes vuelvan. Solo uno puede estar activo a la vez."
        }
        actions={canMutate && !showForm ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-[12px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white shadow-[0_6px_16px_rgba(92,107,192,0.2)] transition-all hover:-translate-y-px hover:bg-[#5261B4]"
          >
            <Plus className="h-4 w-4" />
            Nuevo beneficio
          </button>
        ) : undefined}
      />

      {/* Redemption codes only exist in Check-in V2. */}
      {canMutate && isCheckinV2 ? <RedeemValidator /> : null}

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
              showRetentionBridge={isCheckinV2}
              busy={busyId === benefit.id}
              onToggleActive={() => void toggleActive(benefit)}
              onEdit={() => openEdit(benefit)}
              onDelete={() => void remove(benefit)}
              onViewParticipants={() => setParticipantsFor(benefit)}
              onSetRetentionBridge={(patch) => setRetentionBridge(benefit, patch)}
            />
          ))}
        </div>
      )}

      {participantsFor ? (
        <ParticipantsModal
          benefit={participantsFor}
          isRaffle={participantsFor.type === "raffle"}
          onClose={() => setParticipantsFor(null)}
        />
      ) : null}
    </div>
  );
}
