import { CustomerSegment } from '@prisma/client';
import type { AuthorizedIncentive } from './commercial-plan';
import type { BusinessSnapshot } from './business-snapshot';
import type { CustomerFeatures } from './segment-rules';
import {
  MIN_PLAN_RECIPIENTS,
  SMALL_SAMPLE_RECIPIENTS,
  evaluateSubmission,
  feedbackForModel,
  ungroundedNumbers,
  type EvaluationContext,
  type PlannerBudget,
  type PlannerSubmission,
  type SubmittedPlan,
} from './planner-evaluation';

const NOW = new Date('2026-11-14T15:00:00Z');

function features(over: Partial<CustomerFeatures>): CustomerFeatures {
  return {
    visitCount: 1,
    visitsLast30Days: 0,
    visitsLast90Days: 1,
    daysSinceFirstVisit: 45,
    daysSinceLastVisit: 45,
    typicalIntervalDays: null,
    overdueRatio: null,
    rewardRemainingVisits: null,
    unredeemedBenefits: 0,
    daysToNearestBenefitExpiry: null,
    redemptionsLast90Days: 0,
    daysSinceLastContact: null,
    segment: CustomerSegment.INACTIVE,
    ...over,
  };
}

/** 12 clientes de una visita (c0..c11) y 8 habituales (r0..r7); consienten los pares. */
function snapshot(): BusinessSnapshot {
  const map = new Map<string, CustomerFeatures>();
  for (let i = 0; i < 12; i += 1) map.set(`c${i}`, features({}));
  for (let i = 0; i < 8; i += 1) {
    map.set(
      `r${i}`,
      features({
        visitCount: 6,
        overdueRatio: 2,
        segment: CustomerSegment.AT_RISK,
      }),
    );
  }
  const consented = new Set(
    [...map.keys()].filter((id) => Number(id.slice(1)) % 2 === 0),
  );
  return {
    features: map,
    consented,
    facts: {
      'customers.active': 20,
      'customers.single_visit_lapsed_30d': 12,
      'customers.overdue_regulars': 8,
    },
  };
}

const coffee: AuthorizedIncentive = {
  id: 'inc-coffee',
  label: 'Café de regalo',
  unitCost: 60,
  percentageValue: null,
  fixedValue: null,
  expiresInDays: 7,
  allowFreeWording: true,
};

function ctx(over: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    snapshot: snapshot(),
    incentives: new Map([[coffee.id, coffee]]),
    budget: {
      messageUnitCost: 2,
      messagingRemaining: null,
      incentiveRemaining: null,
      weeklyRecipientsRemaining: null,
    },
    recentFingerprints: new Set(),
    now: NOW,
    today: '2026-11-14',
    previewNumbers: [],
    ...over,
  };
}

const ONE_VISIT = JSON.stringify({ field: 'visitCount', op: 'eq', value: 1 });
const ANY_VISITS = JSON.stringify({ field: 'visitCount', op: 'gte', value: 1 });
const REGULARS = JSON.stringify({
  field: 'overdueRatio',
  op: 'gte',
  value: 1.5,
});

function plan(over: Partial<SubmittedPlan> = {}): SubmittedPlan {
  return {
    schemaVersion: 1,
    title: 'Segunda visita',
    objective: 'SECOND_VISIT',
    hypothesis: 'Hay 12 clientes que vinieron una vez y no volvieron.',
    evidence: [
      {
        metric: 'customers.single_visit_lapsed_30d',
        value: 12,
        statement: '12 clientes de una sola visita.',
      },
    ],
    segment: { description: 'Una visita', rule: ONE_VISIT, maxRecipients: 50 },
    channel: 'WHATSAPP',
    variants: [
      {
        key: 'A',
        message: 'Hola {nombre}, ¡te esperamos de vuelta!',
        incentiveId: null,
        weightPercent: 80,
      },
    ],
    controlPercent: 20,
    schedule: { startOn: 'ASAP', sendWithinDays: 2 },
    successMetric: { kind: 'RETURN_VISIT', windowDays: 21 },
    stopConditions: { maxOptOutPercent: 5, maxFailurePercent: 20 },
    rationale: 'El grupo más grande.',
    selected: true,
    rank: 1,
    selectionReason: 'Más alcance.',
    ...over,
  };
}

