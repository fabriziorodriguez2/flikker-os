import { CustomerSegment } from '@prisma/client';
import { BusinessInsightSummaryService } from './business-insight-summary.service';
import type { InsightsMetricsBundle } from './insights-narrator';
import { AiProviderError } from '../ai/ai-provider.interface';

const NOW = new Date('2026-08-20T12:00:00.000Z');

function baseBundle(): InsightsMetricsBundle {
  return {
    totalCustomers: 51,
    newCustomersInWindow: 12,
    windowDays: 30,
    returningCustomers: 17,
    segmentCounts: {
      [CustomerSegment.NEW]: 12,
      [CustomerSegment.REPEAT]: 10,
      [CustomerSegment.FREQUENT]: 5,
      [CustomerSegment.AT_RISK]: 8,
      [CustomerSegment.INACTIVE]: 14,
      [CustomerSegment.RECOVERED]: 2,
    },
    visitTrend: [],
    visitTiming: [],
    stampCard: {
      customersParticipating: 20,
      cardsInProgress: 8,
      unlockedTotal: 5,
      redeemedTotal: 3,
    },
    stampCardImpact: {
      participants: { total: 20, returning: 15 },
      nonParticipants: { total: 31, returning: 10 },
    },
    benefitStats: [],
    promotionStats: [],
    reactivationFunnel: {
      overall: {
        contacted: 0,
        returned: 0,
        recoveryRate: 0,
        averageDaysToReturn: null,
        evidenceState: 'INSUFFICIENT_DATA',
      },
      byArm: null,
    },
    reviewStats: {
      total: 40,
      sinceFlikker: 12,
      rating: 4.6,
      inPeriod: 3,
      feedbackInPeriod: 1,
    },
  };
}

function makeDeps() {
  const cachedRow = {
    summaryText: 'Resumen viejo cacheado.',
    recommendations: ['Recomendación vieja'],
    generatedAt: new Date('2026-08-19T12:00:00.000Z'), // 24h antes de NOW
  };
  const prisma = {
    businessInsightSummary: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({
        summaryText: 'Resumen nuevo.',
        recommendations: ['Reactivar clientes inactivos'],
        generatedAt: NOW,
      }),
    },
  };
  const insights = {
    getMetricsBundle: jest.fn().mockResolvedValue(baseBundle()),
  };
  const provider = {
    configured: true,
    generateStructured: jest.fn().mockResolvedValue({
      data: {
        summary:
          'Este mes recibiste 12 clientes nuevos y 17 volvieron a visitarte.',
        // 22 = segmentCounts.AT_RISK (8) + INACTIVE (14), expuesto en el
        // payload como `atRiskOrInactiveCustomers` — el único número de
        // "en riesgo" que realmente viaja a la IA.
        recommendations: ['Reactivar a los 22 clientes en riesgo'],
      },
      model: 'gpt-4o-mini',
      inputTokens: 100,
      outputTokens: 50,
      latencyMs: 500,
    }),
  };
  const gate = { check: jest.fn().mockResolvedValue({ allowed: true }) };
  const usage = { record: jest.fn().mockResolvedValue('event-1') };
  return { prisma, insights, provider, gate, usage, cachedRow };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new BusinessInsightSummaryService(
    deps.prisma as never,
    deps.insights as never,
    deps.provider as never,
    deps.gate as never,
    deps.usage as never,
  );
}

