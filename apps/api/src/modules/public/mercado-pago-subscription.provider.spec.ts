import { CheckoutPlan } from '@prisma/client';
import {
  MercadoPagoSubscriptionProvider,
  MercadoPagoSubscriptionError,
} from './mercado-pago-subscription.provider';

/**
 * La capa que habla con Mercado Pago de verdad — probada acá con `fetch`
 * mockeado, nunca contra la red real en la suite normal.
 *
 * ## Pivot 2026-09-30: subscription SIN plan asociado
 *
 * Una llamada real controlada contra producción confirmó que el modo "con
 * `preapproval_plan_id`" exige `card_token_id` (400 explícito). Este
 * provider pasa a crear subscriptions SIN plan asociado: `reason` +
 * `auto_recurring` inline (incluido `end_date`, ver más abajo),
 * `status: "pending"`, sin `card_token_id`. Los montos/frecuencias usados
 * acá son los reales de Flikker Pro (`resolveCheckoutPricing`), que ya
 * están cubiertos por `checkout-pricing.spec.ts` — no hace falta un fake
 * acá porque, a diferencia de los `preapproval_plan_id` de la versión
 * anterior, estos valores no son secretos de una cuenta real.
 *
 * `end_date` se calcula server-side (`now + 5 años`) en cada llamada —
 * nunca un string fijo — así que los tests lo verifican con un rango
 * (`toBeGreaterThan`/`toBeLessThan`), no con `toEqual` exacto.
 *
 * ## Test de regresión del incidente 2026-09-30
 *
 * Una versión anterior hacía `GET /preapproval/search?external_reference=`
 * antes de crear, para reusar una subscription existente. Ese search no
 * filtró de forma confiable y terminó asociando (y una capa de arriba
 * cancelando) una subscription real ajena al lead. La regla ahora: este
 * provider hace EXACTAMENTE UN fetch por `createPendingSubscription` — el
 * POST de creación — y nada más. Nunca un GET de búsqueda, nunca un
 * PUT/DELETE de cancelación.
 */
