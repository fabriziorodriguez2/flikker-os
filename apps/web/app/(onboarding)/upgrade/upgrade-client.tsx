"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import {
  formatPrice,
  YEARLY_MONTHS_CHARGED,
  YEARLY_MONTHS_FREE,
  YEARLY_MONTHS_GRANTED,
  yearlyPriceFrom,
} from "@/lib/checkout-urls";
import { usePreOnboardingCheckout } from "@/lib/use-pre-onboarding-checkout";
import { useNotificationWhatsApp } from "@/lib/use-notification-whatsapp";
import PhoneInput, { toNationalDigits } from "@/components/ui/phone-input";
import type { CheckoutPlan } from "@/lib/pro-checkout";
import type { PendingUpgradePlan } from "@/lib/pending-upgrade-plan";

const MONTHLY_PRICE = { currency: "UYU", amount: 1000 };

export default function UpgradeClient({
  pendingPlan,
  initialNotificationWhatsapp,
}: {
  pendingPlan: PendingUpgradePlan;
  initialNotificationWhatsapp: string | null;
}) {
  const router = useRouter();
  const { pendingPlan: checkoutPending, error, startCheckout } =
    usePreOnboardingCheckout();
  const whatsapp = useNotificationWhatsApp(
    toNationalDigits(initialNotificationWhatsapp ?? ""),
  );
  const [savingPhoneForPlan, setSavingPhoneForPlan] =
    useState<CheckoutPlan | null>(null);
  const [decliningFree, setDecliningFree] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);

  const yearlyAmount = yearlyPriceFrom(MONTHLY_PRICE.amount)!;
  const savings = MONTHLY_PRICE.amount * YEARLY_MONTHS_GRANTED - yearlyAmount;
  const busy = checkoutPending !== null || decliningFree || whatsapp.saving;

  /*
    Orden exacto (Parte 5E): validar y guardar el WhatsApp PRIMERO; el
    checkout recién arranca si el guardado salió bien. Si falla guardar, no
    se llama a `startCheckout` — si falla el checkout, el teléfono ya quedó
    persistido (no hay que volver a pedirlo en un reintento).
  */
  async function continueWithPlan(plan: CheckoutPlan) {
    setSavingPhoneForPlan(plan);
    const saved = await whatsapp.save();
    setSavingPhoneForPlan(null);
    if (!saved) return;
    startCheckout(plan);
  }

  function buttonLabel(plan: CheckoutPlan) {
    if (savingPhoneForPlan === plan) return "Guardando...";
    if (checkoutPending === plan) return "Preparando checkout...";
    return "Continuar con Mercado Pago";
  }

  async function continueFree() {
    setDeclineError(null);
    setDecliningFree(true);
    try {
      await fetch("/api/proxy/auth/me/consume-pending-upgrade-plan", {
        method: "POST",
      });
      router.push("/comenzar");
    } catch {
      setDecliningFree(false);
      setDeclineError("No pudimos continuar. Probá de nuevo.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F5F6FA] px-4 py-12">
      <div className="w-full max-w-2xl rounded-[20px] bg-white p-6 shadow-[0_24px_64px_rgba(17,22,59,0.10)] sm:p-8">
        <div className="text-center">
          <h1 className="font-display text-[26px] font-bold leading-tight tracking-[-0.02em] text-[#1A202C] sm:text-[30px]">
            Activá Flikker Pro
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#5C6478]">
            Elegí mensual o anual para terminar de activar tu cuenta.
          </p>
        </div>

        <div className="mt-6">
          <PhoneInput
            label="WhatsApp"
            value={whatsapp.phone}
            onChange={whatsapp.setPhone}
            placeholder="099 123 456"
            required
          />
          <p className="mt-2 text-xs leading-5 text-[#8891A4]">
            Lo usaremos para enviarte la confirmación y ayudarte con la puesta
            en marcha.
          </p>
          {whatsapp.error ? (
            <p role="alert" className="mt-2 text-xs text-[#C0392B]">
              {whatsapp.error}
            </p>
          ) : null}
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <section className="relative flex flex-col rounded-[16px] border border-[#E4E6EF] bg-white p-5">
            {pendingPlan === "MONTHLY" ? (
              <span className="absolute -top-2.5 left-5 rounded-full bg-[#1A202C] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
                Tu elección
              </span>
            ) : null}
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
              Mensual
            </p>
            <p className="mt-1.5 font-display text-base font-bold text-[#1A202C]">
              Flikker Pro
            </p>
            <p className="mt-4 text-[26px] font-bold leading-none text-[#1A202C]">
              {formatPrice(MONTHLY_PRICE.currency, MONTHLY_PRICE.amount)}
              <span className="ml-1 text-sm font-medium text-[#8891A4]">
                /mes
              </span>
            </p>
            <p className="mt-3 text-sm leading-6 text-[#5C6478]">
              Pagás mes a mes.
            </p>
            <button
              type="button"
              data-plan="monthly"
              disabled={busy}
              onClick={() => void continueWithPlan("MONTHLY")}
              className="mt-auto inline-flex h-11 items-center justify-center gap-2 rounded-[10px] border border-[#D9DCEA] bg-white px-4 pt-6 text-sm font-semibold text-[#1A202C] hover:border-[#6D4AFF] hover:text-[#6D4AFF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6D4AFF] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {checkoutPending === "MONTHLY" || savingPhoneForPlan === "MONTHLY" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {buttonLabel("MONTHLY")}
                </>
              ) : (
                buttonLabel("MONTHLY")
              )}
            </button>
          </section>

          <section className="relative flex flex-col rounded-[16px] border-2 border-[#6D4AFF] bg-[#FBFAFF] p-5">
            <span className="absolute -top-2.5 left-5 rounded-full bg-[#6D4AFF] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
              Mejor opción
            </span>
            {pendingPlan === "YEARLY" ? (
              <span className="absolute -top-2.5 right-5 rounded-full bg-[#1A202C] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
                Tu elección
              </span>
            ) : null}
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#7258D6]">
              Anual
            </p>
            <p className="mt-1.5 font-display text-base font-bold text-[#1A202C]">
              Flikker Pro
            </p>
            <p className="mt-4 text-[26px] font-bold leading-none text-[#1A202C]">
              {formatPrice(MONTHLY_PRICE.currency, yearlyAmount)}
              <span className="ml-1 text-sm font-medium text-[#8891A4]">
                /año
              </span>
            </p>
            <p className="mt-3 text-sm font-semibold leading-6 text-[#1A202C]">
              Pagás {YEARLY_MONTHS_CHARGED} meses y usás {YEARLY_MONTHS_GRANTED}
            </p>
            <ul className="mt-2.5 space-y-1.5">
              <li className="flex items-start gap-2 text-sm leading-6 text-[#5C6478]">
                <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-[#6D4AFF]" aria-hidden="true" />
                {YEARLY_MONTHS_FREE} meses incluidos
              </li>
              <li className="flex items-start gap-2 text-sm leading-6 text-[#5C6478]">
                <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-[#6D4AFF]" aria-hidden="true" />
                Ahorrás {formatPrice(MONTHLY_PRICE.currency, savings)} al año
              </li>
            </ul>
            <button
              type="button"
              data-plan="yearly"
              disabled={busy}
              onClick={() => void continueWithPlan("YEARLY")}
              className="flk-glossy mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-[10px] bg-[#6D4AFF] px-4 text-sm font-semibold text-white hover:bg-[#5c3ee0] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#6D4AFF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {checkoutPending === "YEARLY" || savingPhoneForPlan === "YEARLY" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  {buttonLabel("YEARLY")}
                </>
              ) : (
                buttonLabel("YEARLY")
              )}
            </button>
          </section>
        </div>

        {error ? (
          <p
            role="alert"
            className="mt-4 rounded-[10px] border border-[#E8A33D]/30 bg-[#FDF3E3] px-4 py-3 text-center text-sm text-[#8A5A14]"
          >
            {error}
          </p>
        ) : null}
        {declineError ? (
          <p
            role="alert"
            className="mt-4 rounded-[10px] border border-[#E8A33D]/30 bg-[#FDF3E3] px-4 py-3 text-center text-sm text-[#8A5A14]"
          >
            {declineError}
          </p>
        ) : null}

        <div className="mt-6 text-center">
          <button
            type="button"
            disabled={busy}
            onClick={() => void continueFree()}
            className="text-sm font-semibold text-[#6D4AFF] underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          >
            {decliningFree ? "Un momento..." : "Seguir con el plan gratis"}
          </button>
        </div>

        <p className="mt-5 text-center text-xs leading-5 text-[#8891A4]">
          El pago se procesa en Mercado Pago. Podés cancelar cuando quieras.
        </p>
      </div>
    </div>
  );
}
