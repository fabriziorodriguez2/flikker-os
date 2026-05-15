"use client";

import { useState } from "react";
import CopyBlock from "@/components/ui/copy-block";
import PhoneInput, {
  isValidNationalPhone,
  toNationalDigits,
} from "@/components/ui/phone-input";

// ── Types ─────────────────────────────────────────────────────────────────

interface Campaign {
  id: string;
  name: string;
  slug: string;
  status: string;
  channel: string;
  templateKind: string | null;
  messageBody: string | null;
  offerText: string | null;
  destinationType: string;
  destinationUrl: string | null;
  description: string | null;
  _count: { executions: number };
}

interface Widget {
  id: string;
  mode: string;
  status: string;
  minStars: number;
  maxReviewsShown: number;
  primaryColor: string | null;
  position: string | null;
  enabled: boolean;
}

interface Business {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  reviewLandingUrl: string;
  googleBusinessProfileUrl: string | null;
  whatsappUrl: string | null;
  status: string;
  messageQuotaMonthly: number;
  messageCountCurrentMonth: number;
}

interface TestLabClientProps {
  business: Business;
  campaigns: Campaign[];
  reviewCount: number;
  activeCampaigns: number;
  widget: Widget | null;
}

interface RenderResult {
  campaignName: string;
  raw: string;
  rendered: string;
  variables: { customerName: string; clinicName: string; offerText: string };
}

interface SendResult {
  success: boolean;
  isTest?: boolean;
  whatsappMessageId: string;
  phone: string;
  message: string;
  campaignName: string;
  sentAt: string;
  note: string;
}

interface ReviewRequestTestResult {
  ok: boolean;
  messageId: string;
  customerId: string;
  trackingUrl: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "activa", cls: "bg-[#EEF7E8] text-[#639922]" },
  PAUSED: { label: "pausada", cls: "bg-[#FFF4E5] text-[#9d5d0e]" },
  DRAFT: { label: "borrador", cls: "bg-[#F1F4F9] text-[#8891A4]" },
  COMPLETED: { label: "completada", cls: "bg-[#EEF0FB] text-[#5C6BC0]" },
  ARCHIVED: { label: "archivada", cls: "bg-[#F1F4F9] text-[#8891A4]" },
};

const TEMPLATE_LABELS: Record<string, string> = {
  post_service: "Post-servicio",
  reactivation: "Reactivación",
  birthday: "Cumpleaños",
};

function Badge({
  label,
  cls,
}: {
  label: string;
  cls: string;
}) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
      {label}
    </span>
  );
}

// ── Campaign tester ───────────────────────────────────────────────────────

