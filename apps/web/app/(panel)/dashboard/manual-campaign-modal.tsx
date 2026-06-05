"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";

export interface ManualRecipient {
  id: string;
  name: string;
  phoneE164: string;
}

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
        <p className="text-xs font-semibold text-[#8891A4]">{number}</p>
        <p
          className={`mt-1 text-sm font-semibold ${
            selected ? "text-[#5C6BC0]" : "text-[#1A202C]"
          }`}
        >
          {title}
        </p>
        <p className="mt-1 text-xs text-[#8891A4]">{subtitle}</p>
      </button>
      {selected && children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

export default function ManualCampaignModal({
  initialRecipients,
  onClose,
}: {
  initialRecipients: ManualRecipient[];
  onClose: () => void;
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

  const currentMonthName = MONTHS_ES[new Date().getMonth()];

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
          if (!cancelled) {
            setRecipients([]);
          }
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

  const continueDisabled =
    step === 1 &&
    (recipients.length === 0 ||
      mode === null ||
      (mode === "by-origin" &&
        !Object.values(originSel).some(Boolean)));

  const summaryCount = useMemo(() => recipients.length, [recipients]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0D1B2A]/40 p-4">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-[16px] border border-[#E8EAF0] bg-white shadow-xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#E8EAF0] bg-white px-6 py-4">
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
                number="①"
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
                number="②"
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
                number="③a"
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
                number="③b"
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
                number="③c"
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
                number="③d"
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
        <div className="sticky bottom-0 flex items-center justify-between border-t border-[#E8EAF0] bg-white px-6 py-4">
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
