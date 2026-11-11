import { RetentionObjective } from '@prisma/client';
import {
  chooseStrategy,
  detectOpportunities,
  explainRun,
  incentiveLevelFor,
  selectGroup,
  type CustomerFacts,
  type PastRun,
  type RunFacts,
} from './autonomy-rules';

const NOW = new Date('2026-11-11T13:00:00.000Z');
const DAY = 86_400_000;
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

function customer(
  id: string,
  visitsDaysAgo: number[],
  extra: Partial<CustomerFacts> = {},
): CustomerFacts {
  return {
    id,
    visitDates: visitsDaysAgo.map(ago),
    lastInterventionAt: null,
    activeGoalRemaining: null,
    expiringBenefitInDays: null,
    ...extra,
  };
}

/** Población típica de un café: sanos, demorados, inactivos, de una visita. */
function population(n: number): CustomerFacts[] {
  const list: CustomerFacts[] = [];
  for (let i = 0; i < n; i++) {
    const kind = i % 5;
    if (kind === 0) list.push(customer(`c${i}`, [3, 10, 17, 24])); // sano
    if (kind === 1) list.push(customer(`c${i}`, [12, 19, 26, 33])); // demorado
    if (kind === 2) list.push(customer(`c${i}`, [40, 47, 54, 61])); // inactivo
    if (kind === 3) list.push(customer(`c${i}`, [30])); // una visita, pasado el plazo
    if (kind === 4) {
      list.push(customer(`c${i}`, [2, 9, 16], { activeGoalRemaining: 1 }));
    }
  }
  return list;
}

const strategies = (r: ReturnType<typeof detectOpportunities>) =>
  Object.fromEntries(r.opportunities.map((o) => [o.strategy, o.count]));

describe('autonomy rules — detección', () => {
  it('0 clientes: ninguna oportunidad', () => {
    const r = detectOpportunities([], NOW);
    expect(r.opportunities).toEqual([]);
    expect(r).toMatchObject({ customersWithVisits: 0, fewData: true });
  });

  it('10 clientes: detecta cada estrategia y marca pocos datos (regla fija)', () => {
    const r = detectOpportunities(population(10), NOW);
    expect(strategies(r)).toEqual({
      SECOND_VISIT: 2,
      OVERDUE: 2,
      INACTIVE: 2,
      NEAR_REWARD: 2,
    });
    expect(r.fewData).toBe(true);
    expect(r.opportunities.every((o) => o.confidence === 'EXPLICIT_RULE')).toBe(
      true,
    );
  });

  it('105 clientes: con base suficiente, la frecuencia propia es comportamiento', () => {
    const r = detectOpportunities(population(105), NOW);
    expect(strategies(r)).toMatchObject({
      SECOND_VISIT: 21,
      OVERDUE: 21,
      INACTIVE: 21,
      NEAR_REWARD: 21,
    });
    expect(r.fewData).toBe(false);
    const overdue = r.opportunities.find((o) => o.strategy === 'OVERDUE')!;
    expect(overdue.confidence).toBe('BEHAVIORAL');
    expect(overdue.objective).toBe(RetentionObjective.AT_RISK_RECOVERY);
    // La de una sola visita nunca se presenta como patrón aprendido.
    const second = r.opportunities.find((o) => o.strategy === 'SECOND_VISIT')!;
    expect(second.confidence).toBe('EXPLICIT_RULE');
  });

  it('5.000 clientes: una pasada, rápido', () => {
    const started = Date.now();
    const r = detectOpportunities(population(5000), NOW);
    expect(Date.now() - started).toBeLessThan(2000);
    expect(strategies(r).OVERDUE).toBe(1000);
  });

  it('beneficio por vencer y descenso de cohorte se detectan pero no son ejecutables', () => {
    const list = [
      customer('exp', [3, 10], { expiringBenefitInDays: 2 }),
      // 20 habituales que venían y dejaron de venir en los últimos 28 días.
      ...Array.from({ length: 20 }, (_, i) => customer(`h${i}`, [35, 42, 49])),
    ];
    const r = detectOpportunities(list, NOW);
    const expiring = r.opportunities.find(
      (o) => o.strategy === 'BENEFIT_EXPIRING',
    )!;
    const cohort = r.opportunities.find(
      (o) => o.strategy === 'COHORT_DECLINE',
    )!;
    expect(expiring).toMatchObject({ count: 1, executable: false });
    expect(cohort).toMatchObject({ count: 20, executable: false });
    // 'exp' también es habitual y vino 2 veces en los últimos 28 días.
    expect(cohort.rationale).toContain(
      '2 visitas en los últimos 28 días contra 60 en los 28 anteriores',
    );
  });
});