describe('BusinessInsightSummaryService', () => {
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

  it('gate rechazado con algo cacheado: devuelve lo cacheado, nunca llama al provider', async () => {
    const deps = makeDeps();
    deps.prisma.businessInsightSummary.findUnique.mockResolvedValue(
      deps.cachedRow,
    );
    deps.gate.check.mockResolvedValue({
      allowed: false,
      reasonCode: 'BUSINESS_DISABLED',
    });
    const service = makeService(deps);

    const result = await service.getSummary('biz-1', {}, NOW);

    expect(result?.summaryText).toBe('Resumen viejo cacheado.');
    expect(deps.provider.generateStructured).not.toHaveBeenCalled();
  });

  it('cacheado dentro del TTL (24h): devuelve el cache, nunca llama al provider', async () => {
    const deps = makeDeps();
    deps.prisma.businessInsightSummary.findUnique.mockResolvedValue({
      ...deps.cachedRow,
      generatedAt: new Date(NOW.getTime() - 60 * 60 * 1000), // hace 1h
    });
    const service = makeService(deps);

    const result = await service.getSummary('biz-1', {}, NOW);

    expect(result?.summaryText).toBe('Resumen viejo cacheado.');
    expect(deps.provider.generateStructured).not.toHaveBeenCalled();
    expect(deps.gate.check).not.toHaveBeenCalled();
  });

  it('"Actualizar análisis" (forceRefresh) llama al provider aunque esté dentro del TTL, y sigue pasando por el gate', async () => {
    const deps = makeDeps();
    deps.prisma.businessInsightSummary.findUnique.mockResolvedValue({
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
      'WEEKLY_REPORT_SUMMARY',
    );
    expect(deps.provider.generateStructured).toHaveBeenCalledTimes(1);
    expect(result?.summaryText).toBe('Resumen nuevo.');
    expect(deps.prisma.businessInsightSummary.upsert).toHaveBeenCalled();
  });

  it('el provider falla (timeout): cae al cache existente, nunca revienta', async () => {
    const deps = makeDeps();
    deps.prisma.businessInsightSummary.findUnique.mockResolvedValue(
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

  it('una recomendación con un número no presente en el payload se rechaza — nunca se guarda', async () => {
    const deps = makeDeps();
    deps.provider.generateStructured.mockResolvedValue({
      data: {
        summary: 'Resumen válido sin números inventados.',
        recommendations: ['Reactivar a los 999 clientes en riesgo'],
      },
      model: 'gpt-4o-mini',
      inputTokens: 100,
      outputTokens: 50,
      latencyMs: 500,
    });
    const service = makeService(deps);

    const result = await service.getSummary('biz-1', {}, NOW);

    expect(result).toBeNull(); // sin cache previo
    expect(deps.prisma.businessInsightSummary.upsert).not.toHaveBeenCalled();
    expect(deps.usage.record).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, fallbackUsed: true }),
    );
  });

  it('resumen y recomendaciones grounded: se guarda y se devuelve', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const result = await service.getSummary('biz-1', {}, NOW);

    expect(result?.summaryText).toBe('Resumen nuevo.');
    expect(deps.prisma.businessInsightSummary.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { businessId: 'biz-1' },
      }),
    );
  });

  it('el payload trae el KPI real de reactivación (reusado de ReactivationFunnelService, nunca recalculado)', async () => {
    const deps = makeDeps();
    deps.insights.getMetricsBundle.mockResolvedValue({
      ...baseBundle(),
      reactivationFunnel: {
        overall: {
          contacted: 24,
          returned: 7,
          recoveryRate: 7 / 24,
          averageDaysToReturn: 5,
          evidenceState: 'ENOUGH_DATA',
        },
        byArm: null,
      },
    });
    const service = makeService(deps);

    await service.getSummary('biz-1', {}, NOW);

    const call = deps.provider.generateStructured.mock.calls[0][0] as {
      userPayload: { reactivation: unknown };
    };
    expect(call.userPayload.reactivation).toEqual({
      contacted: 24,
      returned: 7,
      recoveryRatePercent: 29.2,
    });
  });

  it('sin nadie contactado todavía, reactivation es null (nunca un 0% inventado)', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.getSummary('biz-1', {}, NOW);

    const call = deps.provider.generateStructured.mock.calls[0][0] as {
      userPayload: { reactivation: unknown };
    };
    expect(call.userPayload.reactivation).toBeNull();
  });

  it('nunca manda teléfono/email/nombre de cliente al provider — solo agregados', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.getSummary('biz-1', {}, NOW);

    const call = deps.provider.generateStructured.mock.calls[0][0] as {
      userPayload: Record<string, unknown>;
    };
    const payloadKeys = JSON.stringify(call.userPayload);
    expect(payloadKeys).not.toMatch(/phone|email|customerName/i);
  });
});
