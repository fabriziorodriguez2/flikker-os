/**
 * Intención de upgrade Pro capturada en `/signup?plan=PRO&billing=...`.
 *
 * Vive en el User (`pendingUpgradePlan`, backend) — sobrevive a cualquier
 * salto de pestaña/navegador/dispositivo porque viaja con la sesión, no con
 * storage de un browser puntual (bug real con una cookie, resuelto en
 * Parte 5C).
 *
 * Parte 5D — "PRO paga ANTES del onboarding": esta intención ya NO abre un
 * modal post-onboarding. En cambio, `verify-email` redirige a `/upgrade`
 * cuando está presente, esa pantalla cobra (o deja seguir gratis), y recién
 * entonces el User entra a `/comenzar`. `pendingUpgradePlan` sigue sin ser
 * NUNCA autoridad de billing — no activa Pro, no crea una Subscription; solo
 * decide a qué pantalla mandar a alguien recién verificado.
 */

export type PendingUpgradePlan = "MONTHLY" | "YEARLY";

function isValidPlan(value: string | null | undefined): value is PendingUpgradePlan {
  return value === "MONTHLY" || value === "YEARLY";
}

/**
 * Lee `?plan=PRO&billing=...` para mandarlo en el body del signup. El
 * backend igual lo revalida como enum (nunca confía en esto) — acá se
 * filtra para no mandar basura, no para que el filtrado sea la única
 * defensa. Cualquier otro valor (o su ausencia) es `null`: un signup
 * normal, sin intención.
 */
export function parsePendingUpgradePlanFromSearchParams(
  params: URLSearchParams,
): PendingUpgradePlan | null {
  if (params.get("plan") !== "PRO") return null;
  const billing = params.get("billing");
  return isValidPlan(billing) ? billing : null;
}

/** Lee el campo tal como lo devuelve el backend (`GET /auth/me`). */
export function parsePendingUpgradePlanFromApi(value: unknown): PendingUpgradePlan | null {
  return isValidPlan(typeof value === "string" ? value : null) ? (value as PendingUpgradePlan) : null;
}
