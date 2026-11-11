import { AiConfigService } from './ai-config.service';
import { AiProviderError } from './ai-provider.interface';
import type {
  AgentStreamEvent,
  AgentTurnRequest,
} from './ai-agent-provider.interface';
import {
  mapResponsesEvent,
  OpenAiProviderService,
} from './openai-provider.service';
import { SseParser } from './sse';

describe('SseParser', () => {
  it('arma eventos aunque lleguen partidos en cualquier corte', () => {
    const parser = new SseParser();
    expect(parser.push('event: a\nda')).toEqual([]);
    expect(parser.push('ta: {"x":1}\n')).toEqual([]);
    expect(parser.push('\nevent: b\r\ndata: 2\r\n\r\n')).toEqual([
      { event: 'a', data: '{"x":1}' },
      { event: 'b', data: '2' },
    ]);
  });

  it('ignora comentarios (heartbeats) y bloques sin data', () => {
    const parser = new SseParser();
    expect(parser.push(': ping\n\nevent: x\n\n')).toEqual([]);
  });

  it('une varias líneas data', () => {
    expect(new SseParser().push('data: a\ndata: b\n\n')).toEqual([
      { event: null, data: 'a\nb' },
    ]);
  });
});

describe('mapResponsesEvent', () => {
  it('traduce texto, llamadas a herramientas y cierre con uso', () => {
    expect(
      mapResponsesEvent(
        { type: 'response.output_text.delta', delta: 'Hola' },
        'm',
      ),
    ).toEqual({ type: 'text_delta', delta: 'Hola' });
    expect(
      mapResponsesEvent(
        {
          type: 'response.output_item.done',
          item: {
            type: 'function_call',
            call_id: 'c1',
            name: 'visit_trend',
            arguments: '{}',
          },
        },
        'm',
      ),
    ).toEqual({
      type: 'tool_call',
      callId: 'c1',
      name: 'visit_trend',
      arguments: '{}',
    });
    expect(
      mapResponsesEvent(
        {
          type: 'response.completed',
          response: {
            model: 'gpt-x',
            usage: { input_tokens: 10, output_tokens: 5 },
          },
        },
        'm',
      ),
    ).toEqual({
      type: 'completed',
      model: 'gpt-x',
      inputTokens: 10,
      outputTokens: 5,
      status: 'completed',
    });
  });

  it('ignora eventos que no le importan al orquestador', () => {
    expect(mapResponsesEvent({ type: 'response.created' }, 'm')).toBeNull();
    expect(
      mapResponsesEvent(
        { type: 'response.output_item.done', item: { type: 'message' } },
        'm',
      ),
    ).toBeNull();
  });

  it('una respuesta fallida o un error del stream tiran AiProviderError', () => {
    expect(() =>
      mapResponsesEvent(
        { type: 'response.failed', response: { error: { message: 'x' } } },
        'm',
      ),
    ).toThrow(AiProviderError);
    expect(() =>
      mapResponsesEvent({ type: 'error', message: 'rate limit' }, 'm'),
    ).toThrow(AiProviderError);
  });
});

