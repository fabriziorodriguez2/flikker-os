"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/ui/page-header";
import { useCanMutate } from "../../role-context";

interface ShopifyIntegration {
  id: string;
  shopDomain: string;
  delayHours: number;
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

export default function ShopifySettingsClient() {
  const canMutate = useCanMutate();

  const [integration, setIntegration] = useState<ShopifyIntegration | null>(null);
  const [orders, setOrders] = useState<ShopifyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [shopDomain, setShopDomain] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [delayHours, setDelayHours] = useState(24);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [intRes, ordRes] = await Promise.all([
        fetch("/api/proxy/integrations/shopify"),
        fetch("/api/proxy/integrations/shopify/orders"),
      ]);
      if (intRes.ok) {
        const data = (await intRes.json()) as { integration: ShopifyIntegration | null };
        setIntegration(data.integration);
        if (data.integration) {
          setShopDomain(data.integration.shopDomain);
          setDelayHours(data.integration.delayHours);
          setWebhookSecret("");
        }
      }
      if (ordRes.ok) {
        const data = (await ordRes.json()) as { orders: ShopifyOrder[] };
        setOrders(data.orders);
      }
    } catch {
      setError("Error al cargar la integración");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canMutate) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/proxy/integrations/shopify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopDomain, webhookSecret, delayHours }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { message?: string };
        setError(err.message ?? "Error al guardar");
        return;
      }
      setMessage("Integración guardada correctamente");
      setWebhookSecret("");
      await fetchData();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    if (!canMutate || !integration) return;
    if (!confirm("¿Desconectar la integración de Shopify? Los pedidos futuros no enviarán reseñas.")) return;
    setDisconnecting(true);
    setError(null);
    try {
      const res = await fetch("/api/proxy/integrations/shopify", { method: "DELETE" });
      if (!res.ok) {
        setError("Error al desconectar");
        return;
      }
      setMessage("Integración desactivada");
      await fetchData();
    } catch {
      setError("Error de conexión");
    } finally {
      setDisconnecting(false);
    }
  }

  const webhookUrl = `${typeof window !== "undefined" ? window.location.origin.replace(/:\d+$/, ":3000") : "https://api.flikker.com"}/integrations/shopify/webhooks/orders`;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <PageHeader title="Integraciones" subtitle="Conectá tu tienda Shopify para pedir reseñas automáticamente después de cada compra." />

      {/* Shopify card */}
      <div className="rounded-2xl border border-[#E8EAF0] bg-white">
        <div className="flex items-center gap-3 border-b border-[#E8EAF0] px-6 py-4">
          <svg viewBox="0 0 109.5 124.5" className="h-7 w-7 shrink-0" fill="none">
            <path d="M74.7 14.8s-.3 0-.8.1c-.4-1.2-1-2.3-1.8-3.2-2.6-2.8-6.3-4.2-10.2-4.2-.3 0-.6 0-.9.0-1.3-1.7-3-3-5-3.7C54.6 3.3 53.1 3 51.5 3c-4.1 0-8 1.9-10.7 5.1-1.9 2.3-3.3 5.3-3.8 8.5-3.5.7-5.9 1.9-6.3 2.1L5.9 25.6l-3.6 98.9h78.1l-5.7-109.7zM61.6 11.4c.7.9 1.2 2 1.4 3.3l-6.8 1.4c.5-3.8 2.5-5.6 5.4-4.7zM51.5 5c1.2 0 2.3.2 3.3.7 2.1.9 3.5 2.7 4.3 4.9-3.8 1.1-6.4 4-7.1 8.6l-9.5 2c.6-2.8 1.8-5.3 3.5-7.2C47.9 11.4 48.3 5 51.5 5zm5 24.5c-.2 3.4-3.2 6-6.7 5.8-3.5-.2-6.2-3.1-6-6.5.2-3.4 3.2-6 6.7-5.8 3.5.2 6.2 3.1 6 6.5z" fill="#96BF48"/>
            <path d="M62.8 14.9c-.2-1.3-.7-2.4-1.4-3.3-2.9-.9-4.9.9-5.4 4.7l6.8-1.4z" fill="#5E8E3E"/>
          </svg>
          <div>
            <p className="text-[15px] font-semibold text-[#1A202C]">Shopify</p>
            <p className="text-xs text-[#8891A4]">Pedidos → reseñas automáticas por WhatsApp</p>
          </div>
          {integration?.isActive && (
            <span className="ml-auto rounded-full bg-green-100 px-3 py-0.5 text-xs font-semibold text-green-700">
              Conectado
            </span>
          )}
        </div>

        <div className="space-y-6 p-6">
          {loading ? (
            <p className="text-sm text-[#8891A4]">Cargando…</p>
          ) : (
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
                  disabled={!canMutate}
                  className="w-full rounded-xl border border-[#E8EAF0] px-3.5 py-2.5 text-sm text-[#1A202C] placeholder:text-[#B0B8C9] focus:border-[#5C6BC0] focus:outline-none disabled:bg-[#F7F8FA]"
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
                  placeholder={integration ? "••••••• (dejar vacío para no cambiar)" : "Secreto de Shopify"}
                  disabled={!canMutate}
                  className="w-full rounded-xl border border-[#E8EAF0] px-3.5 py-2.5 text-sm text-[#1A202C] placeholder:text-[#B0B8C9] focus:border-[#5C6BC0] focus:outline-none disabled:bg-[#F7F8FA]"
                />
                <p className="mt-1 text-xs text-[#8891A4]">
                  Lo encontrás en Shopify → Configuración → Notificaciones → Webhooks
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-[#1A202C]">
                  Demora antes de enviar (horas)
                </label>
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={delayHours}
                  onChange={(e) => setDelayHours(Number(e.target.value))}
                  disabled={!canMutate}
                  className="w-32 rounded-xl border border-[#E8EAF0] px-3.5 py-2.5 text-sm text-[#1A202C] focus:border-[#5C6BC0] focus:outline-none disabled:bg-[#F7F8FA]"
                />
                <p className="mt-1 text-xs text-[#8891A4]">
                  Cuántas horas después de la compra se envía el mensaje de reseña
                </p>
              </div>

              <div className="rounded-xl bg-[#F7F8FA] p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#8891A4]">URL del webhook</p>
                <p className="break-all font-mono text-xs text-[#1A202C]">{webhookUrl}</p>
                <p className="mt-1.5 text-xs text-[#8891A4]">
                  Configurá este webhook en Shopify para el evento <strong>orders/paid</strong>.
                </p>
              </div>

              {message && (
                <p className="rounded-xl bg-green-50 px-4 py-2.5 text-sm text-green-700">{message}</p>
              )}
              {error && (
                <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>
              )}

              <div className="flex items-center gap-3">
                {canMutate && (
                  <button
                    type="submit"
                    disabled={saving || !shopDomain || (!integration && !webhookSecret)}
                    className="rounded-xl bg-[#5C6BC0] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#4a58a8] disabled:opacity-50"
                  >
                    {saving ? "Guardando…" : integration ? "Actualizar" : "Conectar"}
                  </button>
                )}
                {integration?.isActive && canMutate && (
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
          )}
        </div>
      </div>

      {/* Recent orders */}
      {orders.length > 0 && (
        <div className="rounded-2xl border border-[#E8EAF0] bg-white">
          <div className="border-b border-[#E8EAF0] px-6 py-4">
            <p className="text-[15px] font-semibold text-[#1A202C]">Pedidos recientes</p>
            <p className="text-xs text-[#8891A4]">Últimos 20 pedidos procesados vía webhook</p>
          </div>
          <div className="divide-y divide-[#F3F4F8]">
            {orders.map((order) => (
              <div key={order.id} className="flex items-center gap-4 px-6 py-3.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-[#1A202C]">{order.customerName ?? "—"}</p>
                  <p className="text-xs text-[#8891A4]">
                    Pedido #{order.shopifyOrderId} · {order.customerPhone ?? "sin tel."} · {formatDate(order.createdAt)}
                  </p>
                  {order.skipReason && (
                    <p className="text-xs text-[#B0B8C9]">{SKIP_REASONS[order.skipReason] ?? order.skipReason}</p>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-600"}`}>
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
