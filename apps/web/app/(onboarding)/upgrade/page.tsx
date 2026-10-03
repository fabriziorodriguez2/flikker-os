import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import UpgradeClient from "./upgrade-client";

interface MeResponse {
  pendingUpgradePlan: "MONTHLY" | "YEARLY" | null;
  notificationWhatsapp: string | null;
}

interface CheckoutStatusResponse {
  status: string | null;
}

/**
 * Parte 5D — "PRO paga ANTES del onboarding". Llega acá SOLO quien
 * verificó su correo con una intención Pro pendiente (`verify-email`
 * redirige acá en ese caso). Un signup normal nunca pasa por esta pantalla.
 *
 * No crea ningún Business — eso sigue siendo exclusivamente
 * `OnboardingService.saveBusiness`, recién en `/comenzar`.
 */
export default async function UpgradePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let pendingUpgradePlan: "MONTHLY" | "YEARLY" | null = null;
  let initialNotificationWhatsapp: string | null = null;
  try {
    const me = await apiFetch<MeResponse>("/auth/me", session.accessToken);
    pendingUpgradePlan = me.pendingUpgradePlan ?? null;
    initialNotificationWhatsapp = me.notificationWhatsapp ?? null;
  } catch {
    pendingUpgradePlan = null;
  }

  // Sin intención (nunca la tuvo, o ya la consumió en una visita anterior):
  // nada que cobrar acá — el camino normal es onboarding FREE.
  if (!pendingUpgradePlan) redirect("/comenzar");

  let checkoutStatus: string | null = null;
  try {
    const status = await apiFetch<CheckoutStatusResponse>(
      "/auth/me/checkout",
      session.accessToken,
    );
    checkoutStatus = status.status;
  } catch {
    checkoutStatus = null;
  }

  // Ya pagó: el onboarding es quien asocia el CheckoutLead y activa Pro —
  // no hay nada más que decidir acá.
  if (checkoutStatus === "PAID") redirect("/comenzar");
  // Ya hay un checkout en curso (volvió sin terminar, o abrió en otra
  // pestaña): que `/checkout/success` reconcilie/espere, no se vuelve a
  // ofrecer elegir plan desde cero.
  if (checkoutStatus === "CHECKOUT_CREATED") redirect("/checkout/success");

  return (
    <UpgradeClient
      pendingPlan={pendingUpgradePlan}
      initialNotificationWhatsapp={initialNotificationWhatsapp}
    />
  );
}