describe('OpenAiProviderService.streamAgentTurn', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  function provider() {
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.AI_MODEL = 'gpt-test';
    return new OpenAiProviderService(new AiConfigService());
  }

  function request(signal = new AbortController().signal): AgentTurnRequest {
    return {
      useCase: 'INTELLIGENCE_AGENT_TURN',
      instructions: 'inst',
      input: [{ role: 'user', content: 'hola' }],
      tools: [
        {
          name: 'visit_trend',
          description: 'd',
          parameters: { type: 'object' },
        },
      ],
      toolChoice: 'auto',
      maxOutputTokens: 100,
      signal,
    };
  }

  function streamResponse(chunks: string[], status = 200) {
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream({
        start(controller) {
          chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
          controller.close();
        },
      }),
      { status },
    );
  }

  async function collect(gen: AsyncGenerator<AgentStreamEvent>) {
    const out: AgentStreamEvent[] = [];
    for await (const event of gen) out.push(event);
    return out;
  }

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  it('llama a la Responses API con herramientas estrictas, store:false y stream', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        streamResponse([
          'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"Ho"}\n\n',
          'data: {"type":"response.output_text.delta","delta":"la"}\n\ndata: {"type":"response.completed","response":{"usage":{"input_tokens":3,"output_tokens":2}}}\n\n',
        ]),
      );
    global.fetch = fetchMock;

    const events = await collect(provider().streamAgentTurn(request()));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: 'gpt-test',
      stream: true,
      store: false,
      tool_choice: 'auto',
      instructions: 'inst',
    });
    expect(body.tools).toEqual([
      {
        type: 'function',
        name: 'visit_trend',
        description: 'd',
        parameters: { type: 'object' },
        strict: true,
      },
    ]);
    expect(events).toEqual([
      { type: 'text_delta', delta: 'Ho' },
      { type: 'text_delta', delta: 'la' },
      {
        type: 'completed',
        model: 'gpt-test',
        inputTokens: 3,
        outputTokens: 2,
        status: 'completed',
      },
    ]);
  });

  it('usa el modelo del pedido y omite temperature en modelos de razonamiento', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementation(() =>
        Promise.resolve(
          streamResponse([
            'data: {"type":"response.completed","response":{"usage":{"input_tokens":1,"output_tokens":1}}}\n\n',
          ]),
        ),
      );
    global.fetch = fetchMock;
    const service = provider();

    await collect(
      service.streamAgentTurn({ ...request(), model: 'gpt-5-mini' }),
    );
    await collect(service.streamAgentTurn({ ...request(), model: 'gpt-4.1' }));

    const bodies = fetchMock.mock.calls.map(
      ([, init]) =>
        JSON.parse((init as RequestInit).body as string) as Record<
          string,
          unknown
        >,
    );
    expect(bodies[0].model).toBe('gpt-5-mini');
    expect(bodies[0]).not.toHaveProperty('temperature');
    expect(bodies[1]).toMatchObject({ model: 'gpt-4.1', temperature: 0.3 });
  });

  it('puede obligar a llamar una herramienta puntual', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValue(
        streamResponse([
          'data: {"type":"response.completed","response":{"usage":{"input_tokens":1,"output_tokens":1}}}\n\n',
        ]),
      );
    global.fetch = fetchMock;
    await collect(
      provider().streamAgentTurn({
        ...request(),
        toolChoice: { name: 'submit_plans' },
      }),
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      tool_choice: { type: 'function', name: 'submit_plans' },
    });
  });

  it('un HTTP de error es AiProviderError, sin exponer la key', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(new Response('quota', { status: 429 }));
    await expect(
      collect(provider().streamAgentTurn(request())),
    ).rejects.toMatchObject({
      reason: 'HTTP_ERROR',
    });
  });

  it('si el stream se corta sin cierre, es una respuesta inválida', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        streamResponse([
          'data: {"type":"response.output_text.delta","delta":"x"}\n\n',
        ]),
      );
    await expect(
      collect(provider().streamAgentTurn(request())),
    ).rejects.toMatchObject({
      reason: 'INVALID_RESPONSE',
    });
  });

  it('un abort se reporta como TIMEOUT (el orquestador distingue usuario vs. reloj)', async () => {
    const controller = new AbortController();
    controller.abort();
    global.fetch = jest
      .fn()
      .mockRejectedValue(new DOMException('aborted', 'AbortError'));
    await expect(
      collect(provider().streamAgentTurn(request(controller.signal))),
    ).rejects.toMatchObject({ reason: 'TIMEOUT' });
  });

  it('sin API key nunca llama a OpenAI', async () => {
    delete process.env.OPENAI_API_KEY;
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    const unconfigured = new OpenAiProviderService(new AiConfigService());
    await expect(
      collect(unconfigured.streamAgentTurn(request())),
    ).rejects.toMatchObject({
      reason: 'NOT_CONFIGURED',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
