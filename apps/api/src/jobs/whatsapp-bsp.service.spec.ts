import { WhatsAppBspService } from './whatsapp-bsp.service';

describe('WhatsAppBspService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...originalEnv,
      WHAPI_TOKEN: 'token-1',
      WHAPI_BASE_URL: 'https://gate.whapi.cloud',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('sends text messages through Whapi', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'whapi-message-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await new WhatsAppBspService().sendText({
      phone: '+598 99 123 456',
      text: 'Hola',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://gate.whapi.cloud/messages/text',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: '+59899123456',
          body: 'Hola',
        }),
      },
    );
    expect(result).toEqual({ whatsappMessageId: 'whapi-message-1' });
  });

  it('throws when WHAPI_TOKEN is missing', async () => {
    delete process.env.WHAPI_TOKEN;

    await expect(
      new WhatsAppBspService().sendText({
        phone: '+59899123456',
        text: 'Hola',
      }),
    ).rejects.toThrow('WHAPI_TOKEN is required');
  });
});
