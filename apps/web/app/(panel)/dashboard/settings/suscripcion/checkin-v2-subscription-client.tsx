"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, MessageCircle } from "lucide-react";
import { supportWhatsAppHref } from "@/src/config/support";
import { useIsOwnerOrAdmin } from "../../../role-context";

const MERCADOPAGO_CHECKOUT_URL = "https://mpago.la/1Acxajh";

export interface SubscriptionOverview {
  planSlug: string;
  planName: string;
  status: string | null;
  isPro: boolean;
  maxCustomers: number | null;
  currency: string;
  priceAmount: number;
  participantsCount: number;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  trialActive: boolean;
  trialDaysRemaining: number | null;
  benefitsBlocked: boolean;
  selfServicePro: { currency: string; priceAmount: number };
}

export function resolveTrialState(
  overview: Pick<SubscriptionOverview, "isPro" | "trialActive" | "benefitsBlocked">,
) {
  if (overview.isPro) return "pro" as const;
  if (overview.trialActive) return "active" as const;
  if (overview.benefitsBlocked) return "expired" as const;
  return "none" as const;
}

async function readJson(response: Response) {
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String((data as { message: unknown }).message)
        : "No pudimos cargar tu suscripción.";
    throw new Error(message);
  }
  return data;
}

function formatPrice(currency: string, amount: number) {
  return `${currency} ${new Intl.NumberFormat("es-UY").format(amount)}`;
}

function Feature({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <li className={`flex items-start gap-2.5 text-sm ${dark ? "text-white/82" : "text-[#5C6478]"}`}>
      <Check
        className={`mt-0.5 h-4 w-4 shrink-0 ${dark ? "text-[#A69CF7]" : "text-[#5C6BC0]"}`}
        strokeWidth={2.2}
        aria-hidden="true"
      />
      <span>{children}</span>
    </li>
  );
}

