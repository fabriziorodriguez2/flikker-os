import { CustomerSegment } from '@prisma/client';
import {
  generateInsights,
  type InsightsMetricsBundle,
} from './insights-narrator';

function baseBundle(
  overrides: Partial<InsightsMetricsBundle> = {},
): InsightsMetricsBundle {
  return {
    totalCustomers: 0,
    newCustomersInWindow: 0,
    windowDays: 30,
    returningCustomers: 0,
    segmentCounts: {
      [CustomerSegment.NEW]: 0,
      [CustomerSegment.REPEAT]: 0,
      [CustomerSegment.FREQUENT]: 0,
      [CustomerSegment.AT_RISK]: 0,
      [CustomerSegment.INACTIVE]: 0,
      [CustomerSegment.RECOVERED]: 0,
    },
    visitTrend: [],
    visitTiming: [],
    benefitsRedeemedInWindow: 0,
    stampCard: {
      customersParticipating: 0,
      cardsInProgress: 0,
      unlockedTotal: 0,
      redeemedTotal: 0,
    },
    stampCardImpact: {
      participants: { total: 0, returning: 0 },
      nonParticipants: { total: 0, returning: 0 },
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
      googleReviewsTotal: null,
      googleReviewsImported: 0,
      sinceFlikker: 0,
      googleRating: null,
      importedRating: null,
      historySyncStatus: 'idle' as const,
      inPeriod: 0,
      feedbackInPeriod: 0,
    },
    ...overrides,
  };
}

describe('insights-narrator — churn', () => {
  it('con menos clientes que la muestra mínima, dice que no alcanza la información', () => {
    const bundle = baseBundle({ totalCustomers: 2 });
    const statements = generateInsights(bundle);
    const churn = statements.find((s) => s.id === 'churn');
    expect(churn?.hasEnoughData).toBe(false);
    expect(churn?.statement).toMatch(/no hay suficientes/i);
  });

  it('con datos suficientes y clientes en riesgo, arma la frase con el número real', () => {
    const bundle = baseBundle({
      totalCustomers: 20,
      segmentCounts: {
        [CustomerSegment.NEW]: 5,
        [CustomerSegment.REPEAT]: 5,
        [CustomerSegment.FREQUENT]: 2,
        [CustomerSegment.AT_RISK]: 3,
        [CustomerSegment.INACTIVE]: 5,
        [CustomerSegment.RECOVERED]: 0,
      },
    });
    const churn = generateInsights(bundle).find((s) => s.id === 'churn');
    expect(churn?.hasEnoughData).toBe(true);
    expect(churn?.statement).toContain('8');
    expect(churn?.kind).toBe('warning');
  });

  it('con datos suficientes y cero en riesgo, es una afirmación positiva', () => {
    const bundle = baseBundle({ totalCustomers: 10 });
    const churn = generateInsights(bundle).find((s) => s.id === 'churn');
    expect(churn?.hasEnoughData).toBe(true);
    expect(churn?.kind).toBe('positive');
  });
});

describe('insights-narrator — impacto de la tarjeta de sellos', () => {
  it('sin muestra suficiente en algún grupo, se omite (no se inventa un ratio)', () => {
    const bundle = baseBundle({
      stampCardImpact: {
        participants: { total: 3, returning: 2 },
        nonParticipants: { total: 50, returning: 10 },
      },
    });
    const statement = generateInsights(bundle).find(
      (s) => s.id === 'stamp-card-impact',
    );
    expect(statement).toBeUndefined();
  });

  it('con muestra suficiente, calcula el múltiplo real', () => {
    const bundle = baseBundle({
      stampCardImpact: {
        participants: { total: 10, returning: 8 }, // 80%
        nonParticipants: { total: 20, returning: 8 }, // 40%
      },
    });
    const statement = generateInsights(bundle).find(
      (s) => s.id === 'stamp-card-impact',
    );
    expect(statement?.hasEnoughData).toBe(true);
    // 0.8 / 0.4 = 2x
    expect(statement?.statement).toContain('2');
  });
});

describe('insights-narrator — promociones', () => {
  it('sin ninguna promoción enviada, no dice nada', () => {
    const bundle = baseBundle({ promotionStats: [] });
    expect(
      generateInsights(bundle).find((s) => s.id === 'promotion-performance'),
    ).toBeUndefined();
  });

  it('con pocos envíos, dice que es pronto para evaluar (nunca un número poco confiable)', () => {
    const bundle = baseBundle({
      promotionStats: [
        {
          campaignId: 'c1',
          createdAt: new Date(),
          benefitTitle: '2x1',
          sentCount: 3,
          benefitsIssued: 3,
          benefitsRedeemed: 1,
        },
      ],
    });
    const statement = generateInsights(bundle).find(
      (s) => s.id === 'promotion-performance',
    );
    expect(statement?.hasEnoughData).toBe(false);
  });

  it('con datos reales, cita los números exactos de la campaña', () => {
    const bundle = baseBundle({
      promotionStats: [
        {
          campaignId: 'c1',
          createdAt: new Date(),
          benefitTitle: '2x1',
          sentCount: 62,
          benefitsIssued: 62,
          benefitsRedeemed: 14,
        },
      ],
    });
    const statement = generateInsights(bundle).find(
      (s) => s.id === 'promotion-performance',
    );
    expect(statement?.statement).toContain('14');
    expect(statement?.statement).toContain('62');
    expect(statement?.statement).toContain('2x1');
  });
});

