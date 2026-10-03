import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import WizardClient from "./wizard-client";

interface OnboardingStateResponse {
  businessId: string | null;
}

interface MeResponse {
  pendingUpgradePlan: "MONTHLY" | "YEARLY" | null;
}

interface CheckoutStatusResponse {
  status: string | null;
}

/**
 * Onboarding self-service. Ruta propia y separada de `/onboarding`, que es
 * el wizard asistido que usa Platform Admin (`?businessId=`) para negocios
 * de la etapa anterior — ese sigue funcionando igual.
 */
export default async function ComenzarPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Parte 5D — "PRO paga ANTES del onboarding": con una intención pendiente
  // sin resolver, `/comenzar` NUNCA deja crear un Business FREE por
  // accidente. Si ya pagó (CheckoutLead PAID) sigue de largo — el paso 1
  // del wizard (`OnboardingService.saveBusiness`) es quien asocia ese lead
  // y activa Pro. Elegir "Seguir con el plan gratis" en `/upgrade` deja
  // `pendingUpgradePlan` en null, así que esto deja de aplicar.
  let pendingUpgradePlan: "MONTHLY" | "YEARLY" | null = null;
  try {
    const me = await apiFetch<MeResponse>("/auth/me", session.accessToken);
    pendingUpgradePlan = me.pendingUpgradePlan ?? null;
  } catch {
    pendingUpgradePlan = null;
  }

  if (pendingUpgradePlan) {
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

    if (checkoutStatus === "CHECKOUT_CREATED") redirect("/checkout/success");
    if (checkoutStatus !== "PAID") redirect("/upgrade");
    // PAID: sigue de largo — el wizard asocia el lead y activa Pro.
  }

  // Guard inverso al de `(panel)/layout.tsx`. Ambos miran si existe un
  // borrador (`onboardingCompletedAt` nulo) y redirigen en direcciones
  // opuestas, así que las condiciones son excluyentes y no hay rebote.
  //
  // Se pregunta a la API en vez de mirar la cookie porque `complete()` cambia
  // el estado sin reescribir la sesión: una cookie vieja dejaría al dueño
  // volviendo al wizard ya terminado.
  const hasBusinesses = session.memberships.length > 0;
  const isOwnerSomewhere = session.memberships.some((m) => m.role === "OWNER");

  // Los invitados nunca hacen onboarding: entran a configurar el negocio de
  // otro. Se corta acá sin siquiera preguntar por el borrador — la API
  // tampoco les daría uno, porque `findDraft` exige membresía OWNER.
  if (hasBusinesses && !isOwnerSomewhere) redirect("/dashboard");

  let hasDraft = true;
  try {
    const state = await apiFetch<OnboardingStateResponse>(
      "/onboarding/state",
      session.accessToken,
    );
    hasDraft = state.businessId !== null;
  } catch {
    // Si la API no responde dejamos entrar: el wizard muestra su propio error
    // de carga. Redirigir a ciegas al panel sería peor — el negocio podría
    // estar de verdad a medio configurar.
  }

  // Sin borrador y con negocios asignados = ya terminó. Sin borrador y sin
  // negocios (usuario huérfano) se queda: el paso 1 le crea uno.
  if (!hasDraft && hasBusinesses) redirect("/dashboard");

  return <WizardClient />;
}
