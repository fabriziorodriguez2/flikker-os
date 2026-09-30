import { Injectable, Logger } from '@nestjs/common';
import { CheckoutPlan } from '@prisma/client';
import {
  getMercadoPagoAccessToken,
  getSubscriptionBackUrl,
} from '../../config/mercado-pago';
import { resolveCheckoutPricing } from './checkout-pricing';

/**
 * Capa aislada sobre la Subscriptions API de Mercado Pago (`/preapproval`).
 *
 * Ningún otro archivo conoce el endpoint, los headers, ni el shape del
 * request/response de MP — eso es exactamente lo que permite testear
 * `CheckoutLeadsService` con un mock de esto en vez de pegarle a la red
 * real en cada corrida de la suite.
 *
 * ## Pivot 2026-09-30: subscription SIN plan asociado (`status: "pending"`)
 *
 * La primera versión de este provider mandaba `preapproval_plan_id`. Una
 * llamada real controlada contra producción confirmó que ese modo exige
 * `card_token_id` (`400 card_token_id is required`) — Mercado Pago solo
 * deja crear una subscription "con plan" si el frontend ya tokenizó una
 * tarjeta (CardForm/Bricks). Este repo NO quiere eso: la UX tiene que
 * seguir siendo "la persona termina de elegir/completar el medio de pago
 * del lado de Mercado Pago", no en la landing.
 *
 * La alternativa que sí soporta ese flujo, documentada por Mercado Pago,
 * es una subscription SIN plan asociado: se manda `reason` +
 * `auto_recurring` (frequency/frequency_type/transaction_amount/
 * currency_id) inline en vez de un `preapproval_plan_id`, con
 * `status: "pending"` y sin `card_token_id`. La respuesta trae `init_point`
 * igual que antes — la persona termina de autorizar el medio de pago del
 * lado de MP.
 *
 * ## `end_date` (2026-09-30, segunda vuelta)
 *
 * La primera versión de este provider omitía `end_date` (la documentación
 * no tiene una frase explícita que confirme que omitirlo lo hace
 * indefinido, solo ausencia de la lista de "requeridos"). Esa llamada
 * real dio `400 "User bad request"` — sin más detalle sobre la causa, así
 * que no se puede confirmar que haya sido `end_date`, pero el ejemplo que
 * SÍ trae la documentación oficial del flujo "sin plan, pending" incluye
 * `end_date` siempre. Esta versión lo manda: `now + 5 años`, calculado
 * server-side en cada llamada (`buildEndDateFiveYearsFromNow`) — NUNCA
 * una fecha fija hardcodeada, que envejecería con el tiempo.
 *
 * Es un horizonte TÉCNICO para validar el contrato, no una decisión
 * comercial: nada en este repo asume todavía que Flikker Pro vence a los
 * 5 años. Si Mercado Pago acepta el request, la decisión de negocio
 * (horizonte largo / renovar-recrear / investigar si `end_date` puede
 * omitirse de otra forma) queda pendiente, explícitamente fuera de esta
 * tanda.
 *
 * Los dos planes de Mercado Pago ("Flikker Pro", "Flikker Pro Anual")
 * siguen existiendo del lado de MP para cobro manual/contingencia, pero
 * este provider ya no los referencia por id — el monto, la moneda y la
 * frecuencia los decide `resolveCheckoutPricing` acá en el repo (ver
 * `checkout-pricing.ts`), que vuelve a ser la autoridad para este funnel.
 *
 * ## Idempotencia — este provider NUNCA hace un search/cancel de MP
 *
 * Incidente real (2026-09-30): una versión anterior hacía `GET
 * /preapproval/search?external_reference=` antes de crear, para "reusar"
 * una subscription existente. Ese search NO filtró de forma confiable —
 * devolvió una subscription REAL, ajena, ya `authorized`, que terminó
 * cancelada por un paso de limpieza posterior. Fue un incidente real
 * contra la cuenta de producción.
 *
 * Por eso la regla, no negociable:
 *
 *   Una subscription SOLO puede asociarse a un `CheckoutLead` si:
 *     (a) `providerSubscriptionId` vino DIRECTAMENTE de la respuesta del
 *         POST /preapproval hecho por ESA llamada, o
 *     (b) ya estaba persistido previamente en ESE `CheckoutLead`.
 *
 * Este archivo no conoce, y no debe conocer, ningún método para BUSCAR
 * (`/search`) o CANCELAR subscriptions. `getPreapprovalById` y
 * `getAuthorizedPaymentById` (Parte 4 — webhook) son la única excepción
 * deliberada: piden un recurso EXACTO por el id que Mercado Pago ya
 * notificó, nunca filtran ni buscan nada — es justo la distinción que
 * evita repetir el incidente. La garantía contra duplicados por
 * concurrencia REAL en la creación sigue siendo exclusivamente de base de
 * datos (`CheckoutLeadsService`, estado `CHECKOUT_CREATING`).
 *
 * Cuando el resultado de una llamada es AMBIGUO (timeout, error de red,
 * 5xx/429), este provider tira `MercadoPagoSubscriptionError` con
 * `retryable: true` y no reintenta ni busca nada — es responsabilidad
 * EXCLUSIVA de `CheckoutLeadsService` mover el lead a
 * `CHECKOUT_RECONCILIATION_REQUIRED`.
 *
 * ## Cero auto-cancel
 *
 * Este provider no tiene, y no debe tener nunca, un método para cancelar
 * o modificar una subscription.
 *
 * ## SDK vs. HTTP — misma decisión que el resto del repo
 *
 * `fetch` nativo + timeout, sin el SDK `mercadopago`. Mismo patrón que
 * `GooglePlacesProvider`/`GoogleReviewsProvider`/los providers de
 * WhatsApp — ningún HTTP client de terceros para una integración de una
 * sola llamada.
 */

