import { WhapiProvider } from './whapi.provider';
import { WhatsAppProviderError } from '../whatsapp-provider';

describe('WhapiProvider', () => {
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

  it('sends text and returns the provider message id', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'whapi-message-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await new WhapiProvider().sendText({
      to: '+598 99 123 456',
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
        body: JSON.stringify({ to: '59899123456', body: 'Hola' }),
      },
    );
    expect(result).toEqual({
      providerMessageId: 'whapi-message-1',
      status: 'accepted',
    });
  });

  it('throws when WHAPI_TOKEN is missing (auth)', async () => {
    delete process.env.WHAPI_TOKEN;

    await expect(
      new WhapiProvider().sendText({ to: '+59899123456', text: 'Hola' }),
    ).rejects.toThrow('WHAPI_TOKEN is required');
  });

  it('surfaces a 401 as a WhatsAppProviderError with the status code', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
      }),
    );

    await expect(
      new WhapiProvider().sendText({ to: '+59899123456', text: 'Hola' }),
    ).rejects.toMatchObject({
      constructor: WhatsAppProviderError,
      statusCode: 401,
    });
  });

  it('surfaces a 500 as a retryable WhatsAppProviderError', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 500 }));

    await expect(
      new WhapiProvider().sendText({ to: '+59899123456', text: 'Hola' }),
    ).rejects.toMatchObject({ statusCode: 500 });
  });

  describe('isAvailable', () => {
    it('true when WHAPI_TOKEN is set', async () => {
      await expect(new WhapiProvider().isAvailable()).resolves.toBe(true);
    });

    it('false when WHAPI_TOKEN is missing', async () => {
      delete process.env.WHAPI_TOKEN;
      await expect(new WhapiProvider().isAvailable()).resolves.toBe(false);
    });
  });
});
