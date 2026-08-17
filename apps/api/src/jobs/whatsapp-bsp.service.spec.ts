import { WhatsAppBspService } from './whatsapp-bsp.service';
import { resetWhatsAppProviderCache } from './whatsapp-provider.factory';

/**
 * `WhatsAppBspService` ya no habla con WHAPI directo — delega en el
 * `WhatsAppProvider` activo (ver `whatsapp-provider.factory.ts`). Los tests
 * de "manda bien el fetch/headers/body" viven ahora en
 * `providers/whapi.provider.spec.ts` y `providers/wasender-api.provider.spec.ts`
 * — acá solo se prueba que la delegación y el contrato público (sin cambios
 * para ~15 consumidores) sigan intactos.
 */
describe('WhatsAppBspService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = { ...originalEnv };
    resetWhatsAppProviderCache();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
    resetWhatsAppProviderCache();
  });

  it('sends through Whapi by default (WHATSAPP_PROVIDER unset) and keeps the whatsappMessageId contract', async () => {
    process.env.WHAPI_TOKEN = 'token-1';
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'whapi-message-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await new WhatsAppBspService().sendText({
      phone: '+59899123456',
      text: 'Hola',
    });

    expect(result).toEqual({ whatsappMessageId: 'whapi-message-1' });
  });

  it('sends through WaSenderAPI when WHATSAPP_PROVIDER=wasender — same public contract', async () => {
    process.env.WHATSAPP_PROVIDER = 'wasender';
    process.env.WASENDER_API_KEY = 'key-1';
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { msgId: 42, status: 'in_progress' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await new WhatsAppBspService().sendText({
      phone: '+59899123456',
      text: 'Hola',
    });

    // Mismo shape que devolvía siempre — ningún consumidor tuvo que cambiar.
    expect(result).toEqual({ whatsappMessageId: '42' });
  });

  it('sendReviewRequest composes the same template regardless of provider', async () => {
    process.env.WHAPI_TOKEN = 'token-1';
    const fetchMock = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ id: 'whapi-1' }), { status: 200 }),
      );

    await new WhatsAppBspService().sendReviewRequest({
      phone: '+59899123456',
      customerName: 'Ana',
      clinicName: 'Clínica X',
      trackingUrl: 'https://flikker.site/r/abc',
    });

    const [, init] = fetchMock.mock.calls[0];
    const rawBody = (init as RequestInit).body;
    const body = JSON.parse(typeof rawBody === 'string' ? rawBody : '{}');
    expect(body.body).toContain('Ana');
    expect(body.body).toContain('Clínica X');
    expect(body.body).toContain('https://flikker.site/r/abc');
  });

  describe('isChannelAvailable', () => {
    it('true when the active provider (default Whapi) is configured', async () => {
      process.env.WHAPI_TOKEN = 'token-1';
      await expect(new WhatsAppBspService().isChannelAvailable()).resolves.toBe(
        true,
      );
    });

    it('false when the active provider is not configured', async () => {
      delete process.env.WHAPI_TOKEN;
      await expect(new WhatsAppBspService().isChannelAvailable()).resolves.toBe(
        false,
      );
    });

    it('reflects WaSenderAPI availability when that provider is active', async () => {
      process.env.WHATSAPP_PROVIDER = 'wasender';
      process.env.WASENDER_API_KEY = 'key-1';
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 'connected' }), {
          status: 200,
        }),
      );

      await expect(new WhatsAppBspService().isChannelAvailable()).resolves.toBe(
        true,
      );
    });
  });
});
