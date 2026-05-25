"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";
import PageHeader from "@/components/ui/page-header";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShopifyIntegration {
  id: string;
  shopDomain: string;
  isActive: boolean;
  updatedAt: string;
}

interface ShopifyOrder {
  id: string;
  shopifyOrderId: string;
  customerName: string | null;
  customerPhone: string | null;
  status: "pending" | "scheduled" | "skipped" | "failed";
  scheduledAt: string | null;
  skipReason: string | null;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Programado",
  skipped: "Omitido",
  failed: "Fallido",
  pending: "Pendiente",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-green-100 text-green-700",
  skipped: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
  pending: "bg-gray-100 text-gray-600",
};

const SKIP_REASONS: Record<string, string> = {
  no_phone: "Sin teléfono",
  invalid_phone: "Teléfono inválido",
  opted_out: "Dado de baja",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Google Calendar types ─────────────────────────────────────────────────────

interface GoogleCalendarIntegration {
  id: string;
  status: "pending_calendars" | "active" | "error" | "revoked";
  selectedCalendarIds: string[];
  ignoredTitleWords: string[];
  autoSendEnabled: boolean;
  sendDelayHours: number;
  lastSyncAt: string | null;
}

interface GoogleCalendarEntry {
  id: string;
  summary: string;
  primary: boolean;
}

interface CalendarEvent {
  id: string;
  title: string;
  startAt: string;
  endAt: string | null;
  customerName: string | null;
  customerPhone: string | null;
  status: "pending" | "send_check_queued" | "sent" | "skipped";
  skipReason: string | null;
  processedAt: string | null;
  createdAt: string;
}

const CALENDAR_STATUS_LABELS: Record<string, string> = {
  active: "Activo",
  pending_calendars: "Pendiente de configuración",
  error: "Error",
  revoked: "Desconectado",
};

const EVENT_STATUS_LABELS: Record<string, string> = {
  pending: "Pendiente",
  send_check_queued: "Programado",
  sent: "Enviado",
  skipped: "Omitido",
};

const EVENT_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  send_check_queued: "bg-blue-100 text-blue-700",
  sent: "bg-green-100 text-green-700",
  skipped: "bg-yellow-100 text-yellow-700",
};

function formatEventDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-UY", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Logos ─────────────────────────────────────────────────────────────────────

function ShopifyLogo({ size = 36 }: { size?: number }) {
  return (
    <img
      src="/icons8-shopify.svg"
      alt="Shopify"
      width={size}
      height={size}
      style={{ width: size, height: size }}
    />
  );
}

function GoogleCalendarLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="8" fill="#fff"/>
      <rect x="6" y="6" width="36" height="36" rx="4" fill="#4285F4"/>
      <rect x="6" y="6" width="36" height="10" rx="4" fill="#1A73E8"/>
      <rect x="6" y="12" width="36" height="4" fill="#1A73E8"/>
      <rect x="14" y="22" width="6" height="6" rx="1" fill="#fff"/>
      <rect x="21" y="22" width="6" height="6" rx="1" fill="#fff"/>
      <rect x="28" y="22" width="6" height="6" rx="1" fill="#fff"/>
      <rect x="14" y="30" width="6" height="6" rx="1" fill="#fff"/>
      <rect x="21" y="30" width="6" height="6" rx="1" fill="#fff"/>
      <rect x="28" y="30" width="6" height="6" rx="1" fill="#FBBC04"/>
    </svg>
  );
}

function PlaceholderLogo({ label, bg }: { label: string; bg: string }) {
  return (
    <div
      className="flex h-9 w-9 items-center justify-center rounded-lg text-[9px] font-bold leading-tight text-white"
      style={{ background: bg }}
    >
      {label}
    </div>
  );
}

// ── Integration definitions ───────────────────────────────────────────────────

interface IntegrationDef {
  id: string;
  name: string;
  tagline: string;
  available: boolean;
  logo: React.ReactNode;
}

const INTEGRATIONS: IntegrationDef[] = [
  {
    id: "shopify",
    name: "Shopify",
    tagline: "Pedís reseñas cuando llega una orden",
    available: true,
    logo: <ShopifyLogo />,
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    tagline: "Pedís reseñas después de cada cita",
    available: true,
    logo: <GoogleCalendarLogo />,
  },
  {
    id: "woocommerce",
    name: "WooCommerce",
    tagline: "Próximamente",
    available: false,
    logo: <PlaceholderLogo label="Woo" bg="#7F54B3" />,
  },
  {
    id: "tiendanube",
    name: "Tienda Nube",
    tagline: "Próximamente",
    available: false,
    logo: <PlaceholderLogo label="TN" bg="#00A0E4" />,
  },
];

