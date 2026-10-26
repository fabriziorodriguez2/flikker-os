import type { PendingUpgradePlan } from "@/lib/pending-upgrade-plan";
import { getSafeInternalPath } from "@/lib/safe-redirect";

/**
 * "Continuar con Google" — lógica pura, segura para importar desde el
 * browser (sin `crypto` de Node: eso vive en `google-oauth-server.ts`).
 *
 * Flujo: botón → `GET /api/auth/google` (genera state/nonce/PKCE, los guarda
 * en una cookie httpOnly y redirige a Google) → Google → `GET
 * /api/auth/google/callback` (valida state contra la cookie, la API canjea
 * el code y verifica el ID token) → misma cookie `flikker_session` que el
 * login con password.
 */

export const GOOGLE_AUTH_ERROR_MESSAGE =
  "No pudimos iniciar sesión con Google. Probá de nuevo.";

export const GOOGLE_OAUTH_COOKIE = "flikker_google_oauth";
/** Solo la mandan las dos rutas del flujo, nada más del sitio. */
export const GOOGLE_OAUTH_COOKIE_PATH = "/api/auth/google";
/** Pasado esto el callback se trata como vencido. */
export const GOOGLE_OAUTH_COOKIE_MAX_AGE = 10 * 60;

export type GoogleAuthOrigin = "login" | "signup";

/**
 * Lo que sobrevive al redirect a Google, server-side (cookie httpOnly que
 * solo escribe nuestro server). La intención PRO viaja ACÁ, nunca en el
 * query string que vuelve de Google.
 */
export interface GoogleOAuthFlow {
  state: string;
  nonce: string;
  codeVerifier: string;
  pendingUpgradePlan: PendingUpgradePlan | null;
  next: string | null;
  origin: GoogleAuthOrigin;
}

const RANDOM_TOKEN = /^[A-Za-z0-9_-]{43,128}$/;

export function parseGoogleOAuthFlow(
  raw: string | undefined,
): GoogleOAuthFlow | null {
  if (!raw) return null;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v.state !== "string" ||
    !RANDOM_TOKEN.test(v.state) ||
    typeof v.nonce !== "string" ||
    !RANDOM_TOKEN.test(v.nonce) ||
    typeof v.codeVerifier !== "string" ||
    !RANDOM_TOKEN.test(v.codeVerifier)
  ) {
    return null;
  }
  return {
    state: v.state,
    nonce: v.nonce,
    codeVerifier: v.codeVerifier,
    pendingUpgradePlan:
      v.pendingUpgradePlan === "MONTHLY" || v.pendingUpgradePlan === "YEARLY"
        ? v.pendingUpgradePlan
        : null,
    next: typeof v.next === "string" ? getSafeInternalPath(v.next) : null,
    origin: v.origin === "signup" ? "signup" : "login",
  };
}

/** href del botón. La intención PRO viaja solo hasta nuestro server. */
export function buildGoogleStartHref(input: {
  origin: GoogleAuthOrigin;
  pendingUpgradePlan?: PendingUpgradePlan | null;
  next?: string | null;
}): string {
  const params = new URLSearchParams({ from: input.origin });
  if (input.pendingUpgradePlan) {
    params.set("plan", "PRO");
    params.set("billing", input.pendingUpgradePlan);
  }
  const next = getSafeInternalPath(input.next);
  if (next) params.set("next", next);
  return `/api/auth/google?${params.toString()}`;
}

/**
 * Adónde volver si algo falla. Desde signup se conserva la intención PRO
 * para que el reintento no la pierda.
 */
export function buildGoogleErrorPath(
  flow: Pick<GoogleOAuthFlow, "origin" | "pendingUpgradePlan"> | null,
): string {
  if (flow?.origin !== "signup") return "/login?error=google";
  const params = new URLSearchParams();
  if (flow.pendingUpgradePlan) {
    params.set("plan", "PRO");
    params.set("billing", flow.pendingUpgradePlan);
  }
  params.set("error", "google");
  return `/signup?${params.toString()}`;
}

/**
 * Estado REAL del User después de autenticar (lo que devolvió la API), no
 * la intención con la que arrancó el flujo:
 *   A. tiene Business → dashboard (o el `next` seguro, ej. un canje)
 *   B. sin Business + intención PRO → /upgrade (paga antes del onboarding)
 *   C. sin Business → /comenzar
 */
export function resolvePostGoogleRedirect(input: {
  isPlatformAdmin?: boolean;
  membershipsCount: number;
  pendingUpgradePlan: PendingUpgradePlan | null | undefined;
  next: string | null;
}): string {
  if (input.isPlatformAdmin) return "/platform";
  if (input.membershipsCount > 0) {
    return getSafeInternalPath(input.next) ?? "/dashboard";
  }
  return input.pendingUpgradePlan ? "/upgrade" : "/comenzar";
}
