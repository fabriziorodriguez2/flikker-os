import { CustomerSegment } from '@prisma/client';
import {
  canonicalSegmentRule,
  matchesSegment,
  MAX_SEGMENT_CONDITIONS,
  validateSegmentRule,
  type CustomerFeatures,
  type SegmentRule,
} from './segment-rules';

const features = (over: Partial<CustomerFeatures> = {}): CustomerFeatures => ({
  visitCount: 4,
  visitsLast30Days: 0,
  visitsLast90Days: 2,
  daysSinceFirstVisit: 120,
  daysSinceLastVisit: 40,
  typicalIntervalDays: 14,
  overdueRatio: 40 / 14,
  rewardRemainingVisits: 2,
  unredeemedBenefits: 1,
  daysToNearestBenefitExpiry: 5,
  redemptionsLast90Days: 0,
  daysSinceLastContact: null,
  segment: CustomerSegment.AT_RISK,
  ...over,
});

describe('validateSegmentRule', () => {
  it('acepta reglas combinadas con all/any/not', () => {
    const rule: SegmentRule = {
      all: [
        { field: 'visitCount', op: 'gte', value: 3 },
        {
          any: [
            { field: 'overdueRatio', op: 'gt', value: 1.5 },
            { field: 'segment', op: 'in', value: ['AT_RISK', 'INACTIVE'] },
          ],
        },
        { not: { field: 'daysSinceLastContact', op: 'lt', value: 14 } },
      ],
    };
    expect(validateSegmentRule(rule)).toEqual([]);
  });

  it.each([
    [{ field: 'phoneE164', op: 'eq', value: 1 }, 'Rasgo desconocido'],
    [{ field: 'visitCount', op: 'in', value: [1] }, 'Operador inválido'],
    [{ field: 'visitCount', op: 'gt', value: '3' }, 'espera un número'],
    [{ field: 'visitCount', op: 'between', value: [5, 2] }, 'between'],
    [{ field: 'segment', op: 'eq', value: 'VIP' }, 'Valores de segment'],
    [{ field: 'segment', op: 'gt', value: 'NEW' }, 'Operador inválido'],
    [{ field: 'visitCount', op: 'is_null', value: 3 }, 'no lleva valor'],
    [{ all: [] }, 'al menos una'],
    [
      { all: [{ field: 'visitCount', op: 'gt', value: 1 }], any: [] },
      'única clave',
    ],
    [
      { field: 'visitCount', op: 'gt', value: 1, sql: 'DROP' },
      'Claves desconocidas',
    ],
    ['visitCount > 3', 'objeto'],
  ])('rechaza %j', (rule, message) => {
    const issues = validateSegmentRule(rule);
    expect(issues.map((i) => i.message).join(' ')).toContain(message);
  });

  it('limita la profundidad y la cantidad de condiciones', () => {
    const deep = {
      not: {
        not: { not: { not: { field: 'visitCount', op: 'gt', value: 1 } } },
      },
    };
    expect(validateSegmentRule(deep).length).toBeGreaterThan(0);
    const wide = {
      all: Array.from({ length: MAX_SEGMENT_CONDITIONS + 1 }, () => ({
        field: 'visitCount',
        op: 'gt',
        value: 1,
      })),
    };
    expect(
      validateSegmentRule(wide)
        .map((i) => i.message)
        .join(),
    ).toContain('condiciones');
  });
});

describe('matchesSegment', () => {
  it('evalúa all/any/not', () => {
    const rule: SegmentRule = {
      all: [
        { field: 'visitCount', op: 'between', value: [3, 10] },
        { not: { field: 'segment', op: 'eq', value: 'NEW' } },
        {
          any: [
            { field: 'overdueRatio', op: 'gt', value: 2 },
            { field: 'daysSinceLastVisit', op: 'gt', value: 90 },
          ],
        },
      ],
    };
    expect(matchesSegment(rule, features())).toBe(true);
    expect(
      matchesSegment(rule, features({ segment: CustomerSegment.NEW })),
    ).toBe(false);
    expect(matchesSegment(rule, features({ overdueRatio: 1.1 }))).toBe(false);
  });

  it('un rasgo vacío nunca cumple una condición numérica, salvo is_null', () => {
    const f = features({
      typicalIntervalDays: null,
      daysSinceLastContact: null,
    });
    expect(
      matchesSegment({ field: 'typicalIntervalDays', op: 'lt', value: 100 }, f),
    ).toBe(false);
    expect(
      matchesSegment({ field: 'typicalIntervalDays', op: 'neq', value: 5 }, f),
    ).toBe(false);
    expect(
      matchesSegment({ field: 'daysSinceLastContact', op: 'is_null' }, f),
    ).toBe(true);
    expect(
      matchesSegment({ field: 'daysSinceLastContact', op: 'not_null' }, f),
    ).toBe(false);
  });
});

describe('canonicalSegmentRule', () => {
  it('no depende del orden de las condiciones ni de las listas', () => {
    const a: SegmentRule = {
      all: [
        { field: 'visitCount', op: 'gte', value: 2 },
        { field: 'segment', op: 'in', value: ['INACTIVE', 'AT_RISK'] },
      ],
    };
    const b: SegmentRule = {
      all: [
        { field: 'segment', op: 'in', value: ['AT_RISK', 'INACTIVE'] },
        { field: 'visitCount', op: 'gte', value: 2 },
      ],
    };
    expect(canonicalSegmentRule(a)).toBe(canonicalSegmentRule(b));
    expect(
      canonicalSegmentRule({ field: 'visitCount', op: 'gte', value: 3 }),
    ).not.toBe(
      canonicalSegmentRule({ field: 'visitCount', op: 'gte', value: 2 }),
    );
  });
});
