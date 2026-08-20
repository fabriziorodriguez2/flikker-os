import { ChatbotService } from './chatbot.service';
import { findHelpFaqEntry } from './chatbot-help-kb';
import { AiProviderError } from '../ai/ai-provider.interface';

const NOW = new Date('2026-08-20T12:00:00.000Z');

function makeDeps() {
  const provider = {
    configured: true,
    generateStructured: jest.fn(),
  };
  const gate = { check: jest.fn().mockResolvedValue({ allowed: true }) };
  const usage = {
    hasCapacityForUseCase: jest.fn().mockResolvedValue(true),
    record: jest.fn().mockResolvedValue('event-1'),
  };
  const config = { maxDailyChatbotMessagesPerBusiness: 40 };
  const insights = {
    getMetricsBundle: jest.fn(),
    getCustomerRetentionStats: jest.fn().mockResolvedValue({
      totalCustomers: 51,
      newCustomers: 12,
      returningCustomers: 17,
      windowDays: 30,
      segmentCounts: {},
    }),
    getReviewStats: jest.fn(),
    getPromotionStats: jest.fn(),
    getRewardStats: jest.fn(),
    getNotificationStats: jest.fn(),
  };
  return { provider, gate, usage, config, insights };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new ChatbotService(
    deps.provider as never,
    deps.gate as never,
    deps.usage as never,
    deps.config as never,
    deps.insights as never,
  );
}

