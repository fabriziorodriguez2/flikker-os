import { renderPlanMessage } from '../../policy/plan-execution';
import {
  measurePlan,
  type ResultAssignment,
  type ResultInput,
} from './plan-results';

const NOW = new Date('2026-12-20T12:00:00Z');
const T0 = new Date('2026-12-01T12:00:00Z');
const days = (d: number) => new Date(T0.getTime() + d * 86_400_000);

function arm(
  prefix: string,
  n: number,
  isControl: boolean,
  over: Partial<ResultAssignment> = {},
): ResultAssignment[] {
  return Array.from({ length: n }, (_, i) => ({
    customerId: `${prefix}${i}`,
    isControl,
    variantName: isControl ? 'Control' : 'Variante A',
    status: isControl ? 'OBSERVING' : 'SENT',
    exposedAt: T0,
    messageId: isControl ? null : `msg-${prefix}${i}`,
    benefitParticipationId: null,
    ...over,
  }));
}

function input(over: Partial<ResultInput> = {}): ResultInput {
  return {
    assignments: [...arm('t', 8, false), ...arm('c', 2, true)],
    visits: [],
    redemptions: [],
    optOuts: [],
    messages: { sent: 8, failed: 0 },
    windowDays: 21,
    measureUntil: days(23),
    now: NOW,
    stopConditions: { maxOptOutPercent: 5, maxFailurePercent: 20 },
    costs: { messageUnitCost: 2, incentiveCostByVariant: {} },
    ...over,
  };
}