describe('autonomy rules — elección', () => {
  const r = detectOpportunities(population(105), NOW);
  const all = (strategy: string) =>
    r.opportunities.find((o) => o.strategy === strategy)!.candidateIds;
  const running = new Set([
    RetentionObjective.AT_RISK_RECOVERY,
    RetentionObjective.INACTIVE_RECOVERY,
    RetentionObjective.REWARD_GOAL_PROGRESS,
  ]);

  it('una sola estrategia, sin descuento primero; el resto queda descartado con motivo', () => {
    const choice = chooseStrategy({
      opportunities: r.opportunities,
      eligibleByStrategy: {
        SECOND_VISIT: all('SECOND_VISIT'),
        OVERDUE: all('OVERDUE'),
        INACTIVE: all('INACTIVE'),
        NEAR_REWARD: all('NEAR_REWARD'),
      },
      runningObjectives: running,
      history: [],
      catalogIncentiveAvailable: true,
      now: NOW,
    });
    expect(choice.chosen?.opportunity.strategy).toBe('SECOND_VISIT');
    expect(choice.chosen?.incentiveLevel).toBe(1);
    expect(choice.discarded.map((d) => [d.strategy, d.reason])).toEqual([
      ['OVERDUE', 'NOT_CHOSEN'],
      ['INACTIVE', 'NOT_CHOSEN'],
      ['NEAR_REWARD', 'NOT_CHOSEN'],
    ]);
  });

  it('consentimiento parcial: salta a la siguiente estrategia con elegibles', () => {
    const choice = chooseStrategy({
      opportunities: r.opportunities,
      eligibleByStrategy: {
        SECOND_VISIT: [],
        OVERDUE: all('OVERDUE').slice(0, 3),
      },
      runningObjectives: running,
      history: [],
      catalogIncentiveAvailable: false,
      now: NOW,
    });
    expect(choice.chosen?.opportunity.strategy).toBe('OVERDUE');
    expect(choice.chosen?.eligibleIds).toHaveLength(3);
    expect(choice.discarded[0]).toMatchObject({
      strategy: 'SECOND_VISIT',
      reason: 'NO_ELIGIBLE',
    });
  });

  it('sin experimento de Autopilot no se ejecuta; lo ejecutado hace <14 días se está midiendo', () => {
    const choice = chooseStrategy({
      opportunities: r.opportunities,
      eligibleByStrategy: {
        SECOND_VISIT: all('SECOND_VISIT'),
        OVERDUE: all('OVERDUE'),
        INACTIVE: all('INACTIVE'),
        NEAR_REWARD: all('NEAR_REWARD'),
      },
      runningObjectives: new Set([RetentionObjective.AT_RISK_RECOVERY]),
      history: [
        {
          strategy: 'SECOND_VISIT',
          incentiveLevel: 1,
          status: 'EXECUTED',
          mode: 'PILOT',
          createdAt: ago(5),
          exposed: 4,
          returned: 1,
        },
      ],
      catalogIncentiveAvailable: false,
      now: NOW,
    });
    expect(choice.chosen?.opportunity.strategy).toBe('OVERDUE');
    expect(
      Object.fromEntries(choice.discarded.map((d) => [d.strategy, d.reason])),
    ).toMatchObject({
      SECOND_VISIT: 'STILL_MEASURING',
      INACTIVE: 'NO_AUTOPILOT_EXPERIMENT',
      NEAR_REWARD: 'NO_AUTOPILOT_EXPERIMENT',
    });
  });

  it('escalera: catálogo solo tras 2 pruebas sin descuento, 5+ expuestos y 0 vueltas', () => {
    const run = (exposed: number, returned: number): PastRun => ({
      strategy: 'INACTIVE',
      incentiveLevel: 1,
      status: 'EXECUTED',
      mode: 'PILOT',
      createdAt: ago(30),
      exposed,
      returned,
    });
    const opp = { strategy: 'INACTIVE' as const, incentiveLevel: 1 as const };
    expect(incentiveLevelFor(opp, [run(3, 0), run(3, 0)], true)).toBe(3);
    expect(incentiveLevelFor(opp, [run(3, 0), run(3, 1)], true)).toBe(1);
    expect(incentiveLevelFor(opp, [run(6, 0)], true)).toBe(1);
    expect(incentiveLevelFor(opp, [run(3, 0), run(3, 0)], false)).toBe(1);
    // Los simulacros no cuentan como prueba.
    expect(
      incentiveLevelFor(
        opp,
        [
          { ...run(3, 0), mode: 'DRY_RUN', status: 'SIMULATED' },
          { ...run(3, 0), mode: 'DRY_RUN', status: 'SIMULATED' },
        ],
        true,
      ),
    ).toBe(1);
  });

  it('grupo chico, estable en el día y distinto entre días', () => {
    const ids = all('OVERDUE');
    const a = selectGroup(ids, 10, '2026-11-11');
    expect(a).toHaveLength(10);
    expect(selectGroup(ids, 10, '2026-11-11')).toEqual(a);
    expect(selectGroup(ids, 10, '2026-11-12')).not.toEqual(a);
    expect(selectGroup(ids.slice(0, 3), 10, 'x')).toHaveLength(3);
    expect(selectGroup(ids, 0, 'x')).toEqual([]);
  });
});