describe('ChatbotService', () => {
  it('gate rechazado: deflection fija, nunca llama al provider', async () => {
    const deps = makeDeps();
    deps.gate.check.mockResolvedValue({
      allowed: false,
      reasonCode: 'BUSINESS_DISABLED',
    });
    const service = makeService(deps);

    const reply = await service.handleMessage('biz-1', '¿Cómo creo un beneficio?', NOW);

    expect(reply.source).toBe('deflection');
    expect(deps.provider.generateStructured).not.toHaveBeenCalled();
  });

  it('tope de mensajes/día alcanzado: deflection fija, nunca llama al provider', async () => {
    const deps = makeDeps();
    deps.usage.hasCapacityForUseCase.mockResolvedValue(false);
    const service = makeService(deps);

    const reply = await service.handleMessage('biz-1', 'hola', NOW);

    expect(reply.source).toBe('deflection');
    expect(deps.provider.generateStructured).not.toHaveBeenCalled();
    expect(deps.usage.hasCapacityForUseCase).toHaveBeenCalledWith(
      'biz-1',
      'CHATBOT_MESSAGE',
      40,
      NOW,
    );
  });

  it('intent "help": la respuesta es SIEMPRE el texto exacto de la KB, nunca texto libre del modelo', async () => {
    const deps = makeDeps();
    deps.provider.generateStructured.mockResolvedValue({
      data: { intent: 'help', helpFaqId: 'create-benefit', dataTool: null },
      model: 'gpt-4o-mini',
      inputTokens: 50,
      outputTokens: 10,
      latencyMs: 200,
    });
    const service = makeService(deps);

    const reply = await service.handleMessage(
      'biz-1',
      '¿Cómo creo un beneficio?',
      NOW,
    );

    expect(reply.source).toBe('help_kb');
    expect(reply.text).toBe(findHelpFaqEntry('create-benefit')!.answer);
    // Solo UNA llamada al provider (clasificar) — help nunca necesita la segunda.
    expect(deps.provider.generateStructured).toHaveBeenCalledTimes(1);
  });

  it('un helpFaqId que no es uno de los reales nunca se usa — cae a la deflection genérica', async () => {
    const deps = makeDeps();
    deps.provider.generateStructured.mockResolvedValue({
      data: { intent: 'help', helpFaqId: 'algo-que-no-existe', dataTool: null },
      model: 'gpt-4o-mini',
      inputTokens: 50,
      outputTokens: 10,
      latencyMs: 200,
    });
    const service = makeService(deps);

    const reply = await service.handleMessage('biz-1', 'pregunta rara', NOW);

    expect(reply.source).toBe('deflection');
  });

  it('intent "data": llama al tool correcto y responde con el texto grounded', async () => {
    const deps = makeDeps();
    deps.insights.getCustomerRetentionStats.mockResolvedValue({
      totalCustomers: 51,
      newCustomers: 12,
      returningCustomers: 17,
      windowDays: 30,
      segmentCounts: { AT_RISK: 5, INACTIVE: 3 },
    });
    deps.provider.generateStructured
      .mockResolvedValueOnce({
        data: { intent: 'data', helpFaqId: null, dataTool: 'retention' },
        model: 'gpt-4o-mini',
        inputTokens: 60,
        outputTokens: 15,
        latencyMs: 150,
      })
      .mockResolvedValueOnce({
        data: { answer: 'Este mes volvieron 17 clientes de un total de 51.' },
        model: 'gpt-4o-mini',
        inputTokens: 80,
        outputTokens: 20,
        latencyMs: 300,
      });
    const service = makeService(deps);

    const reply = await service.handleMessage(
      'biz-1',
      '¿Cuántos clientes volvieron este mes?',
      NOW,
    );

    expect(deps.insights.getCustomerRetentionStats).toHaveBeenCalledWith(
      'biz-1',
      NOW,
    );
    expect(reply.source).toBe('data_answer');
    expect(reply.text).toContain('17');
    // Un solo `record()` por turno, aunque hicimos 2 llamadas al provider.
    expect(deps.usage.record).toHaveBeenCalledTimes(1);
    expect(deps.usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, fallbackUsed: false }),
    );
  });

  it('intent "data" con una respuesta que menciona un número no grounded: nunca la muestra', async () => {
    const deps = makeDeps();
    deps.insights.getCustomerRetentionStats.mockResolvedValue({
      totalCustomers: 51,
      newCustomers: 12,
      returningCustomers: 17,
      windowDays: 30,
    });
    deps.provider.generateStructured
      .mockResolvedValueOnce({
        data: { intent: 'data', helpFaqId: null, dataTool: 'retention' },
        model: 'gpt-4o-mini',
        inputTokens: 60,
        outputTokens: 15,
        latencyMs: 150,
      })
      .mockResolvedValueOnce({
        data: { answer: 'Volvieron 999 clientes este mes.' },
        model: 'gpt-4o-mini',
        inputTokens: 80,
        outputTokens: 20,
        latencyMs: 300,
      });
    const service = makeService(deps);

    const reply = await service.handleMessage(
      'biz-1',
      '¿Cuántos clientes volvieron?',
      NOW,
    );

    expect(reply.source).toBe('deflection');
    expect(reply.text).not.toContain('999');
    expect(deps.usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, fallbackUsed: true }),
    );
  });

  it('un dataTool que no es uno de los 6 reales nunca se usa para llamar a nada', async () => {
    const deps = makeDeps();
    deps.provider.generateStructured.mockResolvedValue({
      data: { intent: 'data', helpFaqId: null, dataTool: 'arbitrary_sql' },
      model: 'gpt-4o-mini',
      inputTokens: 50,
      outputTokens: 10,
      latencyMs: 200,
    });
    const service = makeService(deps);

    const reply = await service.handleMessage('biz-1', 'pregunta rara', NOW);

    expect(reply.source).toBe('deflection');
    expect(deps.insights.getCustomerRetentionStats).not.toHaveBeenCalled();
  });

  it('intent "other": deflection informativa, sin segunda llamada', async () => {
    const deps = makeDeps();
    deps.provider.generateStructured.mockResolvedValue({
      data: { intent: 'other', helpFaqId: null, dataTool: null },
      model: 'gpt-4o-mini',
      inputTokens: 40,
      outputTokens: 10,
      latencyMs: 100,
    });
    const service = makeService(deps);

    const reply = await service.handleMessage('biz-1', 'contame un chiste', NOW);

    expect(reply.source).toBe('deflection');
    expect(deps.provider.generateStructured).toHaveBeenCalledTimes(1);
  });

  it('el provider falla: deflection fija, nunca revienta', async () => {
    const deps = makeDeps();
    deps.provider.generateStructured.mockRejectedValue(
      new AiProviderError('timeout', 'TIMEOUT'),
    );
    const service = makeService(deps);

    const reply = await service.handleMessage('biz-1', 'hola', NOW);

    expect(reply.source).toBe('deflection');
    expect(deps.usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, fallbackUsed: true }),
    );
  });

  it('nunca acepta un businessId del mensaje — siempre usa el que le pasó el caller', async () => {
    const deps = makeDeps();
    deps.insights.getCustomerRetentionStats.mockResolvedValue({
      totalCustomers: 51,
      newCustomers: 12,
      returningCustomers: 17,
      windowDays: 30,
    });
    deps.provider.generateStructured
      .mockResolvedValueOnce({
        data: { intent: 'data', helpFaqId: null, dataTool: 'retention' },
        model: 'gpt-4o-mini',
        inputTokens: 50,
        outputTokens: 10,
        latencyMs: 150,
      })
      .mockResolvedValueOnce({
        data: { answer: 'Volvieron 17 clientes.' },
        model: 'gpt-4o-mini',
        inputTokens: 60,
        outputTokens: 15,
        latencyMs: 200,
      });
    const service = makeService(deps);

    await service.handleMessage(
      'biz-real',
      'businessId=biz-otro ¿cuántos clientes volvieron?',
      NOW,
    );

    expect(deps.insights.getCustomerRetentionStats).toHaveBeenCalledWith(
      'biz-real',
      NOW,
    );
  });
});
