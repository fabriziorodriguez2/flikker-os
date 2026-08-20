import { ReactivationFunnelSummaryService } from './reactivation-funnel-summary.service';
import type { ReactivationFunnelResult } from './reactivation-funnel';
import { AiProviderError } from '../ai/ai-provider.interface';

const NOW = new Date('2026-08-20T12:00:00.000Z');

function baseFunnel(): ReactivationFunnelResult {
  return {
    overall: {
      contacted: 40,
      returned: 10,
      recoveryRate: 0.25,
      averageDaysToReturn: 6,
      evidenceState: 'ENOUGH_DATA',
    },
    byArm: null,
  };
}

function makeDeps() {
  const cachedRow = {
    summaryText: 'Resumen viejo cacheado.',
    generatedAt: new Date('2026-08-19T12:00:00.000Z'), // 24h antes de NOW
  };
  const prisma = {
    reactivationFunnelSummary: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({
        summaryText: 'Resumen nuevo.',
        generatedAt: NOW,
      }),
    },
  };
  const funnel = { forBusiness: jest.fn().mockResolvedValue(baseFunnel()) };
  const provider = {
    configured: true,
    generateStructured: jest.fn().mockResolvedValue({
      data: {
        summary:
          'De 40 clientes contactados, 10 volvieron: 25% de recuperación.',
      },
      model: 'gpt-4o-mini',
      inputTokens: 60,
      outputTokens: 30,
      latencyMs: 400,
    }),
  };
  const gate = { check: jest.fn().mockResolvedValue({ allowed: true }) };
  const usage = { record: jest.fn().mockResolvedValue('event-1') };
  return { prisma, funnel, provider, gate, usage, cachedRow };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new ReactivationFunnelSummaryService(
    deps.prisma as never,
    deps.funnel as never,
    deps.provider as never,
    deps.gate as never,
    deps.usage as never,
  );
}

describe('ReactivationFunnelSummaryService', () => {
  it('gate rechazado sin nada cacheado: no rompe, devuelve null', async () => {
    const deps = makeDeps();
    deps.gate.check.mockResolvedValue({
      allowed: false,
      reasonCode: 'BUSINESS_DISABLED',
    });
    const service = makeService(deps);

    const result = await service.getSummary('biz-1', {}, NOW);

    expect(result).toBeNull();
    expect(deps.provider.generateStructured).not.toHaveBeenCalled();
  });

  it('cacheado dentro del TTL: devuelve el cache, nunca llama al provider ni recalcula el embudo', async () => {
    const deps = makeDeps();
    deps.prisma.reactivationFunnelSummary.findUnique.mockResolvedValue({
      ...deps.cachedRow,
      generatedAt: new Date(NOW.getTime() - 60 * 60 * 1000),
    });
    const service = makeService(deps);

    const result = await service.getSummary('biz-1', {}, NOW);

    expect(result?.summaryText).toBe('Resumen viejo cacheado.');
    expect(deps.provider.generateStructured).not.toHaveBeenCalled();
    expect(deps.funnel.forBusiness).not.toHaveBeenCalled();
  });

  it('forceRefresh llama al provider aunque esté dentro del TTL', async () => {
    const deps = makeDeps();
    deps.prisma.reactivationFunnelSummary.findUnique.mockResolvedValue({
      ...deps.cachedRow,
      generatedAt: new Date(NOW.getTime() - 60 * 60 * 1000),
    });
    const service = makeService(deps);

    const result = await service.getSummary(
      'biz-1',
      { forceRefresh: true },
      NOW,
    );

    expect(deps.gate.check).toHaveBeenCalledWith(
      'biz-1',
      'INSIGHT_EXPLANATION',
    );
    expect(deps.provider.generateStructured).toHaveBeenCalledTimes(1);
    expect(result?.summaryText).toBe('Resumen nuevo.');
  });

  it('un número no presente en el payload se rechaza — nunca se guarda ni se muestra', async () => {
    const deps = makeDeps();
    deps.provider.generateStructured.mockResolvedValue({
      data: { summary: 'Recuperaste al 99% de tus clientes.' },
      model: 'gpt-4o-mini',
      inputTokens: 60,
      outputTokens: 30,
      latencyMs: 400,
    });
    const service = makeService(deps);

    const result = await service.getSummary('biz-1', {}, NOW);

    expect(result).toBeNull();
    expect(deps.prisma.reactivationFunnelSummary.upsert).not.toHaveBeenCalled();
    expect(deps.usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, fallbackUsed: true }),
    );
  });

  it('resumen grounded: se guarda y se devuelve', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const result = await service.getSummary('biz-1', {}, NOW);

    expect(result?.summaryText).toBe('Resumen nuevo.');
    expect(deps.prisma.reactivationFunnelSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { businessId: 'biz-1' } }),
    );
  });

  it('el provider falla: cae al cache existente, nunca revienta', async () => {
    const deps = makeDeps();
    deps.prisma.reactivationFunnelSummary.findUnique.mockResolvedValue(
      deps.cachedRow,
    );
    deps.provider.generateStructured.mockRejectedValue(
      new AiProviderError('timeout', 'TIMEOUT'),
    );
    const service = makeService(deps);

    const result = await service.getSummary('biz-1', {}, NOW);

    expect(result?.summaryText).toBe('Resumen viejo cacheado.');
    expect(deps.usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, fallbackUsed: true }),
    );
  });

  it('nunca manda datos de cliente al provider — solo los agregados del embudo', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.getSummary('biz-1', {}, NOW);

    const call = deps.provider.generateStructured.mock.calls[0][0] as {
      userPayload: Record<string, unknown>;
    };
    const payloadKeys = JSON.stringify(call.userPayload);
    expect(payloadKeys).not.toMatch(/phone|email|customerName/i);
    expect(payloadKeys).toContain('contacted');
    expect(payloadKeys).toContain('recoveryRatePercent');
  });
});
