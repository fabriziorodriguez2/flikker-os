import { CheckoutPlan } from '@prisma/client';

/**
 * El precio real de Flikker Pro, server-side y nada más.
 *
 * Única fuente de verdad: ni la landing, ni el request, ni Mercado Pago
 * deciden el monto. El frontend manda `plan` (MONTHLY | YEARLY); ESTE
 * archivo traduce eso a lo que se le cobra a la persona. Un request no
 * puede mandar `amount` — el DTO de creación del lead ya lo rechaza
 * (`forbidNonWhitelisted`), y este archivo es la razón: si se aceptara un
 * monto del cliente, este módulo dejaría de ser la fuente de verdad.
 *
 * El anual representa 12 meses de uso pagando el equivalente a 10 —
 * `serviceMonths: 12` documenta esa promesa para que quien lea el precio no
 * tenga que inferirla del monto.
 *
 * Función pura, no un `@Injectable()`: no tiene estado, no depende de
 * nada inyectable, y así se puede importar directo en un test unitario sin
 * levantar el módulo de Nest — igual que `apps/web/lib/checkout-urls.ts`
 * del lado del frontend.
 */

export interface CheckoutPricing {
  currency: 'UYU';
  /** Monto total a cobrar, en la unidad de `currency` (sin decimales). */
  amount: number;
  /** Título del ítem tal como lo ve la persona en el checkout de MP. */
  title: string;
  /** Meses de servicio que este pago cubre. */
  serviceMonths: number;
  /**
   * `reason` que se manda a `/preapproval` — lo que ve el pagador en el
   * checkout ALOJADO por Mercado Pago (subscription SIN plan asociado).
   * Deliberadamente distinto de `title`: `reason` replica el nombre de
   * los planes que ya existen del lado de Mercado Pago ("Flikker Pro" /
   * "Flikker Pro Anual"), mientras que `title` es el rótulo que usa
   * este repo en sus propias pantallas — no tienen por qué coincidir.
   */
  mercadoPagoReason: string;
  /** `auto_recurring.frequency` — cada cuánto se cobra. */
  frequency: number;
  /** `auto_recurring.frequency_type` — unidad de `frequency`. */
  frequencyType: 'months';
}

const PRICING: Record<CheckoutPlan, CheckoutPricing> = {
  MONTHLY: {
    currency: 'UYU',
    amount: 1000,
    title: 'Flikker Pro Mensual',
    serviceMonths: 1,
    mercadoPagoReason: 'Flikker Pro',
    frequency: 1,
    frequencyType: 'months',
  },
  YEARLY: {
    currency: 'UYU',
    // 12 meses de uso pagando 10 — la misma promesa que ya anuncian
    // `PRO_YEARLY_CHECKOUT_URL` y el modal de upgrade del panel
    // (`apps/web/components/panel/upgrade-plan-modal.tsx`). Si ese precio
    // cambia alguna vez, cambia acá — nunca en el request ni en un link
    // estático de Mercado Pago.
    amount: 10000,
    title: 'Flikker Pro Anual',
    serviceMonths: 12,
    mercadoPagoReason: 'Flikker Pro Anual',
    frequency: 12,
    frequencyType: 'months',
  },
};

export function resolveCheckoutPricing(plan: CheckoutPlan): CheckoutPricing {
  return PRICING[plan];
}
