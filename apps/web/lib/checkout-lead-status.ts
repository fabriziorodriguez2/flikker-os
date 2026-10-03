/**
 * Estado del checkout pre-onboarding, tal como lo devuelve
 * `GET /auth/me/checkout` (Parte 5D). Espejo del `CheckoutLeadStatus` del
 * backend — ver `apps/api/prisma/schema.prisma`.
 *
 * Usado por `/upgrade` (decidir si hay que seguir cobrando o ya hay algo en
 * curso) y por `/checkout/success` (decidir cuándo mandar a `/comenzar`).
 */

export type CheckoutLeadStatus =
  | "PENDING"
  | "CHECKOUT_CREATING"
  | "CHECKOUT_RECONCILIATION_REQUIRED"
  | "CHECKOUT_CREATED"
  | "PAID"
  | "FAILED"
  | "EXPIRED";

const VALID_STATUSES: ReadonlySet<string> = new Set([
  "PENDING",
  "CHECKOUT_CREATING",
  "CHECKOUT_RECONCILIATION_REQUIRED",
  "CHECKOUT_CREATED",
  "PAID",
  "FAILED",
  "EXPIRED",
]);

export interface PreOnboardingCheckoutStatus {
  status: CheckoutLeadStatus | null;
  plan: "MONTHLY" | "YEARLY" | null;
  businessId: string | null;
}

/** Parsea la respuesta de `GET /auth/me/checkout` sin confiar ciegamente en ella. */
export function parsePreOnboardingCheckoutStatus(
  value: unknown,
): PreOnboardingCheckoutStatus {
  if (typeof value !== "object" || value === null) {
    return { status: null, plan: null, businessId: null };
  }
  const v = value as Record<string, unknown>;
  const status =
    typeof v.status === "string" && VALID_STATUSES.has(v.status)
      ? (v.status as CheckoutLeadStatus)
      : null;
  const plan = v.plan === "MONTHLY" || v.plan === "YEARLY" ? v.plan : null;
  const businessId = typeof v.businessId === "string" ? v.businessId : null;
  return { status, plan, businessId };
}

/** El único estado desde el que corresponde mandar a `/comenzar`. */
export function isCheckoutPaid(status: CheckoutLeadStatus | null): boolean {
  return status === "PAID";
}

/**
 * `/checkout/success` reintenta por un rato corto, nunca para siempre — un
 * webhook caído o un pago que nunca se confirma no debe dejar a alguien
 * mirando un spinner indefinidamente.
 */
export function shouldKeepPolling(
  status: CheckoutLeadStatus | null,
  elapsedMs: number,
  maxMs: number,
): boolean {
  return !isCheckoutPaid(status) && elapsedMs < maxMs;
}