export interface CreatePendingSubscriptionInput {
  /** `CheckoutLead.id` — viaja como `external_reference`, nunca como PII. */
  checkoutLeadId: string;
  /** Persistida por el caller ANTES de esta llamada. Nunca generada acá. */
  idempotencyKey: string;
  payerEmail: string;
  plan: CheckoutPlan;
}

export interface CreatePendingSubscriptionResult {
  /** `preapproval.id` — la subscription real, recién creada por ESTA llamada. */
  providerSubscriptionId: string;
  /** Eco de `status` tal como lo devolvió MP (esperado: "pending"). */
  providerStatus: string | null;
  /** `init_point` — el único valor que necesita el frontend. */
  checkoutUrl: string;
  /** Eco de `external_reference` — debería ser siempre `checkoutLeadId`. */
  externalReference: string | null;
}

/**
 * `retryable` distingue dos naturalezas MUY distintas de fallo, y
 * `CheckoutLeadsService` las trata de forma distinta:
 *
 *   - `false` — Mercado Pago RESPONDIÓ rechazando el request (4xx, o una
 *     respuesta 2xx sin los campos esperados). Sabemos con certeza que no
 *     se creó ninguna subscription: es seguro volver a PENDING.
 *   - `true` — AMBIGUO: timeout, error de red, o un 5xx/429 de MP. No hay
 *     certeza de que la subscription NO se haya creado del otro lado. Este
 *     provider NUNCA reintenta con este flag; el caller lo usa para
 *     decidir si el lead necesita reconciliación manual.
 */
export class MercadoPagoSubscriptionError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'MercadoPagoSubscriptionError';
  }
}

/**
 * El recurso real de una subscription, tal como lo devuelve
 * `GET /preapproval/{id}` — usado por el webhook (Parte 4) para
 * reconciliar. Nunca se confía en el body del webhook para estos campos:
 * siempre se leen de ACÁ, la respuesta real de Mercado Pago.
 */
export interface PreapprovalResource {
  id: string;
  status: string;
  externalReference: string | null;
  payerEmail: string | null;
  autoRecurring: {
    frequency: number | null;
    frequencyType: string | null;
    transactionAmount: number | null;
    currencyId: string | null;
  };
}

/**
 * El recurso real de un cobro recurrente, tal como lo devuelve
 * `GET /authorized_payments/{id}`. Shape mínimo — esta tanda solo valida
 * pertenencia y loguea (§13), no construye lógica de negocio sobre el
 * resto de los campos todavía.
 */
export interface AuthorizedPaymentResource {
  id: string;
  preapprovalId: string | null;
  status: string | null;
}

const PREAPPROVAL_ENDPOINT = 'https://api.mercadopago.com/preapproval';
const AUTHORIZED_PAYMENTS_ENDPOINT =
  'https://api.mercadopago.com/authorized_payments';
const TIMEOUT_MS = 10_000;
/**
 * Horizonte TÉCNICO de `end_date`, no comercial — ver comentario de la
 * clase. 5 años da margen de sobra mientras se valida/decide el contrato
 * real con Mercado Pago.
 */
const END_DATE_HORIZON_YEARS = 5;

interface PreapprovalResponseShape {
  id?: string;
  init_point?: string;
  status?: string;
  external_reference?: string;
}

@Injectable()
export class MercadoPagoSubscriptionProvider {
  private readonly logger = new Logger('mercado-pago-subscription');

