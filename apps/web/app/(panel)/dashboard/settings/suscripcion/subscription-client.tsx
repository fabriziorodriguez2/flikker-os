"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, ExternalLink } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import MetricCard from "@/components/ui/metric-card";
import SettingsFormSection from "@/components/settings/settings-form-section";
import { useIsOwnerOrAdmin } from "../../../role-context";

/**
 * Link real de checkout de Mercado Pago (pedido explícito). A propósito NO
 * hay ningún fetch al backend en el click de "Suscribirme": sin webhook de
 * Mercado Pago integrado todavía, un click no es prueba de pago. La
 * Subscription solo pasa a Pro cuando un admin de plataforma confirma el
 * cobro a mano desde el dashboard de Mercado Pago — ver
 * `PlatformService#confirmProSubscription`.
 */
const MERCADOPAGO_CHECKOUT_URL = "https://mpago.la/1Acxajh";

interface SubscriptionOverview {
  planSlug: string;
  planName: string;
  status: string | null;
  isPro: boolean;
  maxCustomers: number | null;
  /** Precio de la Subscription ACTUAL de este negocio (puede ser $0, o la de un Pro histórico). */
  currency: string;
  priceAmount: number;
  participantsCount: number;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialActive: boolean;
  trialDaysRemaining: number | null;
  benefitsBlocked: boolean;
  /** Precio ANUNCIADO para upgrade — siempre UYU 1.000/mes, sin importar el plan actual. */
  selfServicePro: { currency: string; priceAmount: number };
}

/** "UYU 1.000" — nunca un número fabricado, siempre lo que devuelve el backend. */
function formatPrice(currency: string, amount: number): string {
  return `${currency} ${new Intl.NumberFormat("es-UY").format(amount)}`;
}

async function readJson(res: Response) {
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String((data as { message: unknown }).message)
        : "Error inesperado";
    throw new Error(message);
  }
  return data;
}

function PlanFeature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm text-[color:var(--text-muted)]">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--success-text)]" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

function CurrentPlanBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-[color:rgba(29,158,117,0.12)] px-3 py-1 text-xs font-semibold text-[color:var(--success-text)]">
      Tu plan actual
    </span>
  );
}

