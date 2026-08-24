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
    // Distinto de `stampCard.redeemedTotal` a propósito: uno es de los
    // últimos 30 días y el otro es acumulado desde siempre.
    benefitsRedeemedInWindow: 1,
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
    // Los tres números son deliberadamente distintos: es la única forma de
    // demostrar que no se sustituyen entre sí. En producción el resumen
    // decía "el comercio cuenta con 60 reseñas" (las importadas) cuando en
    // Google tenía 194.
    reviewStats: {
      googleReviewsTotal: 194,
      googleReviewsImported: 60,
      sinceFlikker: 3,
      googleRating: 3.5,
      importedRating: 3.9,
      historySyncStatus: 'partial' as const,
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

  /**
   * El bug real que reportó el dueño: Inicio mostraba "Beneficios canjeados:
   * 0 · En 30 días" y el Resumen, en la misma pantalla, decía "En el último
   * mes... han redimido 1 beneficio". Los dos números eran correctos —
   * `stampCard.redeemedTotal` es acumulado desde siempre y el KPI mira 30
   * días — pero el payload no marcaba el alcance de cada uno, así que el
   * modelo los presentaba a todos bajo "el último mes".
   */
  describe('alcance temporal de cada métrica', () => {
    async function payloadOf() {
      const deps = makeDeps();
      await makeService(deps).getSummary('biz-1', {}, NOW);
      return (
        deps.provider.generateStructured.mock.calls[0][0] as {
          userPayload: Record<string, unknown>;
        }
      ).userPayload;
    }

    it('el nombre de cada campo dice si es de la ventana o de siempre', async () => {
      const payload = await payloadOf();

      // Nada ambiguo: todo acumulado dice "Lifetime", todo lo de la ventana
      // dice "InWindow". Un campo sin sufijo es exactamente lo que causó el
      // bug, así que no puede volver a aparecer.
      expect(payload).toMatchObject({
        windowDays: 30,
        newCustomersInWindow: 12,
        returningCustomersInWindow: 17,
        benefitsRedeemedInWindow: 1,
        benefitsRedeemedLifetime: expect.any(Number),
        stampCardLifetime: expect.any(Object),
      });
      expect(payload).not.toHaveProperty('stampCard');
      expect(payload).not.toHaveProperty('benefitsRedeemedTotal');
      expect(payload).not.toHaveProperty('newCustomers');
    });

    it('el número de la ventana es el de Inicio, no el acumulado de la tarjeta', async () => {
      const payload = await payloadOf();

      // El fixture los tiene distintos a propósito (1 vs 3): si alguien
      // volviera a mandar el acumulado como si fuera del mes, esto lo caza.
      expect(payload.benefitsRedeemedInWindow).toBe(1);
      expect(
        (payload.stampCardLifetime as { redeemedTotal: number }).redeemedTotal,
      ).toBe(3);
    });

    it('el prompt le prohíbe al modelo cruzar los dos alcances', async () => {
      const deps = makeDeps();
      await makeService(deps).getSummary('biz-1', {}, NOW);

      const call = deps.provider.generateStructured.mock.calls[0][0] as {
        systemPrompt: string;
      };
      expect(call.systemPrompt).toContain('InWindow');
      expect(call.systemPrompt).toContain('Lifetime');
    });
  });
});

/**
 * El bug reportado: el resumen decía "el comercio cuenta con 60 reseñas"
 * cuando el perfil de Google mostraba 194. Las 60 eran las que el backfill
 * había alcanzado a persistir — `COUNT(GoogleReview)` nunca es "cuántas
 * reseñas tiene el negocio en Google".
 *
 * El fixture usa tres números deliberadamente distintos (194 / 60 / 3) para
 * que ninguna confusión entre ellos pueda pasar desapercibida.
 */
describe('reseñas: total de Google vs importadas vs desde Flikker', () => {
  async function reviewsPayload() {
    const deps = makeDeps();
    await makeService(deps).getSummary('biz-1', {}, NOW);
    return (
      deps.provider.generateStructured.mock.calls[0][0] as {
        userPayload: { reviews: Record<string, unknown> };
      }
    ).userPayload.reviews;
  }

  it('manda los tres números por separado, con nombres inequívocos', async () => {
    expect(await reviewsPayload()).toEqual({
      googleReviewsTotal: 194,
      googleReviewsImported: 60,
      sinceFlikker: 3,
      googleRating: 3.5,
      historySyncStatus: 'partial',
    });
  });

  it('el total del comercio es el de Google (194), nunca el importado (60)', async () => {
    const reviews = await reviewsPayload();

    expect(reviews.googleReviewsTotal).toBe(194);
    // Si alguien volviera a mandar lo importado bajo el nombre del total,
    // este assert lo caza aunque el número siga "pareciendo" razonable.
    expect(reviews.googleReviewsTotal).not.toBe(reviews.googleReviewsImported);
  });

  it('ya no existe un campo `total` ambiguo ni un `rating` sin dueño', async () => {
    const reviews = await reviewsPayload();

    // `total` era el nombre que hacía que el modelo lo leyera como "cuántas
    // tiene". `rating` no decía si era el de Google o el de lo importado.
    expect(reviews).not.toHaveProperty('total');
    expect(reviews).not.toHaveProperty('rating');
  });

  it('el prompt le prohíbe usar las importadas como total', async () => {
    const deps = makeDeps();
    await makeService(deps).getSummary('biz-1', {}, NOW);

    const { systemPrompt } = deps.provider.generateStructured.mock
      .calls[0][0] as { systemPrompt: string };
    expect(systemPrompt).toContain('googleReviewsTotal');
    expect(systemPrompt).toContain('googleReviewsImported');
    expect(systemPrompt).toMatch(/no es "cuántas tiene"/i);
  });
});