function CampaignTester({
  campaign,
  businessName,
}: {
  campaign: Campaign;
  businessName: string;
}) {
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState("María García");
  const [clinicName, setClinicName] = useState(businessName);
  const [offerText, setOfferText] = useState(campaign.offerText ?? "");
  const [phone, setPhone] = useState("");
  const [renderResult, setRenderResult] = useState<RenderResult | null>(null);
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState<"render" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const statusUi = STATUS_LABELS[campaign.status] ?? {
    label: campaign.status.toLowerCase(),
    cls: "bg-[#F1F4F9] text-[#8891A4]",
  };

  const doRender = async () => {
    setError(null);
    setSendResult(null);
    setLoading("render");
    try {
      const res = await fetch(
        `/api/proxy/test-lab/campaigns/${campaign.id}/render`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerName, clinicName, offerText }),
        },
      );
      const data = (await res.json()) as RenderResult | { message: string };
      if (!res.ok)
        throw new Error(
          (data as { message: string }).message ?? "Error al renderizar",
        );
      setRenderResult(data as RenderResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(null);
    }
  };

  const doSend = async () => {
    if (!phone.trim()) {
      setError("Ingresá un número de WhatsApp.");
      return;
    }
    setError(null);
    setLoading("send");
    setConfirming(false);
    try {
      const res = await fetch(
        `/api/proxy/test-lab/campaigns/${campaign.id}/send`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, customerName, clinicName, offerText }),
        },
      );
      const data = (await res.json()) as SendResult | { message: string };
      if (!res.ok)
        throw new Error(
          (data as { message: string }).message ?? "Error al enviar",
        );
      setSendResult(data as SendResult);
      setRenderResult(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(null);
    }
  };

  if (!campaign.messageBody) return null;

  return (
    <div className="rounded-[12px] border border-[#E8EAF0] bg-white">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setRenderResult(null);
          setSendResult(null);
          setError(null);
          setConfirming(false);
        }}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-[#1A202C]">
              {campaign.name}
            </span>
            <Badge label={statusUi.label} cls={statusUi.cls} />
            {campaign.templateKind ? (
              <Badge
                label={TEMPLATE_LABELS[campaign.templateKind] ?? campaign.templateKind}
                cls="bg-[#EEF0FB] text-[#5C6BC0]"
              />
            ) : null}
          </div>
          {campaign.description ? (
            <span className="text-xs text-[#8891A4]">{campaign.description}</span>
          ) : null}
        </div>
        <span className="shrink-0 text-[#8891A4]">{open ? "▲" : "▼"}</span>
      </button>

      {open ? (
        <div className="border-t border-[#E8EAF0] px-5 pb-5 pt-4">
          {/* Variables */}
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
            Variables de prueba
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[#475467]">
                {"{nombre}"} — nombre del paciente
              </span>
              <input
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="h-10 rounded-[8px] border border-[#E8EAF0] px-3 text-sm outline-none focus:border-[#5C6BC0]"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-[#475467]">
                {"{clinica}"} — nombre del negocio
              </span>
              <input
                value={clinicName}
                onChange={(e) => setClinicName(e.target.value)}
                className="h-10 rounded-[8px] border border-[#E8EAF0] px-3 text-sm outline-none focus:border-[#5C6BC0]"
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs font-medium text-[#475467]">
                {"{oferta}"} — oferta o mensaje extra (opcional)
              </span>
              <input
                value={offerText}
                onChange={(e) => setOfferText(e.target.value)}
                placeholder="Ej: ¡Tenemos un descuento especial para vos!"
                className="h-10 rounded-[8px] border border-[#E8EAF0] px-3 text-sm outline-none focus:border-[#5C6BC0]"
              />
            </label>
          </div>

          {/* Template raw */}
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
              Plantilla original
            </p>
            <div className="rounded-[8px] bg-[#F5F6FA] px-4 py-3 font-mono text-sm text-[#1A202C]">
              {campaign.messageBody}
            </div>
          </div>

          {/* Actions */}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={doRender}
              disabled={loading !== null}
              className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA] disabled:opacity-50"
            >
              {loading === "render" ? "Renderizando…" : "Simular mensaje"}
            </button>
          </div>

          {/* Render result */}
          {renderResult ? (
            <div className="mt-4 rounded-[10px] border border-[#E8EAF0] bg-[#F9FAFB] p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
                Mensaje renderizado
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[#1A202C]">
                {renderResult.rendered}
              </p>

              {/* Send section */}
              <div className="mt-4 border-t border-[#E8EAF0] pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
                  Enviar por WhatsApp real
                </p>
                <div className="flex gap-2">
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+598 99 000 000"
                    className="h-10 flex-1 rounded-[8px] border border-[#E8EAF0] px-3 text-sm outline-none focus:border-[#C0392B]"
                  />
                  {!confirming ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (!phone.trim()) {
                          setError("Ingresá un número.");
                          return;
                        }
                        setError(null);
                        setConfirming(true);
                      }}
                      disabled={loading !== null}
                      className="inline-flex h-10 items-center rounded-[8px] border border-[#C0392B] px-4 text-sm font-semibold text-[#C0392B] hover:bg-[#FBEDEC] disabled:opacity-50"
                    >
                      Enviar WhatsApp real
                    </button>
                  ) : null}
                </div>

                {confirming ? (
                  <div className="mt-3 rounded-[8px] border border-[#C0392B] bg-[#FBEDEC] p-3 text-sm">
                    <p className="font-semibold text-[#C0392B]">
                      Confirmación requerida
                    </p>
                    <p className="mt-1 text-[#C0392B]">
                      Esto enviará un WhatsApp real a{" "}
                      <strong>{phone}</strong>. El mensaje saldrá por Whapi y
                      no quedará registrado en el historial.
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={doSend}
                        disabled={loading !== null}
                        className="inline-flex h-9 items-center rounded-[8px] bg-[#C0392B] px-4 text-sm font-semibold text-white hover:bg-[#a93226] disabled:opacity-50"
                      >
                        {loading === "send" ? "Enviando…" : "Sí, enviar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(false)}
                        className="inline-flex h-9 items-center rounded-[8px] border border-[#E8EAF0] px-4 text-sm font-semibold text-[#1A202C] hover:bg-white"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Send result */}
          {sendResult ? (
            <div className="mt-4 rounded-[10px] border border-[#639922] bg-[#EEF7E8] p-4">
              <p className="text-sm font-semibold text-[#639922]">
                ✓ WhatsApp enviado
              </p>
              <p className="mt-1 text-xs text-[#475467]">
                Para: {sendResult.phone} · ID Whapi:{" "}
                {sendResult.whatsappMessageId}
              </p>
              <p className="mt-2 whitespace-pre-wrap rounded-[6px] bg-white px-3 py-2 text-sm text-[#1A202C]">
                {sendResult.message}
              </p>
              <p className="mt-2 text-xs text-[#8891A4]">{sendResult.note}</p>
            </div>
          ) : null}

          {error ? (
            <p className="mt-3 text-sm text-[#C0392B]">{error}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ReviewRequestTester({ business }: { business: Business }) {
  const [name, setName] = useState("María García");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReviewRequestTestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isDemo = business.slug === "clinica-demo-flikker";

  async function sendReviewRequestTest() {
    setError(null);
    setResult(null);

    if (!name.trim()) {
      setError("Ingresá el nombre de prueba.");
      return;
    }

    if (!isValidNationalPhone(toNationalDigits(phone))) {
      setError("Formato inválido — ingresá entre 7 y 9 dígitos.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/proxy/platform/businesses/${business.id}/onboarding/test-message`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone, name }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as
        | ReviewRequestTestResult
        | { message?: string };
      if (!res.ok) {
        throw new Error(
          (data as { message?: string }).message ??
            "No se pudo enviar el mensaje de prueba",
        );
      }
      setResult(data as ReviewRequestTestResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-[#1A202C]">
              Mensaje de prueba
            </h2>
            <Badge
              label={isDemo ? "modo demo" : "admin"}
              cls={
                isDemo
                  ? "bg-[#EEF0FB] text-[#5C6BC0]"
                  : "bg-[#FFF4E5] text-[#9d5d0e]"
              }
            />
          </div>
          <p className="mt-1 text-sm text-[#8891A4]">
            Enviá el pedido de reseña como lo recibiría un paciente. Usa el
            flujo real del onboarding y genera una landing con tracking.
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[#475467]">
            Nombre de prueba
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ej: María García"
            className="h-11 w-full rounded-[8px] border border-[#E8EAF0] bg-white px-3 text-sm text-[#1A202C] outline-none placeholder:text-[#8891A4] focus:border-[#5C6BC0]"
          />
        </label>

        <PhoneInput
          label="Teléfono"
          value={phone}
          onChange={setPhone}
          placeholder="091 624 988"
          disabled={loading}
        />

        <button
          type="button"
          onClick={() => void sendReviewRequestTest()}
          disabled={loading}
          className="inline-flex h-11 items-center justify-center rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#4e5db0] disabled:opacity-60"
        >
          {loading ? "Enviando..." : "Enviar prueba"}
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-[10px] border border-[#C0392B]/20 bg-[#C0392B]/10 px-4 py-3 text-sm text-[#C0392B]">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-4 rounded-[10px] border border-[#639922]/20 bg-[#EEF7E8] px-4 py-3 text-sm text-[#1A202C]">
          <p className="font-semibold text-[#639922]">
            Mensaje de prueba enviado.
          </p>
          <p className="mt-1 text-[#475467]">
            Link generado:{" "}
            <a
              href={result.trackingUrl}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[#5C6BC0] underline-offset-2 hover:underline"
            >
              {result.trackingUrl}
            </a>
          </p>
        </div>
      ) : null}
    </section>
  );
}

// ── Widget section ────────────────────────────────────────────────────────

function WidgetSection({
  widget,
  businessId,
}: {
  widget: Widget | null;
  businessId: string;
}) {
  const snippet = widget
    ? `<div
  data-flikker-widget
  data-business="${businessId}"
  data-mode="${widget.mode}"${widget.mode === "toast" ? `\n  data-position="${widget.position ?? "bottom_right"}"` : ""}
  data-color="${widget.primaryColor ?? "#5C6BC0"}"
></div>
<script async src="https://app.flikker.com/widget.js"></script>`
    : null;

  if (!widget) {
    return (
      <div className="rounded-[12px] border border-[#E8EAF0] bg-white p-5 text-center text-sm text-[#8891A4]">
        No hay widget configurado para este negocio.
      </div>
    );
  }

  const modeLabels: Record<string, string> = {
    toast: "Toast (flotante)",
    carousel: "Carrusel",
    grid: "Grid",
  };

  const statusCls =
    widget.enabled && widget.status === "ACTIVE"
      ? "bg-[#EEF7E8] text-[#639922]"
      : "bg-[#F1F4F9] text-[#8891A4]";
  const statusLabel =
    widget.enabled && widget.status === "ACTIVE" ? "activo" : "inactivo";

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Modo" value={modeLabels[widget.mode] ?? widget.mode} />
        <Stat label="Estrellas mín." value={`${widget.minStars}★`} />
        <Stat label="Máx. reseñas" value={String(widget.maxReviewsShown)} />
        <Stat
          label="Estado"
          value={<Badge label={statusLabel} cls={statusCls} />}
        />
      </div>
      {snippet ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
            Snippet actual
          </p>
          <CopyBlock code={snippet} />
        </div>
      ) : null}
    </div>
  );
}

// ── Small stat tile ───────────────────────────────────────────────────────

function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-[10px] border border-[#E8EAF0] bg-[#F9FAFB] px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
        {label}
      </p>
      <div className="mt-1.5 text-sm font-semibold text-[#1A202C]">{value}</div>
    </div>
  );
}

// ── Landing section ───────────────────────────────────────────────────────

function LandingSection({ business }: { business: Business }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(business.reviewLandingUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Negocio" value={business.name} />
        <Stat label="Slug" value={business.slug} />
        <Stat
          label="URL generada"
          value={
            <span className="truncate font-mono text-xs">
              {business.reviewLandingUrl}
            </span>
          }
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA]"
        >
          {copied ? "✓ Copiado" : "Copiar link"}
        </button>
        <a
          href={business.reviewLandingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#111827] px-4 text-sm font-semibold text-white hover:bg-[#1f2937]"
        >
          Abrir landing ↗
        </a>
      </div>

      <p className="text-xs text-[#8891A4]">
        Esta URL usa el slug real del negocio. Sin tracking token, no se
        registra el clic como conversión.
      </p>
    </div>
  );
}

// ── Root component ────────────────────────────────────────────────────────

export default function TestLabClient({
  business,
  campaigns,
  reviewCount,
  activeCampaigns,
  widget,
}: TestLabClientProps) {
  const campaignsWithBody = campaigns.filter((c) => c.messageBody);
  const campaignsWithoutBody = campaigns.filter((c) => !c.messageBody);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-[24px] font-bold text-[#1A202C]">
            Panel de pruebas
          </h1>
          {business.slug === "clinica-demo-flikker" ? (
            <span className="rounded-full bg-[#EEF0FB] px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[#5C6BC0]">
              Modo demo
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 text-sm text-[#8891A4]">
          Probá campañas, mensajes, landing y widget antes de mostrárselo a un
          cliente.
        </p>
      </div>

      {/* A. Negocio activo */}
      <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5 md:p-6">
        <h2 className="text-base font-bold text-[#1A202C]">Negocio activo</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Nombre" value={business.name} />
          <Stat label="ID" value={<span className="font-mono text-xs">{business.id.slice(0, 12)}…</span>} />
          <Stat label="Reseñas Google" value={reviewCount} />
          <Stat label="Campañas activas" value={activeCampaigns} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Stat
            label="Mensajes este mes"
            value={`${business.messageCountCurrentMonth} / ${business.messageQuotaMonthly}`}
          />
          <Stat
            label="Estado"
            value={
              <Badge
                label={business.status.toLowerCase()}
                cls={
                  business.status === "ACTIVE"
                    ? "bg-[#EEF7E8] text-[#639922]"
                    : "bg-[#F1F4F9] text-[#8891A4]"
                }
              />
            }
          />
        </div>
      </section>

      {/* B. Campañas */}
      <ReviewRequestTester business={business} />

      <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-[#1A202C]">
            Probar campañas
          </h2>
          <span className="text-sm text-[#8891A4]">
            {campaigns.length} campaña{campaigns.length !== 1 ? "s" : ""}
          </span>
        </div>
        <p className="mt-1 text-sm text-[#8891A4]">
          Simulá el mensaje final con variables de prueba o enviá un WhatsApp
          real con confirmación.
        </p>

        {campaignsWithBody.length === 0 && campaignsWithoutBody.length === 0 ? (
          <div className="mt-4 py-8 text-center text-sm text-[#8891A4]">
            No hay campañas creadas todavía.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {campaignsWithBody.map((c) => (
              <CampaignTester
                key={c.id}
                campaign={c}
                businessName={business.name}
              />
            ))}
            {campaignsWithoutBody.length > 0 ? (
              <div className="rounded-[12px] border border-dashed border-[#E8EAF0] px-5 py-4 text-sm text-[#8891A4]">
                {campaignsWithoutBody.length} campaña
                {campaignsWithoutBody.length !== 1 ? "s" : ""} sin mensaje
                configurado (
                {campaignsWithoutBody.map((c) => c.name).join(", ")})
              </div>
            ) : null}
          </div>
        )}
      </section>

      {/* C. Landing de reseña */}
      <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5 md:p-6">
        <h2 className="text-base font-bold text-[#1A202C]">
          Probar landing de reseña
        </h2>
        <p className="mt-1 mb-4 text-sm text-[#8891A4]">
          Generá y abrí la landing pública del negocio para ver el branding y
          el flujo de feedback.
        </p>
        <LandingSection business={business} />
      </section>

      {/* D. Widget */}
      <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5 md:p-6">
        <h2 className="text-base font-bold text-[#1A202C]">Probar widget</h2>
        <p className="mt-1 mb-4 text-sm text-[#8891A4]">
          Configuración actual del widget y snippet listo para copiar.
        </p>
        <WidgetSection widget={widget} businessId={business.id} />
      </section>

      {/* Note about test sends */}
      <p className="pb-4 text-center text-xs text-[#8891A4]">
        Los envíos reales de WhatsApp desde este panel salen por Whapi pero no
        quedan en el historial ni afectan las métricas de campaña.
      </p>
    </div>
  );
}