function submission(
  plans: SubmittedPlan[],
  over: Partial<PlannerSubmission> = {},
): PlannerSubmission {
  return {
    observations: ['Muchos clientes no vuelven después de la primera visita.'],
    hypotheses: [
      {
        statement: 'Un recordatorio alcanza.',
        metrics: ['customers.single_visit_lapsed_30d'],
      },
    ],
    decision: 'PROPOSE',
    noActionReason: null,
    ownerSummary:
      'Hay 12 clientes de una sola visita: propongo invitarlos a volver.',
    nextSteps: [],
    plans,
    ...over,
  };
}

describe('evaluateSubmission', () => {
  it('simula el plan elegido solo con clientes que autorizaron WhatsApp', () => {
    const result = evaluateSubmission(submission([plan()]), ctx());
    const [p] = result.plans;
    expect(p.status).toBe('SIMULATED');
    expect(p.matched).toBe(12);
    expect(p.reachable).toBe(6);
    expect(p.recipientIds).toHaveLength(6);
    expect(p.recipientIds.every((id) => Number(id.slice(1)) % 2 === 0)).toBe(
      true,
    );
    expect(p.cost).toMatchObject({ treated: 5, control: 1, messaging: 10 });
    expect(result.repairable).toBe(false);
  });

  it('un plan válido no elegido queda NOT_SELECTED', () => {
    const result = evaluateSubmission(
      submission([
        plan(),
        plan({
          selected: false,
          rank: null,
          title: 'Otra',
          segment: { description: 'x', rule: REGULARS, maxRecipients: 10 },
        }),
      ]),
      ctx(),
    );
    expect(result.plans.map((p) => p.status)).toEqual([
      'SIMULATED',
      'NOT_SELECTED',
    ]);
  });

  it('dos planes elegidos nunca comparten clientes', () => {
    const result = evaluateSubmission(
      submission([
        plan({
          segment: {
            description: 'todos',
            rule: ANY_VISITS,
            maxRecipients: 50,
          },
        }),
        plan({
          title: 'Habituales',
          rank: 2,
          segment: { description: 'h', rule: REGULARS, maxRecipients: 50 },
        }),
      ]),
      ctx(),
    );
    expect(result.plans[0].status).toBe('SIMULATED');
    expect(result.plans[1].status).toBe('INFEASIBLE');
    expect(result.plans[1].issues[0].code).toBe('OVERLAP');
  });

  it('sin consentimiento en el segmento: inviable, y lo explica', () => {
    const snap = snapshot();
    const result = evaluateSubmission(
      submission([plan()]),
      ctx({ snapshot: { ...snap, consented: new Set() } }),
    );
    expect(result.plans[0].status).toBe('INFEASIBLE');
    expect(result.plans[0].issues[0]).toMatchObject({ code: 'NO_REACH' });
    expect(result.plans[0].issues[0].message).toContain(
      'no autorizaron WhatsApp',
    );
  });

  it('presupuesto agotado: inviable; presupuesto justo: achica el grupo', () => {
    const exhausted = evaluateSubmission(
      submission([plan()]),
      ctx({
        budget: {
          messageUnitCost: 2,
          messagingRemaining: 0,
          incentiveRemaining: null,
          weeklyRecipientsRemaining: null,
        },
      }),
    );
    expect(exhausted.plans[0].issues[0].code).toBe('BUDGET');

    const tight = evaluateSubmission(
      submission([
        plan({
          segment: {
            description: 'todos',
            rule: ANY_VISITS,
            maxRecipients: 50,
          },
        }),
      ]),
      ctx({
        budget: {
          messageUnitCost: 2,
          messagingRemaining: 12,
          incentiveRemaining: null,
          weeklyRecipientsRemaining: null,
        },
      }),
    );
    expect(tight.plans[0].status).toBe('SIMULATED');
    expect(tight.plans[0].cost!.messaging).toBeLessThanOrEqual(12);
  });

  it('tope por campaña: achica el grupo hasta que entra; si ni el mínimo entra, lo explica', () => {
    const wide = plan({
      segment: { description: 'todos', rule: ANY_VISITS, maxRecipients: 50 },
    });
    const budget = (maxMessagingPerCampaign: number) => ({
      budget: {
        messageUnitCost: 2,
        messagingRemaining: null,
        incentiveRemaining: null,
        weeklyRecipientsRemaining: null,
        maxMessagingPerCampaign,
      },
    });
    const capped = evaluateSubmission(submission([wide]), ctx(budget(14)));
    expect(capped.plans[0].status).toBe('SIMULATED');
    expect(capped.plans[0].cost!.total).toBeLessThanOrEqual(14);
    // Peor caso de la política: mensaje para todo el grupo, control incluido.
    expect(capped.plans[0].recipientIds.length * 2).toBeLessThanOrEqual(14);

    const tooSmall = evaluateSubmission(submission([wide]), ctx(budget(1)));
    expect(tooSmall.plans[0].issues[0]).toMatchObject({ code: 'BUDGET' });
    expect(tooSmall.plans[0].issues[0].message).toContain('tope por campaña');
  });

  it('respeta el tope semanal de clientes nuevos', () => {
    const result = evaluateSubmission(
      submission([
        plan({
          segment: {
            description: 'todos',
            rule: ANY_VISITS,
            maxRecipients: 50,
          },
        }),
      ]),
      ctx({
        budget: {
          messageUnitCost: 2,
          messagingRemaining: null,
          incentiveRemaining: null,
          weeklyRecipientsRemaining: 7,
        },
      }),
    );
    expect(result.plans[0].recipientIds).toHaveLength(7);
  });

  it('pocos clientes: se puede actuar, marcado como prueba chica (sin evidencia)', () => {
    const result = evaluateSubmission(
      submission([
        plan({
          segment: { description: 'h', rule: REGULARS, maxRecipients: 3 },
        }),
      ]),
      ctx(),
    );
    expect(result.plans[0].status).toBe('SIMULATED');
    expect(result.plans[0].recipientIds).toHaveLength(3);
    expect(result.plans[0].smallSample).toBe(true);
    expect(feedbackForModel(result)).toContain('prueba chica');
  });

  it(`un solo cliente disponible alcanza (mínimo ${MIN_PLAN_RECIPIENTS}); desde ${SMALL_SAMPLE_RECIPIENTS} deja de ser prueba chica`, () => {
    const one = evaluateSubmission(
      submission([
        plan({
          segment: { description: 'h', rule: REGULARS, maxRecipients: 1 },
        }),
      ]),
      ctx(),
    );
    expect(one.plans[0]).toMatchObject({
      status: 'SIMULATED',
      smallSample: true,
    });
    const five = evaluateSubmission(
      submission([
        plan({
          segment: { description: 'u', rule: ONE_VISIT, maxRecipients: 5 },
        }),
      ]),
      ctx(),
    );
    expect(five.plans[0]).toMatchObject({
      status: 'SIMULATED',
      smallSample: false,
    });
  });

  it('un plan repetido no se simula de nuevo', () => {
    const first = evaluateSubmission(submission([plan()]), ctx());
    const again = evaluateSubmission(
      submission([plan({ title: 'Otra redacción' })]),
      ctx({ recentFingerprints: new Set([first.plans[0].fingerprint!]) }),
    );
    expect(again.plans[0].status).toBe('DUPLICATE');
  });

  it('un elegido inválido pide corrección con el motivo exacto', () => {
    const result = evaluateSubmission(
      submission([
        plan({
          variants: [
            {
              key: 'A',
              message: 'Volvé y tenés 20% OFF',
              incentiveId: null,
              weightPercent: 80,
            },
          ],
        }),
      ]),
      ctx(),
    );
    expect(result.plans[0].status).toBe('INVALID');
    expect(result.repairable).toBe(true);
    expect(feedbackForModel(result)).toContain('porcentaje');
  });

  it('una regla que no es JSON es inválida, no rompe', () => {
    const result = evaluateSubmission(
      submission([
        plan({
          segment: { description: 'x', rule: 'visitas > 2', maxRecipients: 5 },
        }),
      ]),
      ctx(),
    );
    expect(result.plans[0].issues[0].code).toBe('SEGMENT_RULE');
  });

  it('números inventados en la hipótesis o el resumen', () => {
    const inHypothesis = evaluateSubmission(
      submission([plan({ hypothesis: 'El 47% de los clientes no vuelve.' })]),
      ctx(),
    );
    expect(inHypothesis.plans[0].issues[0].code).toBe('UNGROUNDED_NUMBER');

    const inSummary = evaluateSubmission(
      submission([plan()], { ownerSummary: 'Esto traería 35 visitas más.' }),
      ctx(),
    );
    expect(inSummary.ungroundedSummaryNumbers).toEqual([35]);
    expect(inSummary.repairable).toBe(true);
  });

  it('un resumen con claves técnicas se devuelve para reescribir', () => {
    const result = evaluateSubmission(
      submission([plan()], {
        ownerSummary:
          'customers.single_visit_lapsed_30d = 12: hay que invitarlos.',
      }),
      ctx(),
    );
    expect(result.summaryHasJargon).toBe(true);
    expect(result.repairable).toBe(true);
    expect(feedbackForModel(result)).toContain('sin claves técnicas');
  });

  it('decidir no actuar exige motivo y no admite planes elegidos', () => {
    const result = evaluateSubmission(
      submission([plan()], { decision: 'NO_ACTION', noActionReason: null }),
      ctx(),
    );
    expect(result.issues.map((i) => i.code)).toEqual(
      expect.arrayContaining(['DECISION_CONFLICT', 'TEXT']),
    );
  });
});

