import { WaSenderApiProvider } from './wasender-api.provider';
import { WhatsAppProviderError } from '../whatsapp-provider';

describe('WaSenderApiProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetAllMocks();
    process.env = {
      ...originalEnv,
      WASENDER_API_KEY: 'key-1',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('sendText', () => {
    it('sends text and returns the provider message id, normalizing status to "accepted"', async () => {
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: { msgId: 100000, jid: '+59899123456', status: 'in_progress' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const result = await new WaSenderApiProvider().sendText({
        to: '+59899123456',
        text: 'Hola',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://www.wasenderapi.com/api/send-message',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer key-1',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ to: '+59899123456', text: 'Hola' }),
        }),
      );
      // `in_progress` (el valor real que devuelve WaSenderAPI) nunca se
      // filtra — el contrato normalizado solo conoce 'accepted'.
      expect(result).toEqual({
        providerMessageId: '100000',
        status: 'accepted',
      });
    });

    it('respects WASENDER_BASE_URL when set', async () => {
      process.env.WASENDER_BASE_URL = 'https://custom.example.com/';
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { msgId: 1 } }), {
          status: 200,
        }),
      );

      await new WaSenderApiProvider().sendText({
        to: '+59899123456',
        text: 'Hi',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://custom.example.com/api/send-message',
        expect.anything(),
      );
    });

    it('throws when WASENDER_API_KEY is missing (auth)', async () => {
      delete process.env.WASENDER_API_KEY;

      await expect(
        new WaSenderApiProvider().sendText({
          to: '+59899123456',
          text: 'Hola',
        }),
      ).rejects.toThrow('WASENDER_API_KEY is required');
    });

    it('maps a 422 (invalid recipient) to a sanitized WhatsAppProviderError', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            message: 'The to field format is invalid.',
            errors: { to: ['The to field format is invalid.'] },
          }),
          { status: 422 },
        ),
      );

      await expect(
        new WaSenderApiProvider().sendText({ to: 'not-a-phone', text: 'Hola' }),
      ).rejects.toMatchObject({
        constructor: WhatsAppProviderError,
        statusCode: 422,
        message: expect.stringContaining('invalid'),
      });
    });

    it('maps a 401 to a WhatsAppProviderError with statusCode 401', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ success: false, message: 'Unauthenticated' }),
          {
            status: 401,
          },
        ),
      );

      await expect(
        new WaSenderApiProvider().sendText({
          to: '+59899123456',
          text: 'Hola',
        }),
      ).rejects.toMatchObject({ statusCode: 401 });
    });

    it('maps a 429 to a WhatsAppProviderError with statusCode 429', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ success: false, message: 'Rate limited' }),
          {
            status: 429,
          },
        ),
      );

      await expect(
        new WaSenderApiProvider().sendText({
          to: '+59899123456',
          text: 'Hola',
        }),
      ).rejects.toMatchObject({ statusCode: 429 });
    });

    it('maps a 500 to a WhatsAppProviderError with statusCode 500', async () => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('{}', { status: 500 }));

      await expect(
        new WaSenderApiProvider().sendText({
          to: '+59899123456',
          text: 'Hola',
        }),
      ).rejects.toMatchObject({ statusCode: 500 });
    });

    it('maps an aborted (timeout) request to a WhatsAppProviderError without a status code', async () => {
      jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
        return Promise.reject(new DOMException('Aborted', 'AbortError'));
      });

      await expect(
        new WaSenderApiProvider().sendText({
          to: '+59899123456',
          text: 'Hola',
        }),
      ).rejects.toMatchObject({
        constructor: WhatsAppProviderError,
        message: expect.stringContaining('timed out'),
        statusCode: undefined,
      });
    });

    it('never logs the Authorization header or the API key on failure', async () => {
      const logSpy = jest
        .spyOn(console, 'warn')
        .mockImplementation(() => undefined);
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ success: false, message: 'boom' }), {
          status: 500,
        }),
      );

      await new WaSenderApiProvider()
        .sendText({ to: '+59899123456', text: 'Hola' })
        .catch(() => undefined);

      const loggedText = logSpy.mock.calls.flat().join(' ');
      expect(loggedText).not.toContain('key-1');
      expect(loggedText).not.toContain('Bearer');
    });
  });

  describe('isAvailable', () => {
    it('false when WASENDER_API_KEY is missing — never calls the status endpoint', async () => {
      delete process.env.WASENDER_API_KEY;
      const fetchMock = jest.spyOn(globalThis, 'fetch');

      await expect(new WaSenderApiProvider().isAvailable()).resolves.toBe(
        false,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('true when the key is present and the session reports "connected"', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 'connected' }), {
          status: 200,
        }),
      );

      await expect(new WaSenderApiProvider().isAvailable()).resolves.toBe(true);
    });

    it('false when the key is present but the session is disconnected — key alone is not "available"', async () => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 'disconnected' }), {
          status: 200,
        }),
      );

      await expect(new WaSenderApiProvider().isAvailable()).resolves.toBe(
        false,
      );
    });

    it('false (fails safe) when the status check itself fails', async () => {
      jest
        .spyOn(globalThis, 'fetch')
        .mockRejectedValue(new Error('network down'));

      await expect(new WaSenderApiProvider().isAvailable()).resolves.toBe(
        false,
      );
    });

    it('caches the session result — a second call within the TTL does not hit the network again', async () => {
      const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ status: 'connected' }), {
          status: 200,
        }),
      );
      const provider = new WaSenderApiProvider();

      await provider.isAvailable();
      await provider.isAvailable();

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
