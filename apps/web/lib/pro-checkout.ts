/**
 * Lógica del checkout Pro autenticado, separada de React para poder
 * probarla sin un DOM — igual que `free-plan-usage.ts` es la lógica pura
 * detrás de `UpgradeModalProvider`. `useProCheckout` es una capa fina de
 * `fetch` + estado sobre esto.
 *
 * El endpoint real es `POST /businesses/current/checkout` (vía el proxy
 * `/api/proxy/...`): el Business y el User salen de la sesión del lado del
 * backend, nunca del body. El body de acá NUNCA lleva businessId, el id de
 * quien pide, un monto, una moneda, un correo ni un teléfono — eso sería
 * confiar en el navegador para algo que solo el backend puede resolver de
 * forma confiable.
 */

export type CheckoutPlan = "MONTHLY" | "YEARLY";

export const CHECKOUT_GENERIC_ERROR_MESSAGE =
  "No pudimos abrir el checkout. Probá de nuevo.";

/** El body exacto que viaja al backend — nunca más que el plan elegido. */
export function buildProCheckoutRequestBody(
  plan: CheckoutPlan,
): { plan: CheckoutPlan } {
  return { plan };
}

/**
 * Traduce la respuesta del proxy a un resultado único. Si el backend no
 * contesta con un `checkoutUrl` usable, se trata como error — nunca se
 * arma una URL a mano ni se asume un default.
 */
export function parseProCheckoutResponse(
  ok: boolean,
  data: unknown,
): { checkoutUrl: string } | { errorMessage: string } {
  if (ok && typeof data === "object" && data !== null) {
    const checkoutUrl = (data as Record<string, unknown>).checkoutUrl;
    if (typeof checkoutUrl === "string" && checkoutUrl.length > 0) {
      return { checkoutUrl };
    }
  }

  const message =
    typeof data === "object" &&
    data !== null &&
    "message" in data &&
    typeof (data as Record<string, unknown>).message === "string"
      ? ((data as Record<string, unknown>).message as string)
      : CHECKOUT_GENERIC_ERROR_MESSAGE;

  return { errorMessage: message };
}