describe('evaluateSubmission — límites de la política', () => {
  const budget = (over: Partial<PlannerBudget> = {}): PlannerBudget => ({
    messageUnitCost: 2,
    messagingRemaining: null,
    incentiveBudgetSet: true,
    incentiveRemaining: null,
    weeklyRecipientsRemaining: null,
    ...over,
  });
  const wide = (over: Partial<SubmittedPlan> = {}) =>
    plan({
      segment: { description: 'todos', rule: ANY_VISITS, maxRecipients: 50 },
      ...over,
    });
  /** Con variante sin premio y variante con café (60 por emisión). */
  const withCoffee = (over: Partial<SubmittedPlan> = {}) =>
    wide({
      variants: [
        {
          key: 'A',
          message: 'Hola {nombre}, ¡te esperamos de vuelta!',
          incentiveId: null,
          weightPercent: 40,
        },
        {
          key: 'B',
          message: 'Hola {nombre}, tu próximo café va de regalo.',
          incentiveId: coffee.id,
          weightPercent: 40,
        },
      ],
      ...over,
    });

  it('los que recibieron una promoción hace poco descansan: no entran en el plan', () => {
    const result = evaluateSubmission(
      submission([wide()]),
      ctx({ budget: budget(), resting: new Set(['c0', 'c2', 'r0']) }),
    );
    expect(result.plans[0].status).toBe('SIMULATED');
    expect(result.plans[0].recipientIds).toHaveLength(7);
    expect(result.plans[0].recipientIds).not.toContain('c0');
  });

  it('si todos están descansando, lo explica (no es "sin alcance")', () => {
    const result = evaluateSubmission(
      submission([
        plan({
          segment: { description: 'h', rule: REGULARS, maxRecipients: 9 },
        }),
      ]),
      ctx({
        budget: budget(),
        resting: new Set(['r0', 'r2', 'r4', 'r6']),
      }),
    );
    expect(result.plans[0].issues[0]).toMatchObject({ code: 'RESTING' });
  });

  it('sin presupuesto de incentivos del dueño: el plan con premio no va, el sin premio sí', () => {
    const result = evaluateSubmission(
      submission([
        withCoffee(),
        plan({
          title: 'Habituales',
          rank: 2,
          segment: { description: 'h', rule: REGULARS, maxRecipients: 50 },
        }),
      ]),
      ctx({ budget: budget({ incentiveBudgetSet: false }) }),
    );
    expect(result.plans[0]).toMatchObject({ status: 'INFEASIBLE' });
    expect(result.plans[0].issues[0].code).toBe('INCENTIVE_BUDGET_NOT_SET');
    expect(result.plans[1].status).toBe('SIMULATED');
  });

  it('sin presupuesto, un premio de costo cero verificable sí va (y no consume nada)', () => {
    const sticker: AuthorizedIncentive = {
      id: 'inc-sticker',
      label: 'Sticker de la casa',
      unitCost: 0,
      percentageValue: null,
      fixedValue: null,
      expiresInDays: 7,
      allowFreeWording: true,
      zeroCost: true,
    };
    const withSticker = plan({
      variants: [
        {
          key: 'A',
          message: 'Hola {nombre}, te guardamos un sticker de regalo.',
          incentiveId: sticker.id,
          weightPercent: 80,
        },
      ],
    });
    const result = evaluateSubmission(
      submission([withSticker]),
      ctx({
        incentives: new Map([[sticker.id, sticker]]),
        budget: budget({ incentiveBudgetSet: false, incentiveRemaining: 0 }),
      }),
    );
    expect(result.plans[0].status).toBe('SIMULATED');
    expect(result.plans[0].cost?.incentivesMaxLiability).toBe(0);
  });

  it('presupuesto de incentivos insuficiente: achica con el peor caso; en 0, no va', () => {
    // 10 contactables × 60 = 600 > 300 → entran 5 (5 × 60 = 300).
    const tight = evaluateSubmission(
      submission([withCoffee()]),
      ctx({ budget: budget({ incentiveRemaining: 300 }) }),
    );
    expect(tight.plans[0].status).toBe('SIMULATED');
    expect(tight.plans[0].recipientIds).toHaveLength(5);

    const zero = evaluateSubmission(
      submission([withCoffee()]),
      ctx({ budget: budget({ incentiveRemaining: 0 }) }),
    );
    expect(zero.plans[0].issues[0]).toMatchObject({ code: 'BUDGET' });
    expect(zero.plans[0].issues[0].message).toContain('sin incentivo');
  });

  it('tope por campaña de incentivos: la parte de esa bolsa, sin mirar la de mensajes', () => {
    const result = evaluateSubmission(
      submission([withCoffee()]),
      ctx({
        budget: budget({
          maxIncentivesPerCampaign: 120,
          maxMessagingPerCampaign: 1000,
        }),
      }),
    );
    expect(result.plans[0].recipientIds).toHaveLength(2);
  });

  it('dos planes que comparten presupuesto: el segundo usa lo que dejó el primero', () => {
    const result = evaluateSubmission(
      submission([
        plan({
          segment: { description: 'u', rule: ONE_VISIT, maxRecipients: 50 },
        }),
        plan({
          title: 'Habituales',
          rank: 2,
          segment: { description: 'h', rule: REGULARS, maxRecipients: 50 },
        }),
      ]),
      // 6 + 4 contactables × 2 = 20; quedan 16 → el segundo entra con 2.
      ctx({ budget: budget({ messagingRemaining: 16 }) }),
    );
    expect(result.plans[0].recipientIds).toHaveLength(6);
    expect(result.plans[1].recipientIds).toHaveLength(2);
  });

  it('no elige más planes que las campañas que quedan en la semana', () => {
    const result = evaluateSubmission(
      submission([
        plan({
          segment: { description: 'u', rule: ONE_VISIT, maxRecipients: 50 },
        }),
        plan({
          title: 'Habituales',
          rank: 2,
          segment: { description: 'h', rule: REGULARS, maxRecipients: 50 },
        }),
      ]),
      ctx({ budget: budget({ newCampaignsRemaining: 1 }) }),
    );
    expect(result.plans.map((p) => p.status)).toEqual([
      'SIMULATED',
      'INFEASIBLE',
    ]);
    expect(result.plans[1].issues[0].code).toBe('WEEKLY_CAMPAIGNS');
  });

  it('modo adaptativo (base chica): el tamaño lo decide el plan, no un tope fijo', () => {
    const result = evaluateSubmission(
      submission([wide()]),
      ctx({
        budget: budget({
          weeklyLimitMode: 'ADAPTIVE',
          weeklyRecipientsRemaining: null,
        }),
      }),
    );
    expect(result.plans[0].recipientIds).toHaveLength(10);
  });

  it('modo porcentaje: el alcance semanal que queda corta el grupo; en 0, lo explica', () => {
    const left = (n: number) =>
      evaluateSubmission(
        submission([wide()]),
        ctx({
          budget: budget({
            weeklyLimitMode: 'PERCENT',
            weeklyRecipientsRemaining: n,
          }),
        }),
      );
    expect(left(4).plans[0].recipientIds).toHaveLength(4);
    expect(left(0).plans[0].issues[0].code).toBe('WEEKLY_REACH');
  });
});

describe('ungroundedNumbers', () => {
  it('deja pasar enteros chicos y los números respaldados', () => {
    expect(
      ungroundedNumbers('una o 2 visitas, 12 clientes, 1,5 veces', [12, 1.5]),
    ).toEqual([]);
    expect(ungroundedNumbers('1.234 clientes', [1234])).toEqual([]);
    expect(ungroundedNumbers('40 clientes', [12])).toEqual([40]);
  });

  it('los nombres de métricas no son números inventados, sus valores sí se revisan', () => {
    expect(
      ungroundedNumbers(
        'dado que redemptions.last_90d = 0 y customers.single_visit_lapsed_30d = 39',
        [0, 39],
      ),
    ).toEqual([]);
    expect(
      ungroundedNumbers('visits.last_28d_vs_prev_change_pct = -39.4', [-39.4]),
    ).toEqual([]);
    expect(ungroundedNumbers('customers.near_reward = 45', [10])).toEqual([45]);
  });
});
