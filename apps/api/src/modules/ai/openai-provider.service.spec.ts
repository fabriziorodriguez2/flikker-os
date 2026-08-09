import { OpenAiProviderService } from './openai-provider.service';
import { AiProviderError } from './ai-provider.interface';
import { AI_USE_CASES } from './ai-usecases';

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    useCase: AI_USE_CASES.RETENTION_MESSAGE,
    systemPrompt: 'system',
    userPayload: { businessName: 'Café Uno' },
    schema: { name: 'x', schema: { type: 'object' } },
    promptVersion: 'v1',
    temperature: 0.5,
    maxOutputTokens: 100,
    timeoutMs: 3_000,
    ...overrides,
  };
}

function configuredConfig() {
  return { apiKey: 'sk-test', model: 'gpt-4o-mini', providerConfigured: true };
}

describe('OpenAiProviderService — Fase F §2/§32: plain fetch, no SDK', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('is not configured when there is no API key', () => {
    const provider = new OpenAiProviderService({
      apiKey: null,
      model: 'gpt-4o-mini',
      providerConfigured: false,
    } as never);
    expect(provider.configured).toBe(false);
  });

  it('throws AiProviderError(NOT_CONFIGURED) instead of ever calling fetch', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');
    const provider = new OpenAiProviderService({
      apiKey: null,
      model: 'gpt-4o-mini',
      providerConfigured: false,
    } as never);

    await expect(
      provider.generateStructured(makeRequest()),
    ).rejects.toMatchObject({
      reason: 'NOT_CONFIGURED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls the Chat Completions endpoint with structured-output json_schema and parses the result', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"text":"Hola!"}' } }],
          usage: { prompt_tokens: 40, completion_tokens: 8 },
        }),
        { status: 200 },
      ),
    );
    const provider = new OpenAiProviderService(configuredConfig() as never);

    const result = await provider.generateStructured<{ text: string }>(
      makeRequest(),
    );

    expect(result.data).toEqual({ text: 'Hola!' });
    expect(result.inputTokens).toBe(40);
    expect(result.outputTokens).toBe(8);
    expect(result.model).toBe('gpt-4o-mini');

    const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer sk-test',
    });
  });

  it('sends the user payload as data in its own message, never merged into the system prompt', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"text":"ok"}' } }],
        }),
        { status: 200 },
      ),
    );
    const provider = new OpenAiProviderService(configuredConfig() as never);

    await provider.generateStructured(
      makeRequest({
        userPayload: { businessName: 'Café Uno', toneOfVoice: 'cálido' },
      }),
    );

    const [, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0]).toEqual({ role: 'system', content: 'system' });
    expect(body.messages[1].role).toBe('user');
    expect(JSON.parse(body.messages[1].content)).toEqual({
      businessName: 'Café Uno',
      toneOfVoice: 'cálido',
    });
  });

  it('throws AiProviderError(HTTP_ERROR) on a non-2xx response', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'rate limited' }), {
        status: 429,
      }),
    );
    const provider = new OpenAiProviderService(configuredConfig() as never);

    await expect(
      provider.generateStructured(makeRequest()),
    ).rejects.toMatchObject({
      reason: 'HTTP_ERROR',
    });
  });

  it('throws AiProviderError(INVALID_RESPONSE) when the message content is not valid JSON', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: 'not json at all' } }],
        }),
        { status: 200 },
      ),
    );
    const provider = new OpenAiProviderService(configuredConfig() as never);

    await expect(
      provider.generateStructured(makeRequest()),
    ).rejects.toMatchObject({
      reason: 'INVALID_RESPONSE',
    });
  });

  it('throws AiProviderError(INVALID_RESPONSE) when there are no choices at all', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ choices: [] }), { status: 200 }),
      );
    const provider = new OpenAiProviderService(configuredConfig() as never);

    await expect(
      provider.generateStructured(makeRequest()),
    ).rejects.toBeInstanceOf(AiProviderError);
  });

  it('throws AiProviderError(TIMEOUT) when the request does not resolve in time (Fase F §28)', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation((_url, options) => {
      const signal = (options as RequestInit).signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          reject(err);
        });
      });
    });
    const provider = new OpenAiProviderService(configuredConfig() as never);

    await expect(
      provider.generateStructured(makeRequest({ timeoutMs: 20 })),
    ).rejects.toMatchObject({ reason: 'TIMEOUT' });
  });
});