export default function SubscriptionClient() {
  const canManage = useIsOwnerOrAdmin();
  const [overview, setOverview] = useState<SubscriptionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/proxy/businesses/current/subscription");
      const data = (await readJson(res)) as SubscriptionOverview;
      setOverview(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cargar tu plan.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-[color:var(--text-muted)]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando…
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[color:var(--danger-text)]">
        {error ?? "No pudimos cargar tu plan."}
      </div>
    );
  }

  const atCustomerLimit =
    !overview.isPro &&
    overview.maxCustomers != null &&
    overview.participantsCount >= overview.maxCustomers;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Configuración"
        title="Suscripción"
        subtitle="Tu plan, límites y cómo pasar a Pro."
      />

      {/* ── Estado actual ─────────────────────────────────────────────── */}
      <section className="grid gap-4 lg:grid-cols-4">
        <MetricCard
          label="Plan actual"
          value={overview.isPro ? "Pro" : "Free"}
          tone={overview.isPro ? "accent" : "default"}
          hint={
            overview.priceAmount > 0
              ? `${formatPrice(overview.currency, overview.priceAmount)} / mes`
              : "Gratis"
          }
        />
        <MetricCard
          label="Clientes participando"
          value={overview.participantsCount}
          tone={atCustomerLimit ? "warm" : "default"}
          hint={
            overview.maxCustomers != null
              ? `De ${overview.maxCustomers} en tu plan`
              : "Sin tope (Pro)"
          }
        />
        <MetricCard
          label="Beneficios"
          value={
            overview.isPro
              ? "Sin límite"
              : overview.trialActive
                ? `Trial: ${overview.trialDaysRemaining}d`
                : overview.benefitsBlocked
                  ? "Trial vencido"
                  : "Sin trial iniciado"
          }
          tone={overview.benefitsBlocked ? "warm" : "default"}
          hint={
            overview.isPro
              ? "Acceso Pro permanente"
              : overview.trialActive
                ? "Prueba de 30 días en curso"
                : overview.benefitsBlocked
                  ? "Bloqueado crear beneficios nuevos"
                  : "Arranca al activar el catálogo"
          }
        />
        <MetricCard
          label="Estado"
          value={overview.status ?? "—"}
          hint="Estado de tu Subscription"
        />
      </section>

      {atCustomerLimit ? (
        <div className="rounded-[16px] border border-[color:rgba(250,171,75,0.35)] bg-[color:rgba(250,171,75,0.08)] px-4 py-3 text-sm text-[color:var(--foreground)]">
          <span className="font-semibold">
            Llegaste al límite de {overview.maxCustomers} clientes participantes.
          </span>{" "}
          Los que ya participan siguen sumando sellos normalmente — pasá a
          Pro para que entren clientes nuevos sin tope.
        </div>
      ) : null}

      {overview.benefitsBlocked ? (
        <div className="rounded-[16px] border border-[color:rgba(250,171,75,0.35)] bg-[color:rgba(250,171,75,0.08)] px-4 py-3 text-sm text-[color:var(--foreground)]">
          <span className="font-semibold">Tu prueba de 30 días de Beneficios terminó.</span>{" "}
          Tus beneficios, clientes e historial siguen intactos — pasá a Pro
          para volver a crear beneficios nuevos.
        </div>
      ) : null}

      {!canManage ? (
        <p className="rounded-[16px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-3 text-sm text-[color:var(--text-muted)]">
          Estás viendo esta información en modo lectura. Para cambiar de
          plan, pedile a un dueño o administrador del negocio.
        </p>
      ) : null}

      {/* ── Planes ────────────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <SettingsFormSection eyebrow="Gratis" title="Free">
          <ul className="space-y-3">
            <PlanFeature>Hasta 50 clientes participantes</PlanFeature>
            <PlanFeature>Tarjeta de sellos</PlanFeature>
            <PlanFeature>QR / check-in</PlanFeature>
            <PlanFeature>Funciones básicas de Programa</PlanFeature>
          </ul>
          <div className="mt-6">
            {!overview.isPro ? (
              <CurrentPlanBadge />
            ) : (
              <p className="text-xs text-[color:var(--text-soft)]">
                Ya superaste este plan.
              </p>
            )}
          </div>
        </SettingsFormSection>

        <SettingsFormSection
          eyebrow={`${formatPrice(
            overview.selfServicePro.currency,
            overview.selfServicePro.priceAmount,
          )} / mes`}
          title="Pro"
        >
          <ul className="space-y-3">
            <PlanFeature>Beneficios sin límite de trial</PlanFeature>
            <PlanFeature>Clientes participantes sin tope</PlanFeature>
            <PlanFeature>Sucursales, equipo y campañas ampliados</PlanFeature>
            <PlanFeature>Automatizaciones y promociones (próximamente)</PlanFeature>
          </ul>
          <div className="mt-6">
            {overview.isPro ? (
              <CurrentPlanBadge />
            ) : canManage ? (
              <a
                href={MERCADOPAGO_CHECKOUT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-[16px] bg-[color:var(--brand-primary)] px-5 py-3 text-sm font-semibold text-white shadow-[0_14px_30px_rgba(0,4,65,0.18)] transition-colors hover:bg-[color:var(--brand-accent)]"
              >
                Suscribirme <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            ) : null}
            <p className="mt-3 text-xs leading-5 text-[color:var(--text-soft)]">
              Abre el checkout de Mercado Pago en una pestaña nueva. Tu plan
              se activa cuando el equipo de Flikker confirma el pago — el
              click por sí solo no lo activa.
            </p>
          </div>
        </SettingsFormSection>

        <SettingsFormSection eyebrow="A medida" title="Enterprise">
          <ul className="space-y-3">
            <PlanFeature>Múltiples sucursales y equipos grandes</PlanFeature>
            <PlanFeature>Volumen de mensajes a medida</PlanFeature>
            <PlanFeature>Acompañamiento dedicado</PlanFeature>
          </ul>
          <div className="mt-6">
            <p className="text-sm text-[color:var(--text-muted)]">
              Escribinos si tu negocio necesita algo por fuera de Pro.
            </p>
          </div>
        </SettingsFormSection>
      </div>
    </div>
  );
}
