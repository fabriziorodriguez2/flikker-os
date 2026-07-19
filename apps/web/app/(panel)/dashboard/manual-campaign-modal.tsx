"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Trash2, X } from "lucide-react";

// ── Template library ──────────────────────────────────────────────────────────

export interface ManualRecipient {
  id: string;
  name: string;
  phoneE164: string;
}

type TemplateVertical = "gastronomy" | "general";

const CUSTOM_MSG_ID = "__custom__";
type TemplateTag =
  | "Reactivación"
  | "Novedad"
  | "Promo"
  | "Conversión"
  | "Seguimiento"
  | "Recordatorio"
  | "Retención"
  | "Fidelización";

// Unified display type — covers both system templates and custom (DB) ones
interface DisplayTemplate {
  id: string;
  title: string;
  body: string;
  tag: string;
  isCustom: boolean;
}

// Custom template as returned by the API
interface CustomTemplate {
  id: string;
  title: string;
  body: string;
  vertical: string;
  tag: string;
  createdAt: string;
}

// System template definition (static)
interface SystemTemplate {
  id: string;
  title: string;
  body: string;
  vertical: TemplateVertical;
  tag: TemplateTag;
}

type FilterId = "all" | "custom" | TemplateVertical;

const TAG_STYLES: Record<string, string> = {
  Reactivación: "bg-[#FFF4E5] text-[#D4600A]",
  Novedad: "bg-[#EFF6FF] text-[#1D6EBF]",
  Promo: "bg-[#F0FDF4] text-[#15803D]",
  Conversión: "bg-[#EEF0FB] text-[#5C6BC0]",
  Seguimiento: "bg-[#F5F6FA] text-[#8891A4]",
  Recordatorio: "bg-[#FEFCE8] text-[#854D0E]",
  Retención: "bg-[#FEF2F2] text-[#B91C1C]",
  Fidelización: "bg-[#F0FDF4] text-[#15803D]",
  Custom: "bg-[#F5F6FA] text-[#8891A4]",
};

const SYSTEM_TEMPLATES: SystemTemplate[] = [
  // Gastronomía
  {
    id: "g1",
    title: "Menú nuevo",
    body: "Hola {nombre}, esta semana en {negocio} tenemos novedades en el menú. ¡Te esperamos!",
    vertical: "gastronomy",
    tag: "Novedad",
  },
  {
    id: "g2",
    title: "Te extrañamos",
    body: "Hola {nombre}, hace un tiempo que no te vemos por {negocio}. ¡Te esperamos con las puertas abiertas!",
    vertical: "gastronomy",
    tag: "Reactivación",
  },
  {
    id: "g3",
    title: "Reservá tu mesa",
    body: "Hola {nombre}, esta semana en {negocio} tenemos lugar disponible. ¿Te reservamos una mesa?",
    vertical: "gastronomy",
    tag: "Conversión",
  },
  {
    id: "g4",
    title: "Promo del día",
    body: "Hola {nombre}, hoy en {negocio} tenemos una promo especial. ¡Venite!",
    vertical: "gastronomy",
    tag: "Promo",
  },
  // General
  {
    id: "gen1",
    title: "Gracias por tu visita",
    body: "Hola {nombre}, gracias por visitarnos en {negocio}. ¡Fue un gusto atenderte!",
    vertical: "general",
    tag: "Fidelización",
  },
  {
    id: "gen2",
    title: "Beneficio exclusivo",
    body: "Hola {nombre}, tenemos algo especial para vos en {negocio}. ¡No te lo pierdas!",
    vertical: "general",
    tag: "Promo",
  },
  {
    id: "gen3",
    title: "Novedades",
    body: "Hola {nombre}, hay novedades en {negocio} que te pueden interesar. ¿Querés que te contemos?",
    vertical: "general",
    tag: "Novedad",
  },
];

const FILTER_PILLS: { id: FilterId; label: string }[] = [
  { id: "all", label: "Todos" },
  { id: "custom", label: "Mis plantillas" },
  { id: "gastronomy", label: "Gastronomía" },
  { id: "general", label: "General" },
];

