import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getSession } from "@/lib/auth";
import WizardClient from "./wizard-client";

interface OnboardingStateResponse {
  businessId: string | null;
}

/**
 * Onboarding self-service. Ruta propia y separada de `/onboarding`, que es
 * el wizard asistido que usa Platform Admin (`?businessId=`) para negocios
 * de la etapa anterior — ese sigue funcionando igual.
 */
export default async function ComenzarPage() {
  const session = await getSession();
  if (!session) redirect("/login");

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