describe('autonomy rules — explicación', () => {
  const facts: RunFacts = {
    totalCustomers: 105,
    activeCustomers: 105,
    withPhone: 105,
    withWhatsappConsent: 0,
    optedOut: 2,
    customersWithVisits: 98,
    fewData: false,
    policyAccepted: true,
    policyPaused: false,
    messageCostSet: true,
    campaignsThisWeek: 0,
    campaignsCap: 2,
    recipientsThisWeek: 0,
    recipientsCap: 25,
    messagingSpentMonth: 0,
    messagingBudget: 500,
    currency: 'UYU',
  };

  it('cero acciones por consentimiento: lo dice con conteos reales y sugiere cómo juntarlo', () => {
    const r = detectOpportunities(population(105), NOW);
    const { explanation, suggestions } = explainRun({
      mode: 'PILOT',
      status: 'NO_ACTION',
      facts,
      opportunities: r.opportunities,
      discarded: [],
      blockers: [],
      chosen: null,
    });
    expect(explanation).toContain(
      '105 clientes activos, 0 con WhatsApp autorizado',
    );
    expect(suggestions.join(' ')).toContain(
      'Ninguno de tus 105 clientes autorizó WhatsApp',
    );
    // Nunca sugiere saltear el consentimiento ni enviar para probar.
    expect(suggestions.join(' ')).not.toMatch(
      /probar|igual|sin consentimiento/i,
    );
  });

  it('sin oportunidades: lo explica como buena noticia, sin dramatizar', () => {
    const { explanation } = explainRun({
      mode: 'DRY_RUN',
      status: 'NO_ACTION',
      facts: { ...facts, withWhatsappConsent: 50 },
      opportunities: [],
      discarded: [],
      blockers: [],
      chosen: null,
    });
    expect(explanation).toContain(
      'Ninguno de los 98 clientes con visitas está demorado',
    );
  });

  it('bloqueado por presupuesto y topes: explica y sugiere', () => {
    const { explanation, suggestions } = explainRun({
      mode: 'PILOT',
      status: 'BLOCKED',
      facts: { ...facts, campaignsThisWeek: 2, messagingSpentMonth: 500 },
      opportunities: [],
      discarded: [],
      blockers: [
        {
          code: 'WEEKLY_CAMPAIGNS_LIMIT',
          message: 'Ya se usaron las 2 campañas nuevas de esta semana.',
        },
      ],
      chosen: null,
    });
    expect(explanation).toContain('la política no permite actuar');
    expect(suggestions.join(' ')).toContain('campañas nuevas de esta semana');
    expect(suggestions.join(' ')).toContain(
      'presupuesto de mensajería del mes (UYU 500)',
    );
  });

  it('simulación: deja claro que no se contactó a nadie', () => {
    const { explanation } = explainRun({
      mode: 'DRY_RUN',
      status: 'SIMULATED',
      facts: { ...facts, withWhatsappConsent: 40 },
      opportunities: [],
      discarded: [],
      blockers: [],
      chosen: { label: 'Segunda visita', groupSize: 10, eligible: 14 },
    });
    expect(explanation).toContain('No se contactó a nadie');
    expect(explanation).toContain('10 de 14 clientes elegibles');
  });
});