  /**
   * Mismo patrón que `GooglePlacesProvider.isAvailable()`: el caller lo
   * usa para responder "no disponible" de forma explícita en vez de dejar
   * que la llamada real falle con un 401 críptico.
   */
  isAvailable(): boolean {
    return Boolean(getMercadoPagoAccessToken());
  }

  /**
   * UN solo request mutante: `POST /preapproval`, subscription SIN plan
   * asociado, `status: "pending"`. Nada de GET de búsqueda antes, nada de
   * PUT/DELETE después — ver el comentario de arriba sobre el incidente
   * que esta regla previene.
   */
  async createPendingSubscription(
    input: CreatePendingSubscriptionInput,
  ): Promise<CreatePendingSubscriptionResult> {
    const accessToken = getMercadoPagoAccessToken();
    if (!accessToken) {
      throw new MercadoPagoSubscriptionError(
        'MERCADO_PAGO_ACCESS_TOKEN no configurado.',
        false,
      );
    }

    const backUrl = getSubscriptionBackUrl();
    if (!backUrl) {
      throw new MercadoPagoSubscriptionError(
        'MERCADO_PAGO_SUBSCRIPTION_BACK_URL no configurado.',
        false,
      );
    }

    const pricing = resolveCheckoutPricing(input.plan);

    const body = {
      reason: pricing.mercadoPagoReason,
      external_reference: input.checkoutLeadId,
      payer_email: input.payerEmail,
      auto_recurring: {
        frequency: pricing.frequency,
        frequency_type: pricing.frequencyType,
        end_date: buildEndDateFiveYearsFromNow(),
        transaction_amount: pricing.amount,
        currency_id: pricing.currency,
      },
      back_url: backUrl,
      status: 'pending',
    };

    let response: Response;
    try {
      response = await this.fetchWithTimeout(PREAPPROVAL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Nunca loguear este header — es el access token completo.
          Authorization: `Bearer ${accessToken}`,
          'X-Idempotency-Key': input.idempotencyKey,
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      // Timeout / error de red: AMBIGUO — no sabemos si MP creó la
      // subscription del otro lado. `retryable: true` le señala al
      // caller que esto NO es un rechazo confirmado.
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Mercado Pago /preapproval request falló para lead ${input.checkoutLeadId}: ${message}`,
      );
      throw new MercadoPagoSubscriptionError(message, true);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      // El body puede traer detalle útil del rechazo — se loguea recortado
      // y SIN el header de auth. Nunca incluye email/teléfono: esos nunca
      // viajan en la respuesta de error de MP, solo en el request que
      // nosotros armamos.
      this.logger.warn(
        `Mercado Pago respondió ${response.status} para lead ${input.checkoutLeadId}: ${errorBody.slice(0, 500)}`,
      );
      // 429/5xx: MP pudo no haber procesado el request, o pudo haberlo
      // procesado parcialmente antes de fallar — AMBIGUO. 4xx (400/401/404
      // etc.): MP rechazó el request explícitamente, nada se creó.
      const retryable = response.status === 429 || response.status >= 500;
      throw new MercadoPagoSubscriptionError(
        `Mercado Pago respondió ${response.status}`,
        retryable,
        response.status,
      );
    }

    const parsed = JSON.parse(
      await response.text(),
    ) as PreapprovalResponseShape;
    if (!parsed.id || !parsed.init_point) {
      // 2xx pero sin los campos que necesitamos: no es razonable asumir
      // que esto vaya a arreglarse solo. No-retryable — no hay nada
      // ambiguo, la respuesta ya llegó y está incompleta.
      throw new MercadoPagoSubscriptionError(
        'Mercado Pago no devolvió id/init_point en una respuesta exitosa.',
        false,
      );
    }

    if (
      parsed.external_reference &&
      parsed.external_reference !== input.checkoutLeadId
    ) {
      // Defensivo, no esperado: si esto pasara de verdad sería un bug de
      // MP, no algo que este código pueda corregir. Se loguea fuerte y se
      // sigue — el `id` que tenemos es el que MP acaba de devolver en
      // respuesta a ESTE POST, así que sigue siendo el correcto para este
      // lead pase lo que pase con el campo de eco.
      this.logger.warn(
        `external_reference de Mercado Pago (${parsed.external_reference}) no coincide con el lead (${input.checkoutLeadId}).`,
      );
    }

    this.logger.log(
      `Subscription pending creada en Mercado Pago para lead ${input.checkoutLeadId} (preapproval ${parsed.id}).`,
    );
    return {
      providerSubscriptionId: parsed.id,
      providerStatus: parsed.status ?? null,
      checkoutUrl: parsed.init_point,
      externalReference: parsed.external_reference ?? null,
    };
  }

  /**
   * `GET /preapproval/{id}` — el ÚNICO GET que el webhook (Parte 4) usa
   * para reconciliar. Nunca `/preapproval/search`: esto pide un recurso
   * EXACTO por el id que Mercado Pago ya nos notificó, no filtra/busca
   * nada — es justo la distinción que evita repetir el incidente
   * 2026-09-30 (ver comentario de la clase).
   */
  async getPreapprovalById(id: string): Promise<PreapprovalResource> {
    const accessToken = getMercadoPagoAccessToken();
    if (!accessToken) {
      throw new MercadoPagoSubscriptionError(
        'MERCADO_PAGO_ACCESS_TOKEN no configurado.',
        false,
      );
    }

    let response: Response;
    try {
      response = await this.fetchWithTimeout(
        `${PREAPPROVAL_ENDPOINT}/${encodeURIComponent(id)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`GET /preapproval/${id} falló: ${message}`);
      throw new MercadoPagoSubscriptionError(message, true);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      this.logger.warn(
        `GET /preapproval/${id} respondió ${response.status}: ${errorBody.slice(0, 500)}`,
      );
      const retryable = response.status === 429 || response.status >= 500;
      throw new MercadoPagoSubscriptionError(
        `Mercado Pago respondió ${response.status}`,
        retryable,
        response.status,
      );
    }

    const parsed = JSON.parse(await response.text()) as {
      id?: string;
      status?: string;
      external_reference?: string;
      payer_email?: string;
      auto_recurring?: {
        frequency?: number;
        frequency_type?: string;
        transaction_amount?: number;
        currency_id?: string;
      };
    };
    if (!parsed.id || !parsed.status) {
      throw new MercadoPagoSubscriptionError(
        `GET /preapproval/${id} no devolvió id/status en una respuesta exitosa.`,
        false,
      );
    }

    return {
      id: parsed.id,
      status: parsed.status,
      externalReference: parsed.external_reference ?? null,
      payerEmail: parsed.payer_email ?? null,
      autoRecurring: {
        frequency: parsed.auto_recurring?.frequency ?? null,
        frequencyType: parsed.auto_recurring?.frequency_type ?? null,
        transactionAmount: parsed.auto_recurring?.transaction_amount ?? null,
        currencyId: parsed.auto_recurring?.currency_id ?? null,
      },
    };
  }

  /**
   * `GET /authorized_payments/{id}` — mismo criterio que
   * `getPreapprovalById`: un GET exacto por id notificado, nunca una
   * búsqueda. Usado para el topic `subscription_authorized_payment`
   * (§13): esta tanda solo valida pertenencia y loguea, no construye
   * lógica de negocio sobre el resto de los campos.
   */
  async getAuthorizedPaymentById(
    id: string,
  ): Promise<AuthorizedPaymentResource> {
    const accessToken = getMercadoPagoAccessToken();
    if (!accessToken) {
      throw new MercadoPagoSubscriptionError(
        'MERCADO_PAGO_ACCESS_TOKEN no configurado.',
        false,
      );
    }

    let response: Response;
    try {
      response = await this.fetchWithTimeout(
        `${AUTHORIZED_PAYMENTS_ENDPOINT}/${encodeURIComponent(id)}`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`GET /authorized_payments/${id} falló: ${message}`);
      throw new MercadoPagoSubscriptionError(message, true);
    }

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      this.logger.warn(
        `GET /authorized_payments/${id} respondió ${response.status}: ${errorBody.slice(0, 500)}`,
      );
      const retryable = response.status === 429 || response.status >= 500;
      throw new MercadoPagoSubscriptionError(
        `Mercado Pago respondió ${response.status}`,
        retryable,
        response.status,
      );
    }

    const parsed = JSON.parse(await response.text()) as {
      id?: string;
      preapproval_id?: string;
      status?: string;
    };
    if (!parsed.id) {
      throw new MercadoPagoSubscriptionError(
        `GET /authorized_payments/${id} no devolvió id en una respuesta exitosa.`,
        false,
      );
    }

    return {
      id: parsed.id,
      preapprovalId: parsed.preapproval_id ?? null,
      status: parsed.status ?? null,
    };
  }

  private async fetchWithTimeout(url: string, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }
}

/**
 * `now + END_DATE_HORIZON_YEARS`, en ISO 8601 UTC — calculada en cada
 * llamada, nunca una fecha fija hardcodeada (envejecería con el tiempo).
 * `setUTCFullYear` respeta años bisiestos correctamente (a diferencia de
 * sumar milisegundos fijos).
 */
function buildEndDateFiveYearsFromNow(): string {
  const date = new Date();
  date.setUTCFullYear(date.getUTCFullYear() + END_DATE_HORIZON_YEARS);
  return date.toISOString();
}
