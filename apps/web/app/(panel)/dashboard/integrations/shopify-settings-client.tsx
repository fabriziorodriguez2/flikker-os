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

// ── Logos ─────────────────────────────────────────────────────────────────────

function ShopifyLogo({ size = 36 }: { size?: number }) {
  return (
    <svg viewBox="0 0 50 56" style={{ width: size, height: size }} fill="none">
      <path d="M42.5 10.8c0 0-.2-.1-.5-.1s-7.1-.5-7.1-.5S30.3 5.6 29.8 5.1c-.5-.5-1.5-.3-1.9-.2 0 0-.7.2-1.7.5C25.3 3.2 23.5 2 21.5 2c-3.9 0-5.8 4.9-6.4 7.3-2.1.7-3.6 1.1-3.8 1.2-1.2.4-1.2.4-1.3 1.5L8 46.9 36.6 52 50 48.8 42.5 10.8z" fill="#96BF48"/>
      <path d="M34 10.2s-6.1-.4-6.4-.4c-.1 0-4.1-4.2-4.1-4.2L21 52l14.6-3.2L42.5 10.8c-.1 0-8.5-.6-8.5-.6z" fill="#5E8E3E"/>
      <path d="M25.5 19.8l-1.8 5.5s-1.6-.9-3.5-.9c-2.8 0-3 1.8-3 2.2 0 2.4 6.3 3.3 6.3 9 0 4.4-2.8 7.3-6.6 7.3-4.5 0-6.8-2.8-6.8-2.8l1.2-4s2.4 2 4.4 2c1.3 0 1.8-1 1.8-1.8 0-3.1-5.2-3.2-5.2-8.5 0-4.4 3.1-8.6 9.5-8.6 2.4 0 3.7.7 3.7.7v-.1z" fill="white"/>
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
    tagline: "Pedidos → reseñas automáticas",
    available: true,
    logo: <ShopifyLogo />,
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
  {
    id: "mercadoshops",
    name: "MercadoShops",
    tagline: "Próximamente",
    available: false,
    logo: <PlaceholderLogo label="MS" bg="#FFE600" />,
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
          <p className="text-sm text-[#8891A4]">Pedidos → reseñas automáticas por WhatsApp</p>
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

// ── Main ──────────────────────────────────────────────────────────────────────

export default function IntegrationsClient() {
  const [selected, setSelected] = useState<string | null>(null);
  const [shopifyIntegration, setShopifyIntegration] = useState<ShopifyIntegration | null>(null);
  const [shopifyOrders, setShopifyOrders] = useState<ShopifyOrder[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [intRes, ordRes] = await Promise.all([
        fetch("/api/proxy/integrations/shopify"),
        fetch("/api/proxy/integrations/shopify/orders"),
      ]);
      if (intRes.ok) {
        const data = (await intRes.json()) as { integration: ShopifyIntegration | null };
        setShopifyIntegration(data.integration);
      }
      if (ordRes.ok) {
        const data = (await ordRes.json()) as { orders: ShopifyOrder[] };
        setShopifyOrders(data.orders);
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

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <PageHeader
        title="Integraciones"
        subtitle="Conectá tus plataformas de e-commerce para automatizar el pedido de reseñas."
      />

      {loading ? (
        <p className="mt-8 text-sm text-[#8891A4]">Cargando…</p>
      ) : (
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {INTEGRATIONS.map((item) => {
            const isConnected = item.id === "shopify" && shopifyIntegration?.isActive;
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
