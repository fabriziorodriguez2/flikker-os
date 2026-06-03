"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  Edit2,
  MessageSquarePlus,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import PhoneInput, {
  isValidNationalPhone,
  toNationalDigits,
} from "@/components/ui/phone-input";
import { useCanMutate } from "../../role-context";

interface Customer {
  id: string;
  name: string;
  phoneE164: string;
  optedOut: boolean;
  createdAt: string;
  birthday: string | null;
  origin: string;
  attendedToday: boolean;
}

interface CustomersResponse {
  data: Customer[];
  total: number;
  page: number;
  limit: number;
}

type ImportField = "ignore" | "name" | "phone" | "email" | "lastServiceAt";

interface ImportResult {
  imported: number;
  failed: Array<{ row: number; reason: string }>;
  duplicates: number;
}

const IMPORT_FIELD_OPTIONS: Array<{ value: ImportField; label: string }> = [
  { value: "ignore", label: "Ignorar" },
  { value: "name", label: "Nombre" },
  { value: "phone", label: "Teléfono" },
  { value: "email", label: "Email opcional" },
  { value: "lastServiceAt", label: "Fecha de atención" },
];

const inputClass =
  "h-10 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4] focus:border-[#5C6BC0]";
const buttonBase =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-semibold transition-colors disabled:opacity-50";
const secondaryButton = `${buttonBase} border border-[#E8EAF0] bg-white text-[#1A202C] hover:bg-[#F5F6FA]`;
const primaryButton = `${buttonBase} bg-[#5C6BC0] text-white hover:bg-[#4f5eb0]`;

const ORIGIN_LABELS: Record<string, string> = {
  qr: "QR",
  whatsapp: "WhatsApp",
  manual: "Manual",
};

const ORIGIN_COLORS: Record<string, string> = {
  qr: "bg-[#EEF0FB] text-[#5C6BC0]",
  whatsapp: "bg-[#E8F5E9] text-[#2E7D32]",
  manual: "bg-[#F5F6FA] text-[#8891A4]",
};