function CurrentBadge({ dark = false }: { dark?: boolean }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] ${
      dark ? "bg-white text-[#0D1B2A]" : "bg-[#1A202C] text-white"
    }`}>
      Plan actual
    </span>
  );
}

export default function CheckinV2SubscriptionClient() {
  const canManage = useIsOwnerOrAdmin();
  const [overview, setOverview] = useState<SubscriptionOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch("/api/proxy/businesses/current/subscription");
      setOverview((await readJson(response)) as SubscriptionOverview);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No pudimos cargar tu suscripción.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex min-h-[340px] items-center justify-center text-sm text-[#8891A4]">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando…
      </div>
    );
  }

  if (error || !overview) {
    return (
      <div className="rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
        {error ?? "No pudimos cargar tu suscripción."}
      </div>
    );
  }

  const trialState = resolveTrialState(overview);

  const upgradeLink = canManage && !overview.isPro ? (
    <a
      href={MERCADOPAGO_CHECKOUT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flk-glossy inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4F5EB0]"
    >
      Upgrade <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  ) : null;

  return (
    <div className="space-y-7">
      {trialState === "active" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#DDE1EC] bg-white px-4 py-3.5 shadow-[0_2px_8px_rgba(17,22,59,0.025)]">
          <div>
            <p className="text-sm font-bold text-[#1A202C]">
              Te quedan {overview.trialDaysRemaining ?? 0} días de prueba Pro
            </p>
            <p className="mt-0.5 text-xs text-[#8891A4]">
              Durante la prueba podés usar Beneficios sin las restricciones del plan Free.
            </p>
          </div>
          {upgradeLink}
        </div>
      ) : null}

      {trialState === "expired" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#F1D1A9] bg-[#FFF8EF] px-4 py-3.5">
          <div>
            <p className="text-sm font-bold text-[#1A202C]">Tu prueba Pro terminó</p>
            <p className="mt-0.5 text-xs text-[#8A6738]">
              Tus beneficios y clientes siguen guardados. Pasá a Pro para volver a crear beneficios.
            </p>
          </div>
          {upgradeLink}
        </div>
      ) : null}

      {!canManage ? (
        <p className="rounded-[14px] bg-[#F5F6FA] px-4 py-3 text-sm text-[#7F879C]">
          Estás viendo los planes en modo lectura. Solo un dueño o administrador puede suscribirse.
        </p>
      ) : null}

      <div className="grid items-stretch gap-5 lg:grid-cols-3">
        <article className="flex min-h-[410px] flex-col rounded-[18px] border border-[#DDE1EC] bg-white p-6 sm:p-7">
          <div className="flex min-h-7 items-start justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#6F7688]">Free</p>
            {!overview.isPro ? <CurrentBadge /> : null}
          </div>
          <p className="mt-3 text-[34px] font-bold leading-none tracking-[-0.035em] text-[#1A202C]">
            UYU 0
          </p>
          <p className="mt-3 text-sm text-[#7F879C]">Para empezar a fidelizar</p>
          <ul className="mt-7 space-y-4">
            <Feature>Hasta 50 clientes participantes</Feature>
            <Feature>Tarjeta de sellos</Feature>
            <Feature>QR/NFC y check-in</Feature>
            <Feature>Funciones básicas</Feature>
          </ul>
          <div className="mt-auto pt-8">
            <p className="text-xs leading-5 text-[#A0A8B8]">
              Sin costo mensual.
            </p>
          </div>
        </article>

        <article className="relative flex min-h-[430px] flex-col rounded-[18px] border border-[#17213A] bg-[#0D1B2A] p-6 text-white shadow-[0_18px_34px_rgba(13,27,42,0.18)] sm:p-7 lg:-my-2">
          <div className="flex min-h-7 items-start justify-between gap-3">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-white/60">Pro</p>
            {overview.isPro ? (
              <CurrentBadge dark />
            ) : (
              <span className="inline-flex rounded-full bg-[#7C6CE8] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
                Recomendado
              </span>
            )}
          </div>
          <div className="mt-3 flex items-end gap-1.5">
            <p className="text-[34px] font-bold leading-none tracking-[-0.035em]">
              {formatPrice(
                overview.selfServicePro.currency,
                overview.selfServicePro.priceAmount,
              )}
            </p>
            <span className="pb-0.5 text-sm text-white/65">/ mes</span>
          </div>
          <p className="mt-3 text-sm text-white/58">Para negocios en crecimiento</p>
          <ul className="mt-7 space-y-4">
            <Feature dark>Clientes participantes sin límite</Feature>
            <Feature dark>Beneficios sin límite de prueba</Feature>
            <Feature dark>Tarjeta de sellos</Feature>
            <Feature dark>QR/NFC y check-in</Feature>
          </ul>
          <div className="mt-auto pt-8">
            {!overview.isPro && canManage ? (
              <a
                href={MERCADOPAGO_CHECKOUT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flk-glossy flex h-11 w-full items-center justify-center gap-2 rounded-[11px] bg-white px-4 text-sm font-bold text-[#0D1B2A] hover:bg-[#EEF0FB]"
              >
                Suscribirme <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            ) : overview.isPro ? (
              <p className="rounded-[11px] border border-white/15 bg-white/8 px-4 py-3 text-center text-sm font-semibold text-white">
                Este es tu plan actual
              </p>
            ) : null}
            {!overview.isPro ? (
              <p className="mt-3 text-center text-[11px] leading-4 text-white/45">
                El pago se confirma por separado; abrir el checkout no activa el plan.
              </p>
            ) : null}
          </div>
        </article>

        <article className="flex min-h-[410px] flex-col rounded-[18px] border border-[#DDE1EC] bg-white p-6 sm:p-7">
          <div className="min-h-7">
            <p className="text-xs font-bold uppercase tracking-[0.1em] text-[#6F7688]">Enterprise</p>
          </div>
          <p className="mt-3 text-[34px] font-bold leading-none tracking-[-0.035em] text-[#1A202C]">
            A medida
          </p>
          <p className="mt-3 text-sm text-[#7F879C]">Para necesidades especiales</p>
          <p className="mt-7 text-sm leading-6 text-[#5C6478]">
            Pensado para negocios con múltiples operaciones, equipos grandes o requerimientos que exceden el alcance de Pro.
          </p>
          <div className="mt-auto pt-8">
            {canManage ? (
              <a
                href={supportWhatsAppHref("Hola, quiero consultar por un plan Enterprise de Flikker.")}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-11 w-full items-center justify-center gap-2 rounded-[11px] border border-[#DDE1EC] bg-white px-4 text-sm font-semibold text-[#1A202C] hover:bg-[#F8F9FC]"
              >
                <MessageCircle className="h-4 w-4 text-[#1D9E75]" aria-hidden="true" />
                Consultar por WhatsApp
              </a>
            ) : null}
          </div>
        </article>
      </div>
    </div>
  );
}