// ── Shopify config panel ──────────────────────────────────────────────────────

function ShopifyConfigPanel({
  shopifyData,
  orders,
  onBack,
  onSaved,
}: {
  shopifyData: ShopifyIntegration | null;
  orders: ShopifyOrder[];
  onBack: () => void;
  onSaved: () => void;
}) {
  const [shopDomain, setShopDomain] = useState(shopifyData?.shopDomain ?? "");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const webhookUrl = "https://flikker.site/integrations/shopify/webhooks/orders";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!shopifyData && !webhookSecret) {
      setError("El secreto del webhook es obligatorio la primera vez");
      return;
    }
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const body: Record<string, unknown> = { shopDomain };
      if (webhookSecret) body.webhookSecret = webhookSecret;
      const res = await fetch("/api/proxy/integrations/shopify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        setError(err.message ?? "Error al guardar");
        return;
      }
      setMessage("Integración guardada correctamente");
      setWebhookSecret("");
      onSaved();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!shopifyData) return;
    if (!confirm("¿Desconectar Shopify? Los pedidos futuros no generarán reseñas.")) return;
    setDisconnecting(true);
    try {
      await fetch("/api/proxy/integrations/shopify", { method: "DELETE" });
      onSaved();
      onBack();
    } catch {
      setError("Error de conexión");
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-[#8891A4] transition-colors hover:text-[#1A202C]"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a integraciones
      </button>

      <div className="flex items-center gap-3">
        <ShopifyLogo size={40} />
        <div>
          <p className="text-lg font-semibold text-[#1A202C]">Shopify</p>
          <p className="text-sm text-[#8891A4]">Pedís reseñas por WhatsApp cuando llega una orden</p>
        </div>
        {shopifyData?.isActive && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-0.5 text-xs font-semibold text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Conectado
          </span>
        )}
      </div>

      <div className="rounded-2xl border border-[#E8EAF0] bg-white p-6">
        <form onSubmit={(e) => void handleSave(e)} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1A202C]">
              Dominio de la tienda
            </label>
            <input
              type="text"
              value={shopDomain}
              onChange={(e) => setShopDomain(e.target.value)}
              placeholder="mitienda.myshopify.com"
              className="w-full rounded-xl border border-[#E8EAF0] px-3.5 py-2.5 text-sm text-[#1A202C] placeholder:text-[#B0B8C9] focus:border-[#5C6BC0] focus:outline-none"
            />
            <p className="mt-1 text-xs text-[#8891A4]">Sin el prefijo https://</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-[#1A202C]">
              Secreto del webhook
            </label>
            <input
              type="password"
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
              placeholder={shopifyData ? "••••••• (dejar vacío para no cambiar)" : "Pegá el secreto de Shopify"}
              className="w-full rounded-xl border border-[#E8EAF0] px-3.5 py-2.5 text-sm text-[#1A202C] placeholder:text-[#B0B8C9] focus:border-[#5C6BC0] focus:outline-none"
            />
            <p className="mt-1 text-xs text-[#8891A4]">
              Shopify → Configuración → Notificaciones → Webhooks
            </p>
          </div>

          <div className="rounded-xl bg-[#F7F8FA] p-4">
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-[#8891A4]">
                URL del webhook
              </p>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(webhookUrl)}
                className="text-xs text-[#5C6BC0] hover:underline"
              >
                Copiar
              </button>
            </div>
            <p className="break-all font-mono text-xs text-[#1A202C]">{webhookUrl}</p>
            <p className="mt-2 text-xs text-[#8891A4]">
              Evento: <strong>orders/paid</strong>
              <a
                href="https://help.shopify.com/en/manual/fulfillment/managing-orders/notifications/webhooks"
                target="_blank"
                rel="noreferrer"
                className="ml-2 inline-flex items-center gap-0.5 text-[#5C6BC0] hover:underline"
              >
                Ver guía <ExternalLink className="h-3 w-3" />
              </a>
            </p>
          </div>

          {message && (
            <p className="rounded-xl bg-green-50 px-4 py-2.5 text-sm text-green-700">{message}</p>
          )}
          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving || !shopDomain}
              className="rounded-xl bg-[#5C6BC0] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4a58a8] disabled:opacity-50"
            >
              {saving ? "Guardando…" : shopifyData ? "Actualizar" : "Conectar"}
            </button>
            {shopifyData?.isActive && (
              <button
                type="button"
                onClick={() => void handleDisconnect()}
                disabled={disconnecting}
                className="rounded-xl border border-red-200 px-5 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                {disconnecting ? "Desconectando…" : "Desconectar"}
              </button>
            )}
          </div>
        </form>
      </div>

      {orders.length > 0 && (
        <div className="rounded-2xl border border-[#E8EAF0] bg-white">
          <div className="border-b border-[#E8EAF0] px-6 py-4">
            <p className="text-[15px] font-semibold text-[#1A202C]">Pedidos recientes</p>
            <p className="text-xs text-[#8891A4]">Últimos 20 procesados vía webhook</p>
          </div>
          <div className="divide-y divide-[#F3F4F8]">
            {orders.map((order) => (
              <div key={order.id} className="flex items-center gap-4 px-6 py-3.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[#1A202C]">{order.customerName ?? "—"}</p>
                  <p className="text-xs text-[#8891A4]">
                    #{order.shopifyOrderId} · {order.customerPhone ?? "sin tel."} · {formatDate(order.createdAt)}
                  </p>
                  {order.skipReason && (
                    <p className="text-xs text-[#B0B8C9]">{SKIP_REASONS[order.skipReason] ?? order.skipReason}</p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-600"}`}
                >
                  {STATUS_LABELS[order.status] ?? order.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Google Calendar config panel ──────────────────────────────────────────────

function GoogleCalendarConfigPanel({
  integration,
  onBack,
  onRefresh,
}: {
  integration: GoogleCalendarIntegration | null;
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [calendars, setCalendars] = useState<GoogleCalendarEntry[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(
    integration?.selectedCalendarIds ?? [],
  );
  const [ignoredWords, setIgnoredWords] = useState(
    (integration?.ignoredTitleWords ?? []).join(", "),
  );
  const [autoSend, setAutoSend] = useState(
    integration?.autoSendEnabled ?? false,
  );
  const [delayHours, setDelayHours] = useState(
    integration?.sendDelayHours ?? 2,
  );
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isConnected =
    integration && integration.status !== "revoked" && integration.status !== "error";

  useEffect(() => {
    if (!isConnected) return;
    void loadCalendars();
    void loadEvents();
  }, [isConnected]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadCalendars() {
    setLoadingCalendars(true);
    try {
      const res = await fetch("/api/proxy/integrations/google-calendar/calendars");
      if (res.ok) {
        const data = (await res.json()) as { calendars: GoogleCalendarEntry[] };
        setCalendars(data.calendars);
      }
    } finally {
      setLoadingCalendars(false);
    }
  }

  async function loadEvents() {
    const res = await fetch("/api/proxy/integrations/google-calendar/events?limit=20");
    if (res.ok) {
      const data = (await res.json()) as { events: CalendarEvent[] };
      setEvents(data.events);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/proxy/integrations/google-calendar/connect");
      if (!res.ok) throw new Error("Error al obtener URL de autorización");
      const data = (await res.json()) as { authUrl: string };
      window.location.href = data.authUrl;
    } catch {
      setError("No se pudo iniciar la conexión con Google");
      setConnecting(false);
    }
  }

  async function handleSaveCalendars() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/proxy/integrations/google-calendar/calendars", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarIds: selectedIds }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      setMessage("Calendarios guardados");
      onRefresh();
    } catch {
      setError("Error al guardar calendarios");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveConfig() {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const words = ignoredWords
        .split(",")
        .map((w) => w.trim())
        .filter(Boolean);
      const res = await fetch("/api/proxy/integrations/google-calendar/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ignoredTitleWords: words,
          autoSendEnabled: autoSend,
          sendDelayHours: delayHours,
        }),
      });
      if (!res.ok) throw new Error("Error al guardar");
      setMessage("Configuración guardada");
      onRefresh();
    } catch {
      setError("Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("¿Desconectar Google Calendar? Los calendarios seleccionados se perderán.")) return;
    try {
      await fetch("/api/proxy/integrations/google-calendar", { method: "DELETE" });
      onRefresh();
      onBack();
    } catch {
      setError("Error al desconectar");
    }
  }

  function toggleCalendar(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-sm text-[#8891A4] transition-colors hover:text-[#1A202C]"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a integraciones
      </button>

      <div className="flex items-center gap-3">
        <GoogleCalendarLogo size={40} />
        <div>
          <p className="text-lg font-semibold text-[#1A202C]">Google Calendar</p>
          <p className="text-sm text-[#8891A4]">
            Pedís reseñas por WhatsApp después de cada cita
          </p>
        </div>
        {isConnected && (
          <span className="ml-auto flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-0.5 text-xs font-semibold text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {CALENDAR_STATUS_LABELS[integration.status] ?? integration.status}
          </span>
        )}
      </div>

      {message && (
        <p className="rounded-xl bg-green-50 px-4 py-2.5 text-sm text-green-700">{message}</p>
      )}
      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
      )}

      {!isConnected ? (
        <div className="rounded-2xl border border-[#E8EAF0] bg-white p-6 text-center">
          <p className="mb-4 text-sm text-[#8891A4]">
            Conectá tu Google Calendar para detectar automáticamente las citas y
            pedir reseñas a tus clientes.
          </p>
          <button
            type="button"
            onClick={() => void handleConnect()}
            disabled={connecting}
            className="rounded-xl bg-[#5C6BC0] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#4a58a8] disabled:opacity-50"
          >
            {connecting ? "Redirigiendo…" : "Conectar con Google"}
          </button>
        </div>
      ) : (
        <>
          {/* Calendar selection */}
          <div className="rounded-2xl border border-[#E8EAF0] bg-white p-6">
            <p className="mb-1 text-[15px] font-semibold text-[#1A202C]">
              Calendarios a sincronizar
            </p>
            <p className="mb-4 text-xs text-[#8891A4]">
              Solo se detectarán citas de los calendarios seleccionados.
            </p>
            {loadingCalendars ? (
              <p className="text-sm text-[#8891A4]">Cargando calendarios…</p>
            ) : calendars.length === 0 ? (
              <p className="text-sm text-[#8891A4]">No se encontraron calendarios.</p>
            ) : (
              <div className="space-y-2">
                {calendars.map((cal) => (
                  <label
                    key={cal.id}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#E8EAF0] px-4 py-3 hover:border-[#5C6BC0]"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(cal.id)}
                      onChange={() => toggleCalendar(cal.id)}
                      className="h-4 w-4 rounded accent-[#5C6BC0]"
                    />
                    <span className="flex-1 text-sm text-[#1A202C]">
                      {cal.summary}
                      {cal.primary && (
                        <span className="ml-2 text-xs text-[#8891A4]">(principal)</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => void handleSaveCalendars()}
              disabled={saving}
              className="mt-4 rounded-xl bg-[#5C6BC0] px-5 py-2 text-sm font-semibold text-white hover:bg-[#4a58a8] disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar calendarios"}
            </button>
          </div>

          {/* Config */}
          <div className="rounded-2xl border border-[#E8EAF0] bg-white p-6 space-y-5">
            <p className="text-[15px] font-semibold text-[#1A202C]">Configuración</p>

            <div>
              <label className="mb-1.5 block text-sm font-medium text-[#1A202C]">
                Palabras a ignorar en el título de la cita
              </label>
              <input
                type="text"
                value={ignoredWords}
                onChange={(e) => setIgnoredWords(e.target.value)}
                placeholder="Ej: bloqueo, libre, vacaciones"
                className="w-full rounded-xl border border-[#E8EAF0] px-3.5 py-2.5 text-sm text-[#1A202C] placeholder:text-[#B0B8C9] focus:border-[#5C6BC0] focus:outline-none"
              />
              <p className="mt-1 text-xs text-[#8891A4]">Separadas por coma. Si el título contiene alguna, se omite la cita.</p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#1A202C]">Envío automático</p>
                <p className="text-xs text-[#8891A4]">
                  Envía la solicitud de reseña automáticamente al terminar cada cita
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAutoSend((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  autoSend ? "bg-[#5C6BC0]" : "bg-[#E8EAF0]"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                    autoSend ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {autoSend && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#1A202C]">
                  Horas después de la cita para enviar
                </label>
                <input
                  type="number"
                  min={0}
                  max={48}
                  value={delayHours}
                  onChange={(e) => setDelayHours(Number(e.target.value))}
                  className="w-24 rounded-xl border border-[#E8EAF0] px-3 py-2 text-sm text-[#1A202C] focus:border-[#5C6BC0] focus:outline-none"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleSaveConfig()}
              disabled={saving}
              className="rounded-xl bg-[#5C6BC0] px-5 py-2 text-sm font-semibold text-white hover:bg-[#4a58a8] disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar configuración"}
            </button>
          </div>

          {/* Recent events */}
          {events.length > 0 && (
            <div className="rounded-2xl border border-[#E8EAF0] bg-white">
              <div className="border-b border-[#E8EAF0] px-6 py-4">
                <p className="text-[15px] font-semibold text-[#1A202C]">Citas recientes</p>
                <p className="text-xs text-[#8891A4]">Últimas 20 detectadas por sincronización</p>
              </div>
              <div className="divide-y divide-[#F3F4F8]">
                {events.map((ev) => (
                  <div key={ev.id} className="flex items-center gap-4 px-6 py-3.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[#1A202C] truncate">{ev.title}</p>
                      <p className="text-xs text-[#8891A4]">
                        {formatEventDate(ev.startAt)}
                        {ev.customerName && ` · ${ev.customerName}`}
                        {ev.customerPhone && ` · ${ev.customerPhone}`}
                      </p>
                      {ev.skipReason && (
                        <p className="text-xs text-[#B0B8C9]">{ev.skipReason.replace(/_/g, " ")}</p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        EVENT_STATUS_COLORS[ev.status] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {EVENT_STATUS_LABELS[ev.status] ?? ev.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Disconnect */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleDisconnect()}
              className="rounded-xl border border-red-200 px-5 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
            >
              Desconectar Google Calendar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function IntegrationsClient() {
  const [selected, setSelected] = useState<string | null>(null);
  const [shopifyIntegration, setShopifyIntegration] = useState<ShopifyIntegration | null>(null);
  const [shopifyOrders, setShopifyOrders] = useState<ShopifyOrder[]>([]);
  const [calendarIntegration, setCalendarIntegration] = useState<GoogleCalendarIntegration | null>(null);
  const [loading, setLoading] = useState(true);
  const [calendarBanner, setCalendarBanner] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cal = params.get("calendar");
    if (cal === "connected") {
      setCalendarBanner("Google Calendar conectado. Ahora seleccioná los calendarios a sincronizar.");
      setSelected("google-calendar");
    } else if (cal === "error" || cal === "invalid_state") {
      setCalendarBanner("No se pudo conectar con Google Calendar. Intentá de nuevo.");
    }
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [intRes, ordRes, calRes] = await Promise.all([
        fetch("/api/proxy/integrations/shopify"),
        fetch("/api/proxy/integrations/shopify/orders"),
        fetch("/api/proxy/integrations/google-calendar"),
      ]);
      if (intRes.ok) {
        const data = (await intRes.json()) as { integration: ShopifyIntegration | null };
        setShopifyIntegration(data.integration);
      }
      if (ordRes.ok) {
        const data = (await ordRes.json()) as { orders: ShopifyOrder[] };
        setShopifyOrders(data.orders);
      }
      if (calRes.ok) {
        const data = (await calRes.json()) as { integration: GoogleCalendarIntegration | null };
        setCalendarIntegration(data.integration);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  if (selected === "shopify") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <ShopifyConfigPanel
          shopifyData={shopifyIntegration}
          orders={shopifyOrders}
          onBack={() => setSelected(null)}
          onSaved={() => void fetchData()}
        />
      </div>
    );
  }

  if (selected === "google-calendar") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        {calendarBanner && (
          <div className={`mb-4 rounded-xl px-4 py-3 text-sm ${
            calendarBanner.includes("conectado")
              ? "bg-green-50 text-green-700"
              : "bg-red-50 text-red-600"
          }`}>
            {calendarBanner}
          </div>
        )}
        <GoogleCalendarConfigPanel
          integration={calendarIntegration}
          onBack={() => { setSelected(null); setCalendarBanner(null); }}
          onRefresh={() => void fetchData()}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader
        title="Integraciones"
        subtitle="Conectá tus herramientas para automatizar el pedido de reseñas."
      />

      {loading ? (
        <p className="mt-8 text-sm text-[#8891A4]">Cargando…</p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {INTEGRATIONS.map((item) => {
            const isConnected =
              (item.id === "shopify" && shopifyIntegration?.isActive) ||
              (item.id === "google-calendar" &&
                calendarIntegration?.status === "active");
            return (
              <button
                key={item.id}
                type="button"
                disabled={!item.available}
                onClick={() => item.available && setSelected(item.id)}
                className={`relative flex flex-col items-center gap-3 rounded-2xl border p-6 text-center transition-all ${
                  item.available
                    ? "cursor-pointer border-[#E8EAF0] bg-white hover:border-[#5C6BC0] hover:shadow-sm"
                    : "cursor-not-allowed border-[#F0F1F5] bg-[#FAFAFA] opacity-60"
                }`}
              >
                {isConnected && (
                  <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-green-500" />
                )}
                {item.logo}
                <div>
                  <p className="text-sm font-semibold text-[#1A202C]">{item.name}</p>
                  <p className="text-xs text-[#8891A4]">{item.tagline}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