function OriginBadge({ origin }: { origin: string }) {
  const label = ORIGIN_LABELS[origin] ?? origin;
  const color = ORIGIN_COLORS[origin] ?? "bg-[#F5F6FA] text-[#8891A4]";
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${color}`}>
      {label}
    </span>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("es-UY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function toDateInput(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toISOString().slice(0, 10);
}

function periodToRange(period: string): { from?: string; to?: string } {
  const now = new Date();
  if (period === "month") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { from: from.toISOString() };
  }
  if (period === "lastMonth") {
    const from = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1),
    );
    const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return { from: from.toISOString(), to: to.toISOString() };
  }
  return {};
}

const STAR_RAYS = [
  { tx: 0, ty: -78 },
  { tx: 55, ty: -55 },
  { tx: 78, ty: 0 },
  { tx: 55, ty: 55 },
  { tx: 0, ty: 78 },
  { tx: -55, ty: 55 },
  { tx: -78, ty: 0 },
  { tx: -55, ty: -55 },
];

function CelebrationModal({
  name,
  onDone,
}: {
  name: string;
  onDone: () => void;
}) {
  const [visible, setVisible] = useState(false);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    const exitTimer = setTimeout(() => setVisible(false), 1800);
    const doneTimer = setTimeout(() => onDoneRef.current(), 2100);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(exitTimer);
      clearTimeout(doneTimer);
    };
  }, []);

  return (
    <>
      <style>{`
        @keyframes flk-star-out {
          0%   { transform: translate(0,0) scale(0); opacity: 0; }
          25%  { opacity: 1; }
          100% { transform: translate(var(--tx), var(--ty)) scale(1.1); opacity: 0; }
        }
        @keyframes flk-check-pop {
          0%   { transform: scale(0.4); opacity: 0; }
          55%  { transform: scale(1.18); }
          75%  { transform: scale(0.93); }
          100% { transform: scale(1);   opacity: 1; }
        }
        @keyframes flk-text-up {
          0%   { transform: translateY(8px); opacity: 0; }
          100% { transform: translateY(0);   opacity: 1; }
        }
      `}</style>
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      >
        <div
          className={`relative flex flex-col items-center gap-5 rounded-2xl bg-white px-14 py-10 shadow-2xl transition-all duration-300 ${
            visible ? "scale-100 opacity-100" : "scale-90 opacity-0"
          }`}
        >
          <div
            className="pointer-events-none absolute inset-0 flex items-start justify-center"
            style={{ top: 40 }}
          >
            {STAR_RAYS.map((ray, i) => (
              <span
                key={i}
                style={
                  {
                    position: "absolute",
                    "--tx": `${ray.tx}px`,
                    "--ty": `${ray.ty}px`,
                    animation: visible
                      ? `flk-star-out 0.65s cubic-bezier(0.22,1,0.36,1) ${i * 0.04}s forwards`
                      : "none",
                    fontSize: i % 2 === 0 ? 18 : 13,
                    lineHeight: 1,
                  } as React.CSSProperties
                }
              >
                {i % 2 === 0 ? "★" : "✦"}
              </span>
            ))}
          </div>
          <div
            style={{
              animation: visible
                ? "flk-check-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) forwards"
                : "none",
              opacity: 0,
            }}
            className="flex h-[76px] w-[76px] items-center justify-center rounded-full bg-[#639922]/10"
          >
            <Check strokeWidth={3} className="h-9 w-9 text-[#639922]" />
          </div>
          <div
            className="text-center"
            style={{
              animation: visible ? "flk-text-up 0.4s ease-out 0.25s both" : "none",
              opacity: 0,
            }}
          >
            <p className="text-[18px] font-bold text-[#1A202C]">{name}</p>
            <p className="mt-1 text-sm text-[#8891A4]">
              Pedido de reseña en camino
            </p>
            <p className="mt-3 text-[13px] font-semibold text-[#639922]">
              ¡Así se construye reputación!
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Manual Campaign Modal ────────────────────────────────────────────────────

interface ManualRecipient {
  id: string;
  name: string;
  phoneE164: string;
}

function WhatsAppPreview({
  message,
  businessName,
}: {
  message: string;
  businessName: string;
}) {
  const preview = message
    .replace(/{nombre}/g, "María García")
    .replace(/{negocio}/g, businessName || "tu negocio");

  return (
    <div className="rounded-[12px] bg-[#E5DDD5] p-4">
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#8891A4]">
        Vista previa WhatsApp
      </p>
      {preview ? (
        <div className="max-w-[260px] rounded-[12px] rounded-tl-none bg-white px-3 py-2 shadow-sm">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[#111]">
            {preview}
          </p>
        </div>
      ) : (
        <p className="text-xs italic text-[#9ca3af]">
          Escribí el mensaje para ver la vista previa
        </p>
      )}
    </div>
  );
}

function ManualCampaignModal({
  initialRecipients,
  onClose,
}: {
  initialRecipients: ManualRecipient[];
  onClose: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [recipients, setRecipients] =
    useState<ManualRecipient[]>(initialRecipients);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{
    sent: number;
    failed: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function removeRecipient(id: string) {
    setRecipients((prev) => prev.filter((r) => r.id !== id));
  }

  function insertVariable(variable: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next =
      message.slice(0, start) + variable + message.slice(end);
    setMessage(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(
        start + variable.length,
        start + variable.length,
      );
    });
  }

  async function handleSend() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/proxy/campaigns/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipients: recipients.map((r) => ({
            customerId: r.id,
            name: r.name,
            phoneE164: r.phoneE164,
          })),
          messageBody: message,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        sent?: number;
        failed?: number;
        message?: string;
      };
      if (!res.ok) throw new Error(data.message ?? "Error al enviar");
      setResult({ sent: data.sent ?? 0, failed: data.failed ?? 0 });
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al enviar");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1B2A]/40 p-4">
      <div className="w-full max-w-2xl rounded-[16px] border border-[#E8EAF0] bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E8EAF0] px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-[#1A202C]">
              Campaña manual
            </h2>
            <p className="text-xs text-[#8891A4]">
              Paso {step} de {result ? "3" : "2"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#8891A4] hover:bg-[#F5F6FA]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex gap-1 px-6 pt-4">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                step >= s ? "bg-[#5C6BC0]" : "bg-[#E8EAF0]"
              }`}
            />
          ))}
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {/* Step 1 — Recipients */}
          {step === 1 && (
            <div>
              <p className="mb-3 text-sm font-semibold text-[#1A202C]">
                Destinatarios ({recipients.length})
              </p>
              {recipients.length === 0 ? (
                <p className="rounded-[8px] bg-[#FFF3CD] px-4 py-3 text-sm text-[#856404]">
                  No hay destinatarios seleccionados.
                </p>
              ) : (
                <div className="max-h-[260px] overflow-y-auto rounded-[8px] border border-[#E8EAF0]">
                  {recipients.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between border-b border-[#E8EAF0] px-4 py-2.5 last:border-b-0"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#1A202C]">
                          {r.name}
                        </p>
                        <p className="text-xs text-[#8891A4]">{r.phoneE164}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRecipient(r.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#8891A4] hover:bg-[#F5F6FA] hover:text-[#C0392B]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 2 — Message */}
          {step === 2 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold text-[#1A202C]">
                  Mensaje
                </p>
                <div className="mb-2 flex gap-2">
                  {["{nombre}", "{negocio}"].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => insertVariable(v)}
                      className="rounded-full border border-[#E8EAF0] bg-[#F5F6FA] px-3 py-1 text-xs font-semibold text-[#5C6BC0] hover:bg-[#EEF0FB]"
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={1000}
                  rows={8}
                  placeholder="Hola {nombre}, queremos contarte algo especial en {negocio}..."
                  className="w-full resize-none rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2.5 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4] focus:border-[#5C6BC0]"
                />
                <p className="mt-1 text-right text-xs text-[#8891A4]">
                  {message.length}/1000
                </p>
              </div>
              <WhatsAppPreview message={message} businessName="" />
            </div>
          )}

          {/* Step 3 — Result */}
          {step === 3 && result && (
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#639922]/10">
                <Check strokeWidth={2.5} className="h-8 w-8 text-[#639922]" />
              </div>
              <p className="text-lg font-bold text-[#1A202C]">¡Enviado!</p>
              <p className="mt-2 text-sm text-[#8891A4]">
                {result.sent} enviados · {result.failed} fallidos
              </p>
              {result.failed > 0 && (
                <p className="mt-3 text-xs text-[#C0392B]">
                  Los mensajes fallidos no se reintentarán automáticamente.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#E8EAF0] px-6 py-4">
          {error && <p className="text-sm text-[#C0392B]">{error}</p>}
          {!error && <span />}
          <div className="flex gap-2">
            {step === 3 ? (
              <button type="button" onClick={onClose} className={primaryButton}>
                Cerrar
              </button>
            ) : (
              <>
                {step > 1 && !sending && (
                  <button
                    type="button"
                    onClick={() => setStep((s) => (s - 1) as 1 | 2)}
                    className={secondaryButton}
                  >
                    Atrás
                  </button>
                )}
                {step === 1 && (
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    disabled={recipients.length === 0}
                    className={primaryButton}
                  >
                    Continuar
                  </button>
                )}
                {step === 2 && (
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={sending || !message.trim()}
                    className={primaryButton}
                  >
                    {sending
                      ? `Enviando a ${recipients.length}...`
                      : `Enviar a ${recipients.length}`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

const ORIGIN_FILTER_OPTIONS = [
  { value: "qr", label: "QR" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "manual", label: "Manual" },
];

const DATE_FILTER_OPTIONS = [
  { value: "all", label: "Todo el tiempo" },
  { value: "month", label: "Este mes" },
  { value: "lastMonth", label: "Último mes" },
];

export default function CustomersPage() {
  const canMutate = useCanMutate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [originFilter, setOriginFilter] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [celebrationName, setCelebrationName] = useState<string | null>(null);
  const [attendedTodayIds, setAttendedTodayIds] = useState<Set<string>>(
    new Set(),
  );
  const [resendCustomer, setResendCustomer] = useState<Customer | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Customer | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showManualModal, setShowManualModal] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birthday, setBirthday] = useState("");
  const [saving, setSaving] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importColumns, setImportColumns] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<Array<Record<string, string>>>(
    [],
  );
  const [columnMapping, setColumnMapping] = useState<
    Record<string, ImportField>
  >({});
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const dateRange = useMemo(() => periodToRange(dateFilter), [dateFilter]);

  const query = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), limit: "10" });
    if (search.trim()) params.set("search", search.trim());
    if (originFilter.length > 0) params.set("origin", originFilter.join(","));
    if (dateRange.from) params.set("from", dateRange.from);
    if (dateRange.to) params.set("to", dateRange.to);
    return params.toString();
  }, [page, search, originFilter, dateRange]);

  // Export query — same filters but high limit, no pagination
  const exportQuery = useMemo(() => {
    const params = new URLSearchParams({ page: "1", limit: "1000" });
    if (search.trim()) params.set("search", search.trim());
    if (originFilter.length > 0) params.set("origin", originFilter.join(","));
    if (dateRange.from) params.set("from", dateRange.from);
    if (dateRange.to) params.set("to", dateRange.to);
    return params.toString();
  }, [search, originFilter, dateRange]);

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/proxy/customers?${query}`);
      const data = (await res.json().catch(() => ({}))) as
        | CustomersResponse
        | { message?: string };
      if (!res.ok) {
        throw new Error(
          "message" in data && data.message
            ? data.message
            : "Error al cargar clientes",
        );
      }
      const resp = data as CustomersResponse;
      setCustomers(resp.data);
      setTotal(resp.total);
      // Seed local attended state from API
      setAttendedTodayIds((prev) => {
        const next = new Set(prev);
        resp.data.forEach((c) => {
          if (c.attendedToday) next.add(c.id);
        });
        return next;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar clientes");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void fetchCustomers();
  }, [fetchCustomers]);

  // Reset page and selection when filters change
  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [search, originFilter, dateFilter]);

  function toggleOriginFilter(val: string) {
    setOriginFilter((prev) =>
      prev.includes(val) ? prev.filter((o) => o !== val) : [...prev, val],
    );
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === customers.length && customers.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(customers.map((c) => c.id)));
    }
  }

  const selectedCustomers = customers.filter((c) => selectedIds.has(c.id));

  function openNew() {
    setEditing(null);
    setName("");
    setPhone("");
    setBirthday("");
    setShowForm(true);
  }

  function openEdit(customer: Customer) {
    setEditing(customer);
    setName(customer.name);
    setPhone(customer.phoneE164);
    setBirthday(toDateInput(customer.birthday));
    setShowForm(true);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidNationalPhone(toNationalDigits(phone))) {
      setError("Formato inválido. Ingresá entre 7 y 9 dígitos.");
      return;
    }

    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch(
        editing ? `/api/proxy/customers/${editing.id}` : "/api/proxy/customers",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            phone,
            birthday: birthday || undefined,
          }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Error al guardar");
      setMessage(editing ? "Cliente actualizado" : "Cliente creado");
      setShowForm(false);
      await fetchCustomers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(customer: Customer) {
    setMessage(null);
    setError(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/proxy/customers/${customer.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Error al archivar");
      setMessage("Cliente archivado");
      setPendingDelete(null);
      await fetchCustomers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al archivar");
    } finally {
      setSaving(false);
    }
  }

  async function doAttendToday(customer: Customer) {
    setError(null);
    try {
      const res = await fetch("/api/proxy/service-events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: customer.id,
          serviceType: "Servicio",
          createdVia: "manual_panel",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Error al registrar atención");
      setAttendedTodayIds((prev) => new Set([...prev, customer.id]));
      setCelebrationName(customer.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al registrar atención");
    }
  }

  function handleAttendedClick(customer: Customer) {
    if (customer.optedOut || !canMutate) return;
    if (attendedTodayIds.has(customer.id)) {
      setResendCustomer(customer);
    } else {
      void doAttendToday(customer);
    }
  }

  async function handleExportCsv(onlySelected = false) {
    let rows: Customer[];
    if (onlySelected) {
      rows = customers.filter((c) => selectedIds.has(c.id));
    } else {
      try {
        const res = await fetch(`/api/proxy/customers?${exportQuery}`);
        const data = (await res.json().catch(() => ({}))) as CustomersResponse;
        rows = data.data ?? [];
      } catch {
        rows = [];
      }
    }

    const csv = [
      ["nombre", "telefono", "origen", "fecha_captura"].join(","),
      ...rows.map((r) =>
        [
          `"${r.name.replace(/"/g, '""')}"`,
          r.phoneE164,
          r.origin,
          r.createdAt.slice(0, 10),
        ].join(","),
      ),
    ].join("\n");

    const today = new Date().toISOString().slice(0, 10);
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `clientes-${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!importFile) {
      setError("Seleccioná un archivo CSV o XLSX");
      return;
    }
    const mapping = buildImportMapping(columnMapping);
    if (!mapping.name || !mapping.phone) {
      setError("Mapeá al menos las columnas de nombre y teléfono");
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.set("file", importFile);
      formData.set("mapping", JSON.stringify(mapping));
      const res = await fetch("/api/proxy/customers/import-csv", {
        method: "POST",
        body: formData,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? "Error al importar");
      const result = data as ImportResult;
      setImportResult(result);
      setMessage(
        `Importados: ${result.imported}. Duplicados: ${result.duplicates}. Fallidos: ${result.failed.length}`,
      );
      await fetchCustomers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al importar");
    } finally {
      setSaving(false);
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setMessage(null);
    setImportResult(null);
    try {
      const parsed = await parseImportFile(file);
      setImportFile(file);
      setImportColumns(parsed.columns);
      setImportRows(parsed.rows);
      setColumnMapping(inferColumnMapping(parsed.columns));
    } catch (e) {
      setImportFile(null);
      setImportColumns([]);
      setImportRows([]);
      setColumnMapping({});
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo");
    }
  }

  function downloadTemplate() {
    const csvTemplate = [
      "nombre,telefono,fecha_ultimo_servicio",
      "María García,091234567,2026-01-15",
      "Claudia Ruiz,099887766,2026-01-16",
    ].join("\n");
    const blob = new Blob([`﻿${csvTemplate}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "plantilla-clientes-flikker.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const totalPages = Math.max(1, Math.ceil(total / 10));
  const allSelected =
    customers.length > 0 && selectedIds.size === customers.length;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[22px] font-bold text-[#1A202C]">
          Clientes
        </h1>
      </div>

      {error || message ? (
        <div
          className={`rounded-[8px] border px-4 py-3 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-[#C0392B]"
              : "border-green-200 bg-green-50 text-[#639922]"
          }`}
        >
          {error ?? message}
        </div>
      ) : null}

      {/* Search + actions row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="relative w-full max-w-[300px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8891A4]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-[8px] border border-[#E8EAF0] bg-white pl-10 pr-3 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4] focus:border-[#5C6BC0]"
            placeholder="Buscar por nombre o teléfono"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void handleExportCsv(false)}
            className={secondaryButton}
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
          {canMutate ? (
            <button
              className={secondaryButton}
              onClick={() => setShowImport((v) => !v)}
            >
              <Upload className="h-4 w-4" />
              Importar CSV
            </button>
          ) : null}
          <button className={primaryButton} onClick={openNew}>
            <Plus className="h-4 w-4" />
            Nuevo cliente
          </button>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-[#8891A4]">Origen:</span>
          {ORIGIN_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleOriginFilter(opt.value)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                originFilter.includes(opt.value)
                  ? "border-[#5C6BC0] bg-[#EEF0FB] text-[#5C6BC0]"
                  : "border-[#E8EAF0] bg-white text-[#8891A4] hover:border-[#5C6BC0] hover:text-[#5C6BC0]"
              }`}
            >
              {opt.label}
            </button>
          ))}
          {originFilter.length > 0 && (
            <button
              type="button"
              onClick={() => setOriginFilter([])}
              className="text-xs text-[#8891A4] hover:text-[#C0392B]"
            >
              Todos
            </button>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-[#8891A4]">Período:</span>
          {DATE_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setDateFilter(opt.value)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                dateFilter === opt.value
                  ? "border-[#5C6BC0] bg-[#EEF0FB] text-[#5C6BC0]"
                  : "border-[#E8EAF0] bg-white text-[#8891A4] hover:border-[#5C6BC0] hover:text-[#5C6BC0]"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {showImport ? (
        <form
          onSubmit={handleImport}
          className="rounded-[12px] border border-[#E8EAF0] bg-white p-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-[#1A202C]">
                Importar clientes
              </h2>
              <p className="mt-1 text-sm text-[#8891A4]">
                Subí un CSV o XLSX y confirmá el mapeo antes de importar.
              </p>
            </div>
            <button
              type="button"
              onClick={downloadTemplate}
              className={secondaryButton}
            >
              <Download className="h-4 w-4" />
              Descargar plantilla
            </button>
          </div>

          <label
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              const file = event.dataTransfer.files[0];
              if (file) void handleFile(file);
            }}
            className={`mt-4 block cursor-pointer rounded-[12px] border border-dashed px-5 py-6 text-center text-sm transition-colors ${
              dragActive
                ? "border-[#5C6BC0] bg-[#EEF0FB]"
                : "border-[#E8EAF0] bg-[#F5F6FA]"
            }`}
          >
            <input
              type="file"
              accept=".csv,.xlsx"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <span className="font-semibold text-[#1A202C]">
              Arrastrá tu archivo acá o hacé clic para seleccionarlo
            </span>
            {importFile ? (
              <span className="mt-2 block text-[#5C6BC0]">
                {importFile.name}
              </span>
            ) : null}
          </label>

          {importColumns.length > 0 ? (
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold text-[#1A202C]">
                  Mapeo de columnas
                </h3>
                <div className="mt-3 grid gap-2">
                  {importColumns.map((column) => (
                    <label
                      key={column}
                      className="grid grid-cols-2 items-center gap-2 text-sm"
                    >
                      <span className="text-[#8891A4]">{column}</span>
                      <select
                        className={inputClass}
                        value={columnMapping[column] ?? "ignore"}
                        onChange={(event) =>
                          setColumnMapping((current) => ({
                            ...current,
                            [column]: event.target.value as ImportField,
                          }))
                        }
                      >
                        {IMPORT_FIELD_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              </div>
              <div className="overflow-hidden rounded-[8px] border border-[#E8EAF0]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F5F6FA] text-[#8891A4]">
                    <tr>
                      {importColumns.map((column) => (
                        <th key={column} className="px-3 py-2 font-semibold">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importRows.slice(0, 5).map((row, index) => (
                      <tr key={index} className="border-t border-[#E8EAF0]">
                        {importColumns.map((column) => (
                          <td key={column} className="px-3 py-2">
                            {row[column] || "-"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {importResult ? (
            <p className="mt-4 text-sm text-[#8891A4]">
              Importados: {importResult.imported}. Duplicados:{" "}
              {importResult.duplicates}. Fallidos: {importResult.failed.length}.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={!canMutate || saving || !importFile}
            className={`${primaryButton} mt-4`}
          >
            {saving ? "Importando..." : "Confirmar importación"}
          </button>
        </form>
      ) : null}

      {/* Table */}
      <div className="overflow-hidden rounded-[12px] border border-[#E8EAF0] bg-white">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-[#F5F6FA] text-[11px] uppercase tracking-[0.08em] text-[#8891A4]">
            <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-[#D0D5DD] accent-[#5C6BC0]"
                />
              </th>
              <th className="px-4 py-3 font-semibold">Nombre</th>
              <th className="px-4 py-3 font-semibold">Teléfono</th>
              <th className="px-4 py-3 font-semibold">Origen</th>
              <th className="px-4 py-3 font-semibold">Fecha</th>
              <th className="px-4 py-3 text-right font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-[#8891A4]"
                >
                  Cargando clientes...
                </td>
              </tr>
            ) : customers.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-10 text-center text-[#8891A4]"
                >
                  No hay clientes para mostrar.
                </td>
              </tr>
            ) : (
              customers.map((customer) => {
                const isAttended = attendedTodayIds.has(customer.id);
                return (
                  <tr
                    key={customer.id}
                    className={`border-t border-[#E8EAF0] ${
                      selectedIds.has(customer.id) ? "bg-[#F8F9FF]" : "hover:bg-[#FAFBFC]"
                    }`}
                  >
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(customer.id)}
                        onChange={() => toggleSelect(customer.id)}
                        className="h-4 w-4 rounded border-[#D0D5DD] accent-[#5C6BC0]"
                      />
                    </td>
                    <td className="px-4 py-4 font-semibold text-[#1A202C]">
                      {customer.name}
                    </td>
                    <td className="px-4 py-4 text-[#1A202C]">
                      {customer.phoneE164}
                    </td>
                    <td className="px-4 py-4">
                      <OriginBadge origin={customer.origin} />
                    </td>
                    <td className="px-4 py-4 text-[#8891A4]">
                      {formatDate(customer.createdAt)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleAttendedClick(customer)}
                          disabled={!canMutate || customer.optedOut}
                          className={`inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-xs font-semibold disabled:opacity-50 ${
                            isAttended
                              ? "bg-[#EEF7E8] text-[#639922]"
                              : "border border-[#E8EAF0] bg-white text-[#8891A4] hover:border-[#5C6BC0] hover:text-[#5C6BC0]"
                          }`}
                        >
                          {isAttended ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              Atendido hoy
                            </>
                          ) : (
                            "Marcar atendido"
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(customer)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#E8EAF0] text-[#8891A4] hover:bg-[#F5F6FA]"
                          aria-label="Editar cliente"
                        >
                          <Edit2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(customer)}
                          disabled={!canMutate}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#E8EAF0] text-[#8891A4] hover:bg-[#F5F6FA] disabled:opacity-50"
                          aria-label="Archivar cliente"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[#8891A4]">
          {total > 0
            ? `${(page - 1) * 10 + 1}–${Math.min(page * 10, total)} de ${total} clientes`
            : "0 clientes"}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="inline-flex h-8 items-center rounded-[8px] border border-[#E8EAF0] px-3 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA] disabled:opacity-40"
            >
              ← Anterior
            </button>
            <span className="text-sm text-[#8891A4]">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="inline-flex h-8 items-center rounded-[8px] border border-[#E8EAF0] px-3 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA] disabled:opacity-40"
            >
              Siguiente →
            </button>
          </div>
        )}
      </div>

      {/* Sticky selection action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-2xl border border-[#E8EAF0] bg-white px-5 py-3 shadow-xl">
            <span className="text-sm font-semibold text-[#1A202C]">
              {selectedIds.size} seleccionado{selectedIds.size !== 1 ? "s" : ""}
            </span>
            <div className="h-5 w-px bg-[#E8EAF0]" />
            <button
              type="button"
              onClick={() => {
                setShowManualModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-[8px] bg-[#5C6BC0] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#4f5eb0]"
            >
              <MessageSquarePlus className="h-4 w-4" />
              Crear campaña
            </button>
            <button
              type="button"
              onClick={() => void handleExportCsv(true)}
              className="inline-flex items-center gap-1.5 rounded-[8px] border border-[#E8EAF0] px-3 py-1.5 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA]"
            >
              <Download className="h-4 w-4" />
              Exportar selección
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[#8891A4] hover:bg-[#F5F6FA]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Forms and modals */}
      {showForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1B2A]/40 p-4">
          <form
            onSubmit={handleSave}
            className="w-full max-w-lg rounded-[12px] border border-[#E8EAF0] bg-white p-6"
          >
            <h2 className="text-lg font-bold text-[#1A202C]">
              {editing ? "Editar cliente" : "Nuevo cliente"}
            </h2>
            <div className="mt-5 grid gap-4">
              <label className="grid gap-2 text-sm font-semibold text-[#1A202C]">
                Nombre
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={inputClass}
                  placeholder="María García"
                  required
                />
              </label>
              <PhoneInput
                label="Teléfono"
                value={phone}
                onChange={setPhone}
                required
              />
              <div className="grid gap-2">
                <label className="text-sm font-semibold text-[#1A202C]">
                  Fecha de nacimiento
                  <input
                    type="date"
                    value={birthday}
                    onChange={(e) => setBirthday(e.target.value)}
                    className={`${inputClass} mt-2`}
                  />
                </label>
                <p className="text-xs text-[#B0B8C9]">
                  Opcional · se usa para la campaña de cumpleaños
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setShowForm(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving || !canMutate}
                className={primaryButton}
              >
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {celebrationName ? (
        <CelebrationModal
          name={celebrationName}
          onDone={() => setCelebrationName(null)}
        />
      ) : null}

      {/* Resend confirmation */}
      {resendCustomer ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1B2A]/40 p-4">
          <div className="w-full max-w-sm rounded-[12px] border border-[#E8EAF0] bg-white p-6">
            <h2 className="text-base font-bold text-[#1A202C]">
              Ya marcaste a {resendCustomer.name} hoy
            </h2>
            <p className="mt-2 text-sm text-[#8891A4]">
              ¿Querés reenviarle el pedido de reseña?
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setResendCustomer(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={primaryButton}
                onClick={() => {
                  const c = resendCustomer;
                  setResendCustomer(null);
                  void doAttendToday(c);
                }}
              >
                Sí, reenviar
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1B2A]/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-customer-title"
            className="w-full max-w-md rounded-[12px] border border-[#E8EAF0] bg-white p-6"
          >
            <div className="flex items-start gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[#C0392B]/10 text-[#C0392B]">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2
                  id="archive-customer-title"
                  className="text-lg font-bold text-[#1A202C]"
                >
                  Archivar cliente
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#8891A4]">
                  ¿Querés archivar a{" "}
                  <span className="font-semibold text-[#1A202C]">
                    {pendingDelete.name}
                  </span>
                  ? No va a aparecer en el listado principal.
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className={secondaryButton}
                onClick={() => setPendingDelete(null)}
                disabled={saving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`${buttonBase} bg-[#C0392B] text-white hover:bg-[#a93226]`}
                onClick={() => void handleDelete(pendingDelete)}
                disabled={saving || !canMutate}
              >
                {saving ? "Archivando..." : "Archivar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showManualModal && (
        <ManualCampaignModal
          initialRecipients={selectedCustomers.map((c) => ({
            id: c.id,
            name: c.name,
            phoneE164: c.phoneE164,
          }))}
          onClose={() => setShowManualModal(false)}
        />
      )}
    </div>
  );
}

async function parseImportFile(file: File): Promise<{
  columns: string[];
  rows: Array<Record<string, string>>;
}> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "csv" && extension !== "xlsx") {
    throw new Error("Solo se aceptan archivos .csv o .xlsx");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("El archivo no puede superar 5MB");
  }

  if (extension === "csv") {
    return new Promise((resolve, reject) => {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          if (result.errors.length > 0) {
            reject(new Error("No se pudo leer el CSV"));
            return;
          }
          const columns = result.meta.fields?.filter(Boolean) ?? [];
          resolve({
            columns,
            rows: normalizePreviewRows(result.data, columns),
          });
        },
        error: () => reject(new Error("No se pudo leer el CSV")),
      });
    });
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return { columns: [], rows: [] };
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(
    workbook.Sheets[firstSheet],
    { defval: "", raw: false },
  );
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  return { columns, rows: normalizePreviewRows(rows, columns) };
}

function normalizePreviewRows(
  rows: Array<Record<string, unknown>>,
  columns: string[],
) {
  return rows.map((row) =>
    Object.fromEntries(
      columns.map((column) => [column, String(row[column] ?? "").trim()]),
    ),
  );
}

function inferColumnMapping(
  columns: string[],
): Record<string, ImportField> {
  return Object.fromEntries(
    columns.map((column) => {
      const normalized = normalizeColumn(column);
      let field: ImportField = "ignore";
      if (["nombre", "name"].includes(normalized)) field = "name";
      if (["telefono", "teléfono", "phone"].includes(normalized))
        field = "phone";
      if (normalized === "email") field = "email";
      if (
        [
          "fecha ultimo servicio",
          "fecha último servicio",
          "fecha_ultimo_servicio",
          "last service at",
          "last_service_at",
        ].includes(normalized)
      ) {
        field = "lastServiceAt";
      }
      return [column, field];
    }),
  );
}

function buildImportMapping(mapping: Record<string, ImportField>) {
  return Object.fromEntries(
    Object.entries(mapping)
      .filter(([, field]) => field !== "ignore")
      .map(([column, field]) => [field, column]),
  ) as Partial<Record<Exclude<ImportField, "ignore">, string>>;
}

function normalizeColumn(column: string) {
  return column.trim().toLowerCase().replace(/\s+/g, " ");
}