describe('measurePlan', () => {
  it('con grupos chicos es una señal, nunca una prueba', () => {
    const r = measurePlan(
      input({
        visits: [
          { customerId: 't0', occurredAt: days(3), messageId: 'msg-t0' },
          { customerId: 't1', occurredAt: days(5), messageId: null },
          { customerId: 'c0', occurredAt: days(4), messageId: null },
        ],
      }),
    );
    expect(r.treated).toMatchObject({
      contacted: 8,
      returned: 2,
      attributed: 1,
    });
    expect(r.control).toMatchObject({ observed: 2, returned: 1 });
    expect(r.evidence).toBe('SIGNAL_ONLY');
    expect(r.readout).toContain(
      'no se puede afirmar que el mensaje los hizo volver',
    );
    expect(r.phase).toBe('MEASURING');
  });

  it('exploratoria (sin grupo de control): registra lo observado, sin causalidad', () => {
    const r = measurePlan(
      input({
        assignments: arm('t', 1, false),
        messages: { sent: 1, failed: 0 },
        visits: [{ customerId: 't0', occurredAt: days(2), messageId: 'msg-t0' }],
      }),
    );
    expect(r.exploratory).toBe(true);
    expect(r.evidence).toBe('OBSERVED_ONLY');
    expect(r.treated).toMatchObject({ contacted: 1, returned: 1 });
    expect(r.controlReturnRate).toBeNull();
    expect(r.liftPoints).toBeNull();
    expect(r.readout).toContain('sin grupo de control');
    expect(r.readout).toContain('no demuestra que el mensaje los hizo volver');
    expect(r.readout).not.toMatch(/sumó vueltas que no habrían pasado/);
  });

  it('con grupo de control no es exploratoria', () => {
    expect(measurePlan(input()).exploratory).toBe(false);
  });

  it('separa correlación de atribución: volver no es volver por el mensaje', () => {
    const r = measurePlan(
      input({
        assignments: [
          ...arm('t', 3, false, { benefitParticipationId: null }),
          {
            ...arm('x', 1, false)[0],
            benefitParticipationId: 'bp-1',
            variantName: 'Variante B',
          },
        ],
        visits: [
          { customerId: 't0', occurredAt: days(2), messageId: null },
          { customerId: 'x0', occurredAt: days(2), messageId: null },
        ],
        redemptions: [{ participationId: 'bp-1', redeemedAt: days(2) }],
        costs: {
          messageUnitCost: 2,
          incentiveCostByVariant: { 'Variante B': 60 },
        },
        messages: { sent: 4, failed: 0 },
      }),
    );
    expect(r.treated).toMatchObject({
      returned: 2,
      attributed: 1,
      redeemed: 1,
    });
    expect(r.cost).toEqual({ messages: 8, incentivesRedeemed: 60, total: 68 });
  });

  it('una vuelta fuera de la ventana o antes del mensaje no cuenta', () => {
    const r = measurePlan(
      input({
        visits: [
          { customerId: 't0', occurredAt: days(-1), messageId: null },
          { customerId: 't1', occurredAt: days(30), messageId: null },
        ],
      }),
    );
    expect(r.treated.returned).toBe(0);
  });

  it('con muestras suficientes y diferencia clara: incremental', () => {
    const treated = arm('t', 60, false);
    const control = arm('c', 60, true);
    const visits = [
      ...treated.slice(0, 30).map((a) => ({
        customerId: a.customerId,
        occurredAt: days(3),
        messageId: null,
      })),
      ...control.slice(0, 10).map((a) => ({
        customerId: a.customerId,
        occurredAt: days(3),
        messageId: null,
      })),
    ];
    const r = measurePlan(
      input({
        assignments: [...treated, ...control],
        visits,
        messages: { sent: 60, failed: 0 },
      }),
    );
    expect(r.treatedReturnRate).toBe(50);
    expect(r.controlReturnRate).toBe(16.7);
    expect(r.liftPoints).toBe(33.3);
    expect(r.evidence).toBe('INCREMENTAL');
  });

  it('con muestras suficientes y sin diferencia: no hay evidencia', () => {
    const treated = arm('t', 40, false);
    const control = arm('c', 40, true);
    const visits = [
      ...treated.slice(0, 10).map((a) => ({
        customerId: a.customerId,
        occurredAt: days(3),
        messageId: null,
      })),
      ...control.slice(0, 9).map((a) => ({
        customerId: a.customerId,
        occurredAt: days(3),
        messageId: null,
      })),
    ];
    const r = measurePlan(
      input({
        assignments: [...treated, ...control],
        visits,
        messages: { sent: 40, failed: 0 },
      }),
    );
    expect(r.evidence).toBe('NO_DIFFERENCE');
    expect(r.readout).toContain('no hay evidencia');
  });

  it('corta por bajas a partir de su umbral (y no por una sola)', () => {
    const oneOptOut = measurePlan(
      input({ optOuts: [{ customerId: 't0', at: days(1) }] }),
    );
    expect(oneOptOut.stop.triggered).toBe(false);
    const twoOptOuts = measurePlan(
      input({
        optOuts: [
          { customerId: 't0', at: days(1) },
          { customerId: 't1', at: days(1) },
        ],
      }),
    );
    expect(twoOptOuts.stop).toEqual({ triggered: true, reason: 'OPT_OUTS' });
    // Una baja anterior al mensaje no es culpa del plan.
    const before = measurePlan(
      input({
        optOuts: [
          { customerId: 't0', at: days(-2) },
          { customerId: 't1', at: days(-2) },
        ],
      }),
    );
    expect(before.stop.triggered).toBe(false);
  });

  it('corta por fallas de envío', () => {
    const r = measurePlan(input({ messages: { sent: 5, failed: 3 } }));
    expect(r.stop).toEqual({ triggered: true, reason: 'FAILURES' });
  });

  it('fases: enviando, midiendo, terminado', () => {
    expect(
      measurePlan(
        input({
          assignments: [
            ...arm('t', 2, false, { status: 'PENDING', exposedAt: null }),
          ],
        }),
      ).phase,
    ).toBe('SENDING');
    expect(measurePlan(input()).phase).toBe('MEASURING');
    expect(measurePlan(input({ now: days(30) })).phase).toBe('COMPLETED');
  });

  it('sin nadie contactado no hay nada que medir', () => {
    const r = measurePlan(
      input({
        assignments: arm('t', 3, false, { status: 'PENDING', exposedAt: null }),
      }),
    );
    expect(r.evidence).toBe('NO_DATA');
  });

  it('sin costo por mensaje cargado, el costo queda desconocido (no cero)', () => {
    const r = measurePlan(
      input({ costs: { messageUnitCost: null, incentiveCostByVariant: {} } }),
    );
    expect(r.cost.messages).toBeNull();
    expect(r.cost.total).toBeNull();
  });
});

describe('renderPlanMessage', () => {
  it('pone el primer nombre o lo quita prolijamente', () => {
    expect(
      renderPlanMessage('Hola {nombre}, te esperamos.', 'Ana María Pérez'),
    ).toBe('Hola Ana, te esperamos.');
    expect(renderPlanMessage('Hola {nombre}, te esperamos.', null)).toBe(
      'Hola, te esperamos.',
    );
    expect(renderPlanMessage('{nombre}, tu mesa te espera.', '')).toBe(
      'Tu mesa te espera.',
    );
  });
});
