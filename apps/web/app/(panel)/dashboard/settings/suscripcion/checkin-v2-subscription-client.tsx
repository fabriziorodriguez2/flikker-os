"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChartNoAxesColumnIncreasing,
  ExternalLink,
  Gift,
  Globe2,
  Layers3,
  MessageCircle,
  QrCode,
  Send,
  Stamp,
  UserRoundSearch,
} from "lucide-react";
import RouteProgressBar from "@/components/ui/route-progress-bar";
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

function Feature({
  icon: Icon,
  title,
  description,
  dark = false,
  green = false,
}: {
  icon: typeof QrCode;
  title: string;
  description: string;
  dark?: boolean;
  green?: boolean;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] ${
          green
            ? "bg-[#EAF9F0] text-[#27AE60]"
            : dark
              ? "bg-white/10 text-[#A69CF7]"
              : "bg-[#F2F0FF] text-[#7C6CE8]"
        }`}
      >
        <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="min-w-0 pt-0.5">
        <span className={`block text-sm font-semibold ${dark ? "text-white" : "text-[#1A202C]"}`}>
          {title}
        </span>
        <span className={`mt-0.5 block text-[11px] leading-4 ${dark ? "text-white/48" : "text-[#A0A8B8]"}`}>
          {description}
        </span>
      </span>
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
    return <RouteProgressBar />;
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

      <div className="mx-auto grid max-w-[940px] items-stretch gap-5 md:grid-cols-2">
        <article className="flex min-h-[590px] flex-col rounded-[18px] border border-[#DDE1EC] bg-white p-6 sm:p-7">
          <div className="flex min-h-7 items-start justify-between gap-3">
            <span className="inline-flex rounded-full bg-[#F5F6FA] px-2.5 py-1 text-[10px] font-semibold text-[#7F879C]">
              Base
            </span>
            {!overview.isPro ? <CurrentBadge /> : null}
          </div>
          <h2 className="mt-3 text-lg font-bold text-[#1A202C]">Flikker Base</h2>
          <span className="mt-3 w-fit rounded-full bg-[#FFF1C9] px-2.5 py-1 text-[10px] font-semibold text-[#C66A00]">
            Para hacer que vuelvan
          </span>
          <p className="mt-3 text-[34px] font-bold leading-none tracking-[-0.035em] text-[#1A202C]">
            UYU 0
          </p>
          <p className="mt-3 text-xs leading-5 text-[#7F879C]">
            Para convertir cada visita en un motivo concreto para regresar.
          </p>
          <div className="my-5 border-t border-[#EEF0F5]" />
          <ul className="space-y-4">
            <Feature icon={QrCode} title="Check-in por QR o NFC" description="Cada visita queda registrada en segundos" />
            <Feature icon={Stamp} title="Sellos y recompensas" description="Progreso claro para dar un motivo para volver" />
            <Feature icon={Gift} title="Canje por QR" description="Validación simple desde el local" />
            <Feature icon={Send} title="Feedback post-visita" description="Escuchá al cliente después de su experiencia" />
            <Feature icon={ChartNoAxesColumnIncreasing} title="Métricas de recurrencia" description="Visitas y clientes que efectivamente regresan" />
            <Feature icon={UserRoundSearch} title="Hasta 50 clientes participantes" description="El límite real incluido en el plan Free" />
          </ul>
          <div className="mt-auto pt-8">
            <p className="text-xs font-medium text-[#7C6CE8]">Base = hacer que vuelvan.</p>
          </div>
        </article>

        <article className="relative flex min-h-[590px] flex-col rounded-[18px] border border-[#17213A] bg-[#0D1B2A] p-6 text-white shadow-[0_18px_34px_rgba(13,27,42,0.18)] sm:p-7 md:-my-2">
          <div className="flex min-h-7 items-start justify-between gap-3">
            <span className="inline-flex rounded-full bg-[#26284B] px-2.5 py-1 text-[10px] font-semibold text-[#B7AEFF]">
              Pro
            </span>
            {overview.isPro ? (
              <CurrentBadge dark />
            ) : (
              <span className="inline-flex rounded-full bg-[#7C6CE8] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
                Recomendado
              </span>
            )}
          </div>
          <h2 className="mt-3 text-lg font-bold text-white">Flikker Pro</h2>
          <span className="mt-3 w-fit rounded-full bg-[#FFF1C9] px-2.5 py-1 text-[10px] font-semibold text-[#C66A00]">
            Para recuperarlos también
          </span>
          <div className="mt-3 flex items-end gap-1.5">
            <p className="text-[34px] font-bold leading-none tracking-[-0.035em]">
              {formatPrice(
                overview.selfServicePro.currency,
                overview.selfServicePro.priceAmount,
              )}
            </p>
            <span className="pb-0.5 text-sm text-white/65">/ mes</span>
          </div>
          <p className="mt-3 text-xs leading-5 text-white/55">
            Para hacer que vuelvan y recuperar también a quienes cortan el hábito.
          </p>
          <div className="my-5 border-t border-white/10" />
          <ul className="space-y-4">
            <Feature dark green icon={Layers3} title="Todo lo del Plan Base" description="Check-in, sellos, canjes, feedback y métricas" />
            <Feature dark green icon={UserRoundSearch} title="Reactivación automática" description="Flikker detecta a quienes dejaron de venir" />
            <Feature dark green icon={Send} title="Incentivos de recuperación" description="Un motivo concreto para retomar el hábito" />
            <Feature dark icon={Globe2} title="Reseñas de Google" description="Como complemento del feedback post-visita" />
            <Feature dark green icon={MessageCircle} title="600 mensajes de WhatsApp incluidos" description="La cuota mensual real del plan Pro" />
          </ul>
          <div className="mt-auto pt-8">
            <p className="mb-5 text-xs font-medium text-[#A69CF7]">
              Pro = recuperar también a los que dejan de venir.
            </p>
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
      </div>
    </div>
  );
}