function businessVerticalToFilter(v?: string): FilterId {
  if (!v) return "all";
  if (v === "gastronomy") return "gastronomy";
  return "all";
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface FilterCounts {
  total: number;
  byOrigin: { qr: number; whatsapp: number; manual: number };
  birthdayThisMonth: number;
  noReview: number;
  notAttended30d: number;
}

type FilterMode =
  | "all"
  | "by-origin"
  | "birthday-month"
  | "no-review"
  | "not-attended-30d"
  | "manual-preselected";

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

const buttonBase =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[8px] px-4 text-sm font-semibold transition-colors disabled:opacity-50";
const secondaryButton = `${buttonBase} border border-[#E8EAF0] bg-white text-[#1A202C] hover:bg-[#F5F6FA]`;
const primaryButton = `${buttonBase} bg-[#5C6BC0] text-white hover:bg-[#4f5eb0]`;

function TemplateCard({
  template,
  selected,
  businessName,
  onSelect,
  onDelete,
}: {
  template: DisplayTemplate;
  selected: boolean;
  businessName: string;
  onSelect: () => void;
  onDelete?: (e: React.MouseEvent) => void;
}) {
  const preview = template.body
    .replace(/{nombre}/g, "María")
    .replace(/{negocio}/g, businessName || "tu negocio");

  const tagStyle = TAG_STYLES[template.tag] ?? "bg-[#F5F6FA] text-[#8891A4]";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
      className={`relative rounded-[8px] border p-3 transition-colors ${
        selected
          ? "border-[#9188F5] bg-[#EEEDFE] ring-1 ring-[#9188F5]"
          : "cursor-pointer border-[#E8EAF0] hover:border-[#9188F5] hover:bg-[#F5F4FF]"
      }`}
    >
      {template.isCustom && onDelete && (
        <button
          type="button"
          aria-label="Eliminar plantilla"
          onClick={onDelete}
          className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded text-[#B0B8C9] hover:text-[#C0392B]"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="mb-1.5 flex items-start gap-2">
        <span
          className={`text-[13px] font-bold leading-tight text-[#1A202C] ${template.isCustom ? "pr-5" : ""}`}
        >
          {template.title}
        </span>
        <span
          className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tagStyle}`}
        >
          {template.tag}
        </span>
      </div>
      <p
        className="overflow-hidden text-[11px] leading-relaxed text-[#8891A4]"
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {preview}
      </p>
    </div>
  );
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

function ModeCard({
  selected,
  number,
  title,
  subtitle,
  disabled,
  onSelect,
  children,
}: {
  selected: boolean;
  number: string;
  title: string;
  subtitle: string;
  disabled?: boolean;
  onSelect: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-[10px] border p-4 transition-colors ${
        disabled
          ? "border-[#E8EAF0] bg-[#F9F9FB] opacity-60"
          : selected
            ? "border-[#5C6BC0] bg-[#EEF0FB]"
            : "border-[#E8EAF0] hover:bg-[#F5F6FA]"
      }`}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className="w-full text-left disabled:cursor-not-allowed"
      >
        <span
          className={`mb-2 inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${
            disabled
              ? "bg-[#F0F1F5] text-[#B0B8C9]"
              : selected
                ? "bg-[#5C6BC0] text-white"
                : "bg-[#EEF0FB] text-[#5C6BC0]"
          }`}
        >
          {number}
        </span>
        <p
          className={`text-sm font-semibold ${
            selected ? "text-[#5C6BC0]" : "text-[#1A202C]"
          }`}
        >
          {title}
        </p>
        <p className="mt-0.5 text-xs text-[#8891A4]">{subtitle}</p>
      </button>
      {selected && children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ManualCampaignModal({
  initialRecipients,
  onClose,
  businessName,
  vertical,
}: {
  initialRecipients: ManualRecipient[];
  onClose: () => void;
  businessName?: string;
  vertical?: string;
}) {
  const router = useRouter();
  const preselected = initialRecipients.length > 0;

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

  // Selection step state (only used when no preselected recipients)
  const [mode, setMode] = useState<FilterMode | null>(
    preselected ? "manual-preselected" : null,
  );
  const [originSel, setOriginSel] = useState<Record<string, boolean>>({
    qr: false,
    whatsapp: false,
    manual: false,
  });
  const [counts, setCounts] = useState<FilterCounts | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Template library state
  const [templateFilter, setTemplateFilter] = useState<FilterId>(
    () => businessVerticalToFilter(vertical),
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [replaceConfirm, setReplaceConfirm] = useState<DisplayTemplate | null>(null);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSavingTemplate] = useState(false);

  // Custom templates from DB
  const [customTemplates, setCustomTemplates] = useState<CustomTemplate[]>([]);
  const customFetched = useRef(false);

  // Compute unified display list
  const filteredTemplates = useMemo((): DisplayTemplate[] => {
    const customDisplay: DisplayTemplate[] = customTemplates.map((ct) => ({
      id: ct.id,
      title: ct.title,
      body: ct.body,
      tag: ct.tag,
      isCustom: true,
    }));

    if (templateFilter === "custom") return customDisplay;

    const systemFiltered =
      templateFilter === "all"
        ? SYSTEM_TEMPLATES
        : SYSTEM_TEMPLATES.filter((t) => t.vertical === templateFilter);

    const systemDisplay: DisplayTemplate[] = systemFiltered.map((t) => ({
      id: t.id,
      title: t.title,
      body: t.body,
      tag: t.tag,
      isCustom: false,
    }));

    return [...customDisplay, ...systemDisplay];
  }, [templateFilter, customTemplates]);

  const currentMonthName = MONTHS_ES[new Date().getMonth()];

  // Fetch custom templates once when step 2 is reached
  useEffect(() => {
    if (step !== 2 || customFetched.current) return;
    customFetched.current = true;
    void fetch("/api/proxy/message-templates")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: CustomTemplate[]) => setCustomTemplates(data))
      .catch(() => {});
  }, [step]);

  // Load counts on first mount (skip when preselected)
  useEffect(() => {
    if (preselected) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/proxy/customers/filter-counts");
        if (!res.ok) return;
        const data = (await res.json()) as FilterCounts;
        if (!cancelled) setCounts(data);
      } catch {
        // best-effort: cards just show no counts
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [preselected]);

  // Refetch preview when the selected mode (or origin checkboxes) changes.
  useEffect(() => {
    if (preselected || mode === null || mode === "manual-preselected") return;
    let cancelled = false;
    setLoadingPreview(true);

    const body: { mode: string; origins?: string[] } = { mode };
    if (mode === "by-origin") {
      body.origins = Object.entries(originSel)
        .filter(([, on]) => on)
        .map(([k]) => k);
    }

    void (async () => {
      try {
        const res = await fetch("/api/proxy/customers/filter-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          if (!cancelled) setRecipients([]);
          return;
        }
        const data = (await res.json()) as {
          count: number;
          recipients: ManualRecipient[];
        };
        if (!cancelled) setRecipients(data.recipients);
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, originSel, preselected]);

  function removeRecipient(id: string) {
    setRecipients((prev) => prev.filter((r) => r.id !== id));
  }

  function insertVariable(variable: string) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const next = message.slice(0, start) + variable + message.slice(end);
    setMessage(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + variable.length, start + variable.length);
    });
  }

  function applyTemplate(template: DisplayTemplate) {
    if (message.trim()) {
      setReplaceConfirm(template);
      return;
    }
    setMessage(template.body);
    setSelectedTemplateId(template.id);
  }

  function confirmReplace() {
    if (!replaceConfirm) return;
    setMessage(replaceConfirm.body);
    setSelectedTemplateId(replaceConfirm.id);
    setReplaceConfirm(null);
  }

  async function handleSaveTemplate() {
    if (!saveName.trim() || !message.trim()) return;
    setSavingTemplate(true);
    try {
      const res = await fetch("/api/proxy/message-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: saveName.trim(), body: message }),
      });
      if (!res.ok) throw new Error("error");
      const saved = (await res.json()) as CustomTemplate;
      setCustomTemplates((prev) => [saved, ...prev]);
      setSaveMsg("✓ Plantilla guardada");
      setShowSaveForm(false);
      setSaveName("");
    } catch {
      setSaveMsg("No se pudo guardar, intentá de nuevo");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function handleDeleteTemplate(e: React.MouseEvent, templateId: string) {
    e.stopPropagation();
    if (!window.confirm("¿Eliminar esta plantilla?")) return;
    try {
      await fetch(`/api/proxy/message-templates/${templateId}`, {
        method: "DELETE",
      });
      setCustomTemplates((prev) => prev.filter((t) => t.id !== templateId));
      if (selectedTemplateId === templateId) setSelectedTemplateId(null);
    } catch {
      // silently ignore
    }
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

  const continueDisabled =
    step === 1 &&
    (recipients.length === 0 ||
      mode === null ||
      (mode === "by-origin" && !Object.values(originSel).some(Boolean)));

  const summaryCount = useMemo(() => recipients.length, [recipients]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1B2A]/40 p-4">
      <div className="flex w-full max-w-2xl max-h-[90vh] flex-col rounded-[16px] border border-[#E8EAF0] bg-white shadow-xl">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-[#E8EAF0] px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-[#1A202C]">Campaña manual</h2>
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
        <div className="flex flex-shrink-0 gap-1 px-6 pt-4">
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
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {/* Step 1 — Recipient selection */}
          {step === 1 && preselected && (
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

          {step === 1 && !preselected && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-[#1A202C]">
                ¿A quién querés enviarle?
              </p>

              <ModeCard
                selected={mode === "all"}
                onSelect={() => setMode("all")}
                number="1"
                title="Todos los contactos"
                subtitle={
                  counts
                    ? `Todos (${counts.total} contactos)`
                    : "Todos los contactos"
                }
              />

              <ModeCard
                selected={mode === "by-origin"}
                onSelect={() => setMode("by-origin")}
                number="2"
                title="Filtrar por origen"
                subtitle="Elegí de dónde vienen los contactos"
              >
                <div className="space-y-2">
                  {(["qr", "whatsapp", "manual"] as const).map((o) => (
                    <label
                      key={o}
                      className="flex items-center gap-2 text-sm text-[#1A202C]"
                    >
                      <input
                        type="checkbox"
                        checked={originSel[o] ?? false}
                        onChange={(e) =>
                          setOriginSel((prev) => ({
                            ...prev,
                            [o]: e.target.checked,
                          }))
                        }
                        className="h-4 w-4 rounded border-[#E8EAF0] text-[#5C6BC0] focus:ring-[#5C6BC0]"
                      />
                      <span className="capitalize">{o}</span>
                      {counts && (
                        <span className="ml-auto text-xs text-[#8891A4]">
                          {counts.byOrigin[o] ?? 0}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              </ModeCard>

              <ModeCard
                selected={mode === "birthday-month"}
                onSelect={() => setMode("birthday-month")}
                disabled={!!counts && counts.birthdayThisMonth === 0}
                number="3a"
                title="Cumpleaños este mes"
                subtitle={
                  counts
                    ? `${counts.birthdayThisMonth} contactos con cumpleaños en ${currentMonthName}`
                    : "Contactos que cumplen años este mes"
                }
              />

              <ModeCard
                selected={mode === "no-review"}
                onSelect={() => setMode("no-review")}
                number="3b"
                title="Sin reseña todavía"
                subtitle={
                  counts
                    ? `${counts.noReview} contactos recibieron mensaje pero no dejaron reseña`
                    : "Recibieron mensaje y no dejaron reseña"
                }
              />

              <ModeCard
                selected={mode === "not-attended-30d"}
                onSelect={() => setMode("not-attended-30d")}
                number="3c"
                title="No atendidos en 30 días"
                subtitle={
                  counts
                    ? `${counts.notAttended30d} contactos sin atender en los últimos 30 días`
                    : "Última atención hace más de 30 días"
                }
              />

              <ModeCard
                selected={false}
                onSelect={() => {
                  onClose();
                  router.push("/dashboard/customers?openCampaign=1");
                }}
                number="3d"
                title="Selección manual"
                subtitle="Te llevamos a Clientes para elegir uno por uno"
              />

              {/* Footer summary */}
              <div className="rounded-[8px] border border-[#E8EAF0] bg-[#F9F9FB] px-4 py-3">
                {loadingPreview ? (
                  <p className="text-sm text-[#8891A4]">Calculando...</p>
                ) : mode === null || mode === "manual-preselected" ? (
                  <p className="text-sm text-[#8891A4]">
                    Elegí una opción para ver a cuántos contactos llegará.
                  </p>
                ) : summaryCount === 0 ? (
                  <p className="text-sm font-semibold text-[#C0392B]">
                    No hay contactos que cumplan ese filtro.
                  </p>
                ) : (
                  <p className="text-sm font-semibold text-[#1A202C]">
                    Esta campaña llegará a {summaryCount}{" "}
                    {summaryCount === 1 ? "contacto" : "contactos"}.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Step 2 — Message */}
          {step === 2 && (
            <div className="space-y-4">
              {/* ── Template library ── */}
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8891A4]">
                  Plantillas
                </p>

                {/* Vertical pills */}
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {FILTER_PILLS.map((pill) => (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => setTemplateFilter(pill.id)}
                      className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                        templateFilter === pill.id
                          ? "bg-[#5C6BC0] text-white"
                          : "border border-[#E8EAF0] bg-[#F5F6FA] text-[#8891A4] hover:bg-[#EEF0FB] hover:text-[#5C6BC0]"
                      }`}
                    >
                      {pill.label}
                    </button>
                  ))}
                </div>

                {/* Cards grid */}
                {filteredTemplates.length === 0 ? (
                  <p className="rounded-[8px] border border-[#E8EAF0] bg-[#F9F9FB] px-4 py-3 text-xs text-[#8891A4]">
                    {templateFilter === "custom"
                      ? "Todavía no tenés plantillas guardadas. Escribí un mensaje y guardalo abajo."
                      : "Sin plantillas para este filtro."}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {/* Opción de mensaje personalizado sin plantilla */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setSelectedTemplateId(CUSTOM_MSG_ID);
                        requestAnimationFrame(() => textareaRef.current?.focus());
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedTemplateId(CUSTOM_MSG_ID);
                          requestAnimationFrame(() => textareaRef.current?.focus());
                        }
                      }}
                      className={`flex cursor-pointer flex-col gap-1 rounded-[10px] border p-3 text-left transition-colors ${
                        selectedTemplateId === CUSTOM_MSG_ID
                          ? "border-[#5C6BC0] bg-[#EEF0FB]"
                          : "border-[#E8EAF0] bg-white hover:border-[#5C6BC0]/40"
                      }`}
                    >
                      <p className={`text-sm font-semibold ${selectedTemplateId === CUSTOM_MSG_ID ? "text-[#5C6BC0]" : "text-[#1A202C]"}`}>
                        Personalizado
                      </p>
                      <p className="mt-0.5 text-xs text-[#8891A4]">Escribí tu propio mensaje</p>
                    </div>
                    {filteredTemplates.map((t) => (
                      <TemplateCard
                        key={t.id}
                        template={t}
                        selected={selectedTemplateId === t.id}
                        businessName={businessName ?? ""}
                        onSelect={() => applyTemplate(t)}
                        onDelete={
                          t.isCustom
                            ? (e) => void handleDeleteTemplate(e, t.id)
                            : undefined
                        }
                      />
                    ))}
                  </div>
                )}

                {/* Confirm replace banner */}
                {replaceConfirm && (
                  <div className="mt-3 flex flex-col gap-2 rounded-[8px] border border-[#FAAB4B]/50 bg-[#FFF9F0] px-3 py-2.5 sm:flex-row sm:items-center">
                    <p className="flex-1 text-xs text-[#8891A4]">
                      ¿Reemplazar el mensaje con{" "}
                      <span className="font-semibold text-[#1A202C]">
                        «{replaceConfirm.title}»
                      </span>?
                    </p>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={confirmReplace}
                        className="rounded-[6px] bg-[#5C6BC0] px-3 py-1 text-xs font-semibold text-white hover:bg-[#4f5eb0]"
                      >
                        Sí, reemplazar
                      </button>
                      <button
                        type="button"
                        onClick={() => setReplaceConfirm(null)}
                        className="rounded-[6px] border border-[#E8EAF0] px-3 py-1 text-xs font-semibold text-[#1A202C] hover:bg-[#F5F6FA]"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* Save template */}
                <div className="mt-3">
                  {!showSaveForm ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowSaveForm(true);
                        setSaveMsg(null);
                      }}
                      disabled={!message.trim()}
                      className="text-[11px] text-[#B0B8C9] hover:text-[#5C6BC0] disabled:cursor-default disabled:opacity-40"
                    >
                      + Guardar mensaje actual como plantilla
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={saveName}
                        onChange={(e) => setSaveName(e.target.value)}
                        placeholder="Nombre de la plantilla"
                        maxLength={50}
                        className="min-w-[140px] flex-1 rounded-[6px] border border-[#E8EAF0] px-2 py-1 text-xs outline-none focus:border-[#5C6BC0]"
                      />
                      <button
                        type="button"
                        onClick={() => void handleSaveTemplate()}
                        disabled={!saveName.trim() || saving}
                        className="rounded-[6px] bg-[#5C6BC0] px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        {saving ? "Guardando..." : "Guardar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setShowSaveForm(false);
                          setSaveName("");
                          setSaveMsg(null);
                        }}
                        className="text-xs text-[#8891A4] hover:text-[#C0392B]"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}
                  {saveMsg && (
                    <p className="mt-1 text-[11px] text-[#8891A4]">{saveMsg}</p>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="border-t border-[#E8EAF0]" />

              {/* Message editor + preview */}
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
                    onChange={(e) => {
                      setMessage(e.target.value);
                      setSelectedTemplateId(CUSTOM_MSG_ID);
                    }}
                    maxLength={1000}
                    rows={6}
                    placeholder="Hola {nombre}, queremos contarte algo especial en {negocio}..."
                    className="w-full resize-none rounded-[8px] border border-[#E8EAF0] bg-white px-3 py-2.5 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4] focus:border-[#5C6BC0]"
                  />
                  <p className="mt-1 text-right text-xs text-[#8891A4]">
                    {message.length}/1000
                  </p>
                </div>
                <WhatsAppPreview
                  message={message}
                  businessName={businessName ?? ""}
                />
              </div>
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
        <div className="flex flex-shrink-0 items-center justify-between border-t border-[#E8EAF0] px-6 py-4">
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
                    disabled={continueDisabled}
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
