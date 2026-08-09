import {
  DEFAULT_PERSONA_MIX,
  PERSONA_PROFILES,
  pickPersona,
  type PersonaType,
} from './personas';
import { createSeededRandom } from './prng';

const ALL_PERSONA_TYPES: PersonaType[] = [
  'WEEKLY_REGULAR',
  'BIWEEKLY',
  'MONTHLY',
  'NEW',
  'HIGH_CHURN',
  'IRREGULAR',
  'PROMOTION_SENSITIVE',
  'PROMOTION_INSENSITIVE',
  'PROGRESS_SENSITIVE',
];

describe('PERSONA_PROFILES — §8: ground truth, never exposed to Flikker', () => {
  it('defines exactly the 9 personas the request specifies, no more, no less', () => {
    expect(Object.keys(PERSONA_PROFILES).sort()).toEqual(
      [...ALL_PERSONA_TYPES].sort(),
    );
  });

  it('every rate/probability field is a valid [0, 1] value', () => {
    for (const persona of Object.values(PERSONA_PROFILES)) {
      for (const field of [
        'baselineCheckinComplianceRate',
        'reminderEffect',
        'progressReminderEffect',
        'softBenefitEffect',
        'reviewClickProbability',
        'churnHazardPerCycle',
      ] as const) {
        expect(persona[field]).toBeGreaterThanOrEqual(0);
        expect(persona[field]).toBeLessThanOrEqual(1);
      }
      expect(persona.averageCadenceDays).toBeGreaterThan(0);
      expect(persona.cadenceJitterDays).toBeGreaterThanOrEqual(0);
    }
  });

  it('§13: REMINDER effect is small everywhere — never the strongest lever for any persona', () => {
    for (const persona of Object.values(PERSONA_PROFILES)) {
      expect(persona.reminderEffect).toBeLessThanOrEqual(0.1);
    }
  });

  it('§13: PROGRESS_REMINDER is strong specifically for PROGRESS_SENSITIVE, and not for most others', () => {
    const sensitive = PERSONA_PROFILES.PROGRESS_SENSITIVE;
    expect(sensitive.progressReminderEffect).toBeGreaterThan(
      sensitive.reminderEffect * 2,
    );
    const others = ALL_PERSONA_TYPES.filter((t) => t !== 'PROGRESS_SENSITIVE');
    for (const type of others) {
      expect(PERSONA_PROFILES[type].progressReminderEffect).toBeLessThan(
        sensitive.progressReminderEffect,
      );
    }
  });

  it('§13: SOFT_BENEFIT is strong for PROMOTION_SENSITIVE and near-zero for PROMOTION_INSENSITIVE', () => {
    const sensitive = PERSONA_PROFILES.PROMOTION_SENSITIVE.softBenefitEffect;
    const insensitive =
      PERSONA_PROFILES.PROMOTION_INSENSITIVE.softBenefitEffect;
    expect(sensitive).toBeGreaterThan(0.2);
    expect(insensitive).toBeLessThan(0.02);
    expect(sensitive).toBeGreaterThan(insensitive * 10);
  });

  it('HIGH_CHURN has the highest churn hazard of all personas', () => {
    const highChurnHazard = PERSONA_PROFILES.HIGH_CHURN.churnHazardPerCycle;
    for (const type of ALL_PERSONA_TYPES) {
      if (type === 'HIGH_CHURN') continue;
      expect(PERSONA_PROFILES[type].churnHazardPerCycle).toBeLessThanOrEqual(
        highChurnHazard,
      );
    }
  });
});

describe('DEFAULT_PERSONA_MIX — a valid, complete population distribution', () => {
  it('covers exactly the defined personas and sums to 1', () => {
    expect(Object.keys(DEFAULT_PERSONA_MIX).sort()).toEqual(
      [...ALL_PERSONA_TYPES].sort(),
    );
    const total = Object.values(DEFAULT_PERSONA_MIX).reduce(
      (sum, share) => sum + share,
      0,
    );
    expect(total).toBeCloseTo(1, 5);
  });

  it('every share is strictly positive — no persona is silently unreachable', () => {
    for (const share of Object.values(DEFAULT_PERSONA_MIX)) {
      expect(share).toBeGreaterThan(0);
    }
  });
});

describe('pickPersona — §8/§9: seeded, reproducible persona assignment', () => {
  it('always returns one of the 9 defined persona types', () => {
    const rng = createSeededRandom(1);
    for (let i = 0; i < 500; i++) {
      expect(ALL_PERSONA_TYPES).toContain(pickPersona(rng));
    }
  });

  it('is fully reproducible for the same seed', () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    const seqA = Array.from({ length: 200 }, () => pickPersona(a));
    const seqB = Array.from({ length: 200 }, () => pickPersona(b));
    expect(seqA).toEqual(seqB);
  });

  it('produces a different sequence for a different seed', () => {
    const a = createSeededRandom(1);
    const b = createSeededRandom(2);
    const seqA = Array.from({ length: 200 }, () => pickPersona(a));
    const seqB = Array.from({ length: 200 }, () => pickPersona(b));
    expect(seqA).not.toEqual(seqB);
  });

  it('respects a custom mix — a 100% single-persona mix always returns that persona', () => {
    const rng = createSeededRandom(7);
    const mix = Object.fromEntries(
      ALL_PERSONA_TYPES.map((t) => [t, t === 'HIGH_CHURN' ? 1 : 0]),
    ) as Record<PersonaType, number>;
    for (let i = 0; i < 100; i++) {
      expect(pickPersona(rng, mix)).toBe('HIGH_CHURN');
    }
  });

  it('over many draws, lands close to the configured mix proportions', () => {
    const rng = createSeededRandom(99);
    const counts: Record<PersonaType, number> = Object.fromEntries(
      ALL_PERSONA_TYPES.map((t) => [t, 0]),
    ) as Record<PersonaType, number>;
    const trials = 50_000;
    for (let i = 0; i < trials; i++) {
      counts[pickPersona(rng)]++;
    }
    for (const type of ALL_PERSONA_TYPES) {
      const observed = counts[type] / trials;
      const expected = DEFAULT_PERSONA_MIX[type];
      expect(Math.abs(observed - expected)).toBeLessThan(0.02);
    }
  });
});