describe('MercadoPagoSubscriptionProvider', () => {
  const ORIGINAL_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const ORIGINAL_BACK_URL = process.env.MERCADO_PAGO_SUBSCRIPTION_BACK_URL;
  let provider: MercadoPagoSubscriptionProvider;

  const input = {
    checkoutLeadId: 'lead-abc-123',
    idempotencyKey: 'key-fixed-001',
    payerEmail: 'juan@ejemplo.com',
    plan: CheckoutPlan.MONTHLY,
  };

  beforeEach(() => {
    provider = new MercadoPagoSubscriptionProvider();
    process.env.MERCADO_PAGO_ACCESS_TOKEN = 'TEST-fake-token';
    process.env.MERCADO_PAGO_SUBSCRIPTION_BACK_URL =
      'https://flikker.uy/checkout/success';
  });

  afterEach(() => {
    process.env.MERCADO_PAGO_ACCESS_TOKEN = ORIGINAL_TOKEN;
    process.env.MERCADO_PAGO_SUBSCRIPTION_BACK_URL = ORIGINAL_BACK_URL;
    jest.restoreAllMocks();
  });

  function mockCreate(body: {
    id: string;
    status?: string;
    init_point: string;
    external_reference?: string;
  }) {
    return jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 201,
      text: () => Promise.resolve(JSON.stringify(body)),
    } as Response);
  }

  describe('sin MERCADO_PAGO_ACCESS_TOKEN configurado', () => {
    beforeEach(() => {
      delete process.env.MERCADO_PAGO_ACCESS_TOKEN;
    });

    it('isAvailable() es false', () => {
      expect(provider.isAvailable()).toBe(false);
    });

    it('createPendingSubscription tira sin llamar a fetch', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      await expect(provider.createPendingSubscription(input)).rejects.toThrow(
        MercadoPagoSubscriptionError,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('sin MERCADO_PAGO_SUBSCRIPTION_BACK_URL configurado', () => {
    beforeEach(() => {
      delete process.env.MERCADO_PAGO_SUBSCRIPTION_BACK_URL;
    });

    it('tira sin llamar a fetch — nunca manda un placeholder inventado', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch');
      await expect(provider.createPendingSubscription(input)).rejects.toThrow(
        MercadoPagoSubscriptionError,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('con configuración completa — request bien armado', () => {
    it('isAvailable() es true', () => {
      expect(provider.isAvailable()).toBe(true);
    });

    it('hace EXACTAMENTE UN fetch — el POST de creación, nunca un GET previo', async () => {
      const fetchSpy = mockCreate({
        id: 'PREAPPROVAL-1',
        status: 'pending',
        init_point: 'https://mp.test/x',
      });
      await provider.createPendingSubscription(input);

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const [url, init] = fetchSpy.mock.calls[0];
      expect(url as string).toBe('https://api.mercadopago.com/preapproval');
      expect(init!.method).toBe('POST');
    });

    it('MONTHLY: reason="Flikker Pro", auto_recurring 1 mes / UYU 1000 / end_date presente, status=pending, external_reference, payer_email y back_url — nada más', async () => {
      const fetchSpy = mockCreate({
        id: 'PREAPPROVAL-1',
        status: 'pending',
        init_point: 'https://mp.test/x',
      });
      const before = Date.now();
      await provider.createPendingSubscription(input);

      const [, createInit] = fetchSpy.mock.calls[0];
      const body = JSON.parse(createInit!.body as string) as Record<
        string,
        unknown
      >;
      const autoRecurring = body.auto_recurring as Record<string, unknown>;
      expect(body).toEqual({
        reason: 'Flikker Pro',
        external_reference: 'lead-abc-123',
        payer_email: 'juan@ejemplo.com',
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          end_date: autoRecurring.end_date,
          transaction_amount: 1000,
          currency_id: 'UYU',
        },
        back_url: 'https://flikker.uy/checkout/success',
        status: 'pending',
      });
      expectEndDateFiveYearsFromNow(autoRecurring.end_date as string, before);
    });

    it('YEARLY: reason="Flikker Pro Anual", auto_recurring 12 meses / UYU 10000 / end_date presente', async () => {
      const fetchSpy = mockCreate({
        id: 'PREAPPROVAL-2',
        status: 'pending',
        init_point: 'https://mp.test/y',
      });
      const before = Date.now();
      await provider.createPendingSubscription({
        ...input,
        plan: CheckoutPlan.YEARLY,
      });

      const [, createInit] = fetchSpy.mock.calls[0];
      const body = JSON.parse(createInit!.body as string) as Record<
        string,
        unknown
      >;
      const autoRecurring = body.auto_recurring as Record<string, unknown>;
      expect(body.reason).toBe('Flikker Pro Anual');
      expect(autoRecurring.frequency).toBe(12);
      expect(autoRecurring.frequency_type).toBe('months');
      expect(autoRecurring.transaction_amount).toBe(10000);
      expect(autoRecurring.currency_id).toBe('UYU');
      expectEndDateFiveYearsFromNow(autoRecurring.end_date as string, before);
    });

    it('NUNCA manda preapproval_plan_id, card_token_id, start_date, free_trial, payment_method_id ni un status distinto de "pending"', async () => {
      const fetchSpy = mockCreate({
        id: 'PREAPPROVAL-1',
        status: 'pending',
        init_point: 'https://mp.test/x',
      });
      await provider.createPendingSubscription(input);

      const [, createInit] = fetchSpy.mock.calls[0];
      const body = JSON.parse(createInit!.body as string) as Record<
        string,
        unknown
      >;
      for (const forbidden of [
        'preapproval_plan_id',
        'card_token_id',
        'start_date',
        'free_trial',
        'payment_method_id',
      ]) {
        expect(Object.keys(body)).not.toContain(forbidden);
      }
      const autoRecurring = body.auto_recurring as Record<string, unknown>;
      expect(Object.keys(autoRecurring)).not.toContain('start_date');
      expect(Object.keys(autoRecurring)).not.toContain('free_trial');
      expect(body.status).toBe('pending');
    });

    it('manda X-Idempotency-Key con la key recibida en el POST de creación', async () => {
      const fetchSpy = mockCreate({
        id: 'PREAPPROVAL-1',
        status: 'pending',
        init_point: 'https://mp.test/x',
      });
      await provider.createPendingSubscription(input);

      const [, createInit] = fetchSpy.mock.calls[0];
      const headers = createInit!.headers as Record<string, string>;
      expect(headers['X-Idempotency-Key']).toBe('key-fixed-001');
    });

    it('nunca loguea el access token', async () => {
      mockCreate({
        id: 'PREAPPROVAL-1',
        status: 'pending',
        init_point: 'https://mp.test/x',
      });
      const warnSpy = jest
        .spyOn(
          (provider as unknown as { logger: { warn: () => void } }).logger,
          'warn',
        )
        .mockImplementation(() => undefined);
      const logSpy = jest
        .spyOn(
          (provider as unknown as { logger: { log: () => void } }).logger,
          'log',
        )
        .mockImplementation(() => undefined);
      await provider.createPendingSubscription(input);
      for (const call of [...warnSpy.mock.calls, ...logSpy.mock.calls]) {
        expect(JSON.stringify(call)).not.toContain('TEST-fake-token');
      }
    });

    it('devuelve providerSubscriptionId, providerStatus, checkoutUrl y externalReference de la respuesta real', async () => {
      mockCreate({
        id: 'PREAPPROVAL-999',
        status: 'pending',
        init_point: 'https://mp.test/checkout/999',
        external_reference: 'lead-abc-123',
      });
      const result = await provider.createPendingSubscription(input);
      expect(result).toEqual({
        providerSubscriptionId: 'PREAPPROVAL-999',
        providerStatus: 'pending',
        checkoutUrl: 'https://mp.test/checkout/999',
        externalReference: 'lead-abc-123',
      });
    });
  });

  describe('regresión del incidente 2026-09-30 — cero search, cero reuso, cero cancelación', () => {
    it('no existe ningún método de búsqueda o cancelación en este provider', () => {
      const proto = Object.getPrototypeOf(provider) as Record<string, unknown>;
      const methodNames = Object.getOwnPropertyNames(proto);
      for (const forbidden of [
        'findExistingSubscription',
        'search',
        'cancel',
        'cancelSubscription',
      ]) {
        expect(methodNames).not.toContain(forbidden);
      }
    });

    it('nunca hace un GET a /preapproval/search, sin importar el resultado del POST', async () => {
      const fetchSpy = mockCreate({
        id: 'PREAPPROVAL-1',
        status: 'pending',
        init_point: 'https://mp.test/x',
      });
      await provider.createPendingSubscription(input);

      for (const call of fetchSpy.mock.calls) {
        expect(call[0] as string).not.toContain('/preapproval/search');
      }
    });

    it('nunca hace un PUT ni DELETE contra /preapproval — solo POST', async () => {
      const fetchSpy = mockCreate({
        id: 'PREAPPROVAL-1',
        status: 'pending',
        init_point: 'https://mp.test/x',
      });
      await provider.createPendingSubscription(input);

      for (const call of fetchSpy.mock.calls) {
        const method = call[1]?.method;
        expect(method).not.toBe('PUT');
        expect(method).not.toBe('DELETE');
      }
    });
  });

  describe('errores del POST de creación — UN solo intento, nunca reintento ciego interno', () => {
    it('400 no reintenta, tira MercadoPagoSubscriptionError no-retryable (rechazo confirmado)', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: () =>
          Promise.resolve(
            JSON.stringify({ message: 'card_token_id is required' }),
          ),
      } as Response);

      await expect(
        provider.createPendingSubscription(input),
      ).rejects.toMatchObject({
        retryable: false,
        statusCode: 400,
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('503 tampoco reintenta acá adentro — retryable=true (ambiguo) es solo informativo para el caller', async () => {
      const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: () => Promise.resolve(''),
      } as Response);

      await expect(
        provider.createPendingSubscription(input),
      ).rejects.toMatchObject({
        retryable: true,
        statusCode: 503,
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('timeout/error de red: retryable=true (ambiguo), un solo intento', async () => {
      const fetchSpy = jest
        .spyOn(global, 'fetch')
        .mockRejectedValueOnce(new Error('timeout'));

      await expect(
        provider.createPendingSubscription(input),
      ).rejects.toMatchObject({
        retryable: true,
      });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('respuesta 2xx sin id/init_point: no-retryable (rechazo confirmado)', async () => {
      mockCreate({ id: '', status: 'pending', init_point: '' });
      await expect(
        provider.createPendingSubscription(input),
      ).rejects.toMatchObject({ retryable: false });
    });
  });
});

/**
 * `end_date` se calcula en cada llamada (`now + 5 años`) — un `toEqual`
 * exacto sería frágil. Verifica que es un ISO 8601 válido, aprox. 5 años
 * después del momento en que se disparó el request (con margen generoso
 * para no ser frágil por el propio tiempo de ejecución del test).
 */
function expectEndDateFiveYearsFromNow(endDate: string, calledAt: number) {
  expect(typeof endDate).toBe('string');
  const parsed = new Date(endDate).getTime();
  expect(Number.isNaN(parsed)).toBe(false);
  const fiveYearsMs = 5 * 365 * 24 * 60 * 60 * 1000;
  const marginMs = 3 * 24 * 60 * 60 * 1000; // margen por años bisiestos (hasta 2 dentro de 5 años).
  expect(parsed).toBeGreaterThan(calledAt + fiveYearsMs - marginMs);
  expect(parsed).toBeLessThan(calledAt + fiveYearsMs + marginMs);
}