describe('insights-narrator — horarios de mayor movimiento', () => {
  it('con pocas visitas registradas, dice que no alcanza la información', () => {
    const bundle = baseBundle({
      visitTiming: [{ weekday: 5, hour: 18, count: 3 }],
    });
    const statement = generateInsights(bundle).find(
      (s) => s.id === 'busiest-timing',
    );
    expect(statement?.hasEnoughData).toBe(false);
  });

  it('con suficientes visitas, identifica la ventana de 3 horas con más movimiento', () => {
    const timing = [
      { weekday: 5, hour: 17, count: 8 },
      { weekday: 5, hour: 18, count: 9 },
      { weekday: 5, hour: 19, count: 7 },
      { weekday: 2, hour: 10, count: 2 },
    ];
    const bundle = baseBundle({ visitTiming: timing });
    const statement = generateInsights(bundle).find(
      (s) => s.id === 'busiest-timing',
    );
    expect(statement?.hasEnoughData).toBe(true);
    expect(statement?.statement).toMatch(/viernes/i);
    expect(statement?.statement).toContain('18:00');
  });
});

describe('insights-narrator — funnel de recuperación', () => {
  it('sin nadie contactado todavía, no dice nada (nunca un 0% inventado)', () => {
    const bundle = baseBundle();
    expect(
      generateInsights(bundle).find((s) => s.id === 'reactivation-funnel'),
    ).toBeUndefined();
  });

  it('con contactos reales, cita el KPI principal en la forma pedida', () => {
    const bundle = baseBundle({
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
    const statement = generateInsights(bundle).find(
      (s) => s.id === 'reactivation-funnel',
    );
    expect(statement?.statement).toBe(
      'Flikker contactó a 24 clientes y 7 volvieron (29.2% de recuperación).',
    );
    expect(statement?.kind).toBe('positive');
  });

  it('sin byArm (volumen insuficiente en algún brazo), no agrega la comparación', () => {
    const bundle = baseBundle({
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
    expect(
      generateInsights(bundle).find((s) => s.id === 'reactivation-by-arm'),
    ).toBeUndefined();
  });

  it('con byArm, agrega el detalle recordatorio-vs-beneficio', () => {
    const bundle = baseBundle({
      reactivationFunnel: {
        overall: {
          contacted: 80,
          returned: 20,
          recoveryRate: 0.25,
          averageDaysToReturn: 5,
          evidenceState: 'ENOUGH_DATA',
        },
        byArm: {
          reminderOnly: {
            contacted: 40,
            returned: 8,
            recoveryRate: 0.2,
            averageDaysToReturn: 6,
            evidenceState: 'ENOUGH_DATA',
          },
          withBenefit: {
            contacted: 40,
            returned: 12,
            recoveryRate: 0.3,
            averageDaysToReturn: 4,
            evidenceState: 'ENOUGH_DATA',
          },
        },
      },
    });
    const statement = generateInsights(bundle).find(
      (s) => s.id === 'reactivation-by-arm',
    );
    expect(statement?.statement).toBe(
      'Solo recordatorio recupera 20%, y con beneficio 30%.',
    );
  });
});

describe('insights-narrator — reseñas', () => {
  it('sin reseñas, lo dice claramente en vez de mostrar un rating inventado', () => {
    const bundle = baseBundle();
    const statement = generateInsights(bundle).find((s) => s.id === 'reviews');
    expect(statement?.hasEnoughData).toBe(false);
    expect(statement?.statement).toMatch(/todavía no tenés reseñas/i);
  });

  it('con reseñas, cita el corte real desde que usa Flikker', () => {
    const bundle = baseBundle({
      reviewStats: {
        googleReviewsTotal: 194,
        googleReviewsImported: 60,
        sinceFlikker: 12,
        googleRating: 4.6,
        importedRating: 3.9,
        historySyncStatus: 'partial' as const,
        inPeriod: 3,
        feedbackInPeriod: 1,
      },
    });
    const statement = generateInsights(bundle).find((s) => s.id === 'reviews');
    expect(statement?.statement).toContain('12');
    // El total es el de GOOGLE (194), no el importado (60).
    expect(statement?.statement).toContain('194');
    expect(statement?.statement).not.toContain('60');
    expect(statement?.statement).toContain('4,6');
  });

  it('con el histórico a medio traer NO dice "todavía no tenés reseñas"', () => {
    // 0 importadas pero 194 en Google: el negocio SÍ tiene reseñas, lo que
    // falta es bajarlas. Antes esto se leía como "no tenés ninguna".
    const bundle = baseBundle({
      reviewStats: {
        googleReviewsTotal: 194,
        googleReviewsImported: 0,
        sinceFlikker: 0,
        googleRating: 3.9,
        importedRating: null,
        historySyncStatus: 'running' as const,
        inPeriod: 0,
        feedbackInPeriod: 0,
      },
    });

    const statement = generateInsights(bundle).find((s) => s.id === 'reviews');
    expect(statement?.statement).not.toMatch(/todavía no tenés reseñas/i);
    expect(statement?.statement).toContain('194');
  });

  it('sin Place conectado no afirma ningún total', () => {
    const statement = generateInsights(baseBundle()).find(
      (s) => s.id === 'reviews',
    );
    expect(statement?.statement).toMatch(/todavía no tenés reseñas/i);
  });
});
