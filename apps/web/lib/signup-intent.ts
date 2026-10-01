/**
 * Intención de plan Pro capturada en `/signup?plan=PRO&billing=MONTHLY|YEARLY`.
 *
 * El query param NUNCA activa Pro ni crea una Subscription — solo decide
 * si, una vez creado el Business en FREE, se ofrece el modal de upgrade.
 * El Business sigue naciendo FREE siempre; esto es pura intención de UX.
 *
 * Viaja en una cookie no sensible (no httpOnly) porque el link de
 * verificación llega por correo y habitualmente se abre en una pestaña
 * nueva del mismo navegador — una cookie sobrevive ese salto de pestaña,
 * a diferencia de `sessionStorage`. Se borra apenas se lee una vez
 * conocido el estado real del plan: se ofrece como mucho una vez.
 *
 * La lectura/escritura de `document.cookie` queda en el borde (funciones
 * cortas, sin lógica) para poder probar el parseo sin un DOM.
 */

export type SignupBilling = "MONTHLY" | "YEARLY";

export interface SignupIntent {
  billing: SignupBilling;
}

const COOKIE_NAME = "flikker_signup_intent";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24; // 24h: de sobra para confirmar el correo.

function isValidBilling(value: string | null | undefined): value is SignupBilling {
  return value === "MONTHLY" || value === "YEARLY";
}

/**
 * Lee `?plan=PRO&billing=...` de los query params del signup. Cualquier
 * otro valor de `plan` o `billing` (o su ausencia) se ignora — no es un
 * error, es simplemente "no hay intención Pro".
 */
export function parseSignupIntentFromSearchParams(
  params: URLSearchParams,
): SignupIntent | null {
  if (params.get("plan") !== "PRO") return null;
  const billing = params.get("billing");
  if (!isValidBilling(billing)) return null;
  return { billing };
}

/** El string a asignar a `document.cookie` para guardar la intención. */
export function buildSignupIntentCookie(intent: SignupIntent): string {
  return `${COOKIE_NAME}=${intent.billing}; Max-Age=${COOKIE_MAX_AGE_SECONDS}; Path=/; SameSite=Lax`;
}

/** El string a asignar a `document.cookie` para borrar la intención. */
export function buildClearSignupIntentCookie(): string {
  return `${COOKIE_NAME}=; Max-Age=0; Path=/; SameSite=Lax`;
}

/** Busca la cookie de intención dentro de un header `cookie` crudo. */
export function readSignupIntentFromCookieHeader(
  cookieHeader: string,
): SignupIntent | null {
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]*)`),
  );
  if (!match) return null;
  const raw = decodeURIComponent(match[1]);
  return isValidBilling(raw) ? { billing: raw } : null;
}

/** Guarda la intención. Se llama al visitar `/signup` con los params válidos. */
export function storeSignupIntent(intent: SignupIntent): void {
  if (typeof document === "undefined") return;
  document.cookie = buildSignupIntentCookie(intent);
}

/**
 * Borra cualquier intención previa. Se llama al visitar `/signup` SIN
 * `?plan=PRO` — un alta normal no debe arrastrar una intención vieja de
 * un intento anterior abandonado.
 */
export function clearSignupIntent(): void {
  if (typeof document === "undefined") return;
  document.cookie = buildClearSignupIntentCookie();
}

/**
 * Lee Y consume (borra) la intención guardada. Pensado para llamarse una
 * sola vez, cuando ya se conoce el estado real del plan — nunca antes.
 */
export function consumeSignupIntent(): SignupIntent | null {
  if (typeof document === "undefined") return null;
  const intent = readSignupIntentFromCookieHeader(document.cookie);
  clearSignupIntent();
  return intent;
}
