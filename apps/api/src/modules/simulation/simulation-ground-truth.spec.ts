import {
  computeGroundTruth,
  computeEconomicGroundTruth,
} from './simulation-ground-truth';
import { PERSONA_PROFILES } from './personas';

describe('computeGroundTruth — §13/§23: the answer key, from secret personas only', () => {
  it('returns a null trueWinner for an empty population', () => {
    const result = computeGroundTruth([]);
    expect(result.trueWinner).toBeNull();
    expect(result.effectsByVariant).toHaveLength(3);
    for (const effect of result.effectsByVariant) {
      expect(effect.averageEffect).toBe(0);
    }
  });

  it('a population of all PROGRESS_SENSITIVE customers has PROGRESS_REMINDER as the true winner', () => {
    const customers = Array.from({ length: 50 }, () => ({
      persona: 'PROGRESS_SENSITIVE' as const,
    }));
    const result = computeGroundTruth(customers);
    expect(result.trueWinner).toBe('PROGRESS_REMINDER');

    const progress = result.effectsByVariant.find(
      (e) => e.variantCode === 'PROGRESS_REMINDER',
    );
    expect(progress?.averageEffect).toBeCloseTo(
      PERSONA_PROFILES.PROGRESS_SENSITIVE.progressReminderEffect,
      10,
    );
  });

  it('a population of all PROMOTION_SENSITIVE customers has SOFT_BENEFIT as the true winner', () => {
    const customers = Array.from({ length: 50 }, () => ({
      persona: 'PROMOTION_SENSITIVE' as const,
    }));
    const result = computeGroundTruth(customers);
    expect(result.trueWinner).toBe('SOFT_BENEFIT');
  });

  it('breaks an exact tie deterministically in favor of the first treatable code (REMINDER)', () => {
    // PROMOTION_INSENSITIVE: reminderEffect === progressReminderEffect === 0.05.
    const customers = Array.from({ length: 10 }, () => ({
      persona: 'PROMOTION_INSENSITIVE' as const,
    }));
    const result = computeGroundTruth(customers);
    expect(result.trueWinner).toBe('REMINDER');
  });

  it('averages correctly across a mixed population', () => {
    const customers = [
      { persona: 'PROGRESS_SENSITIVE' as const },
      { persona: 'PROMOTION_SENSITIVE' as const },
    ];
    const result = computeGroundTruth(customers);
    const softBenefit = result.effectsByVariant.find(
      (e) => e.variantCode === 'SOFT_BENEFIT',
    );
    const expected =
      (PERSONA_PROFILES.PROGRESS_SENSITIVE.softBenefitEffect +
        PERSONA_PROFILES.PROMOTION_SENSITIVE.softBenefitEffect) /
      2;
    expect(softBenefit?.averageEffect).toBeCloseTo(expected, 10);
  });

  it('always returns exactly the 3 treatable variant codes, never CONTROL', () => {
    const result = computeGroundTruth([{ persona: 'WEEKLY_REGULAR' }]);
    expect(result.effectsByVariant.map((e) => e.variantCode).sort()).toEqual(
      ['PROGRESS_REMINDER', 'REMINDER', 'SOFT_BENEFIT'].sort(),
    );
  });
});

describe('computeGroundTruth — pre-piloto fix §13/§14/§15: presentCodes restricts the comparable-for-winner set', () => {
  it('a two-arm scenario (CONTROL + REMINDER only) can never declare SOFT_BENEFIT the true winner, even though it would win unrestricted', () => {
    // PROMOTION_SENSITIVE: softBenefitEffect (0.25) far exceeds reminderEffect
    // (0.03) — unrestricted, SOFT_BENEFIT always wins. REMINDER is the only
    // code actually in a TWO_ARM_REMINDER experiment.
    const customers = Array.from({ length: 50 }, () => ({
      persona: 'PROMOTION_SENSITIVE' as const,
    }));
    const unrestricted = computeGroundTruth(customers);
    expect(unrestricted.trueWinner).toBe('SOFT_BENEFIT');

    const restricted = computeGroundTruth(customers, ['REMINDER']);
    expect(restricted.trueWinner).toBe('REMINDER');
    // effectsByVariant still reports all 3, for informational transparency —
    // only trueWinner is restricted.
    expect(restricted.effectsByVariant).toHaveLength(3);
  });

  it('never crashes and returns null when presentCodes is empty (defensive — every real experiment has at least one)', () => {
    const result = computeGroundTruth([{ persona: 'WEEKLY_REGULAR' }], []);
    expect(result.trueWinner).toBeNull();
  });
});

describe("computeEconomicGroundTruth — ajuste pre-piloto §1: a SEPARATE question from computeGroundTruth's return-based trueWinner", () => {
  const BASE_INPUT = {
    averageTicketAmount: 600,
    estimatedMarginPercent: 60,
    rewardRedemptionRate: 0.6,
    incentivePercentageValue: 10, // PERCENT_OFF_10, the seeder's default
  };

  it('agrees with the return-based winner when the cost-bearing variant is cheap relative to its return-rate lead', () => {
    const returnEffects = [
      { variantCode: 'REMINDER' as const, averageEffect: 0.05 },
      { variantCode: 'SOFT_BENEFIT' as const, averageEffect: 0.16 }, // large lead
      { variantCode: 'PROGRESS_REMINDER' as const, averageEffect: 0.06 },
    ];
    const result = computeEconomicGroundTruth(
      returnEffects,
      ['REMINDER', 'SOFT_BENEFIT', 'PROGRESS_REMINDER'],
      BASE_INPUT,
    );
    expect(result.economicWinner).toBe('SOFT_BENEFIT');
  });

  it('can DISAGREE with the return-based winner once real cost is subtracted — a real gap, not a bug', () => {
    // SOFT_BENEFIT's return-rate lead over REMINDER is real (0.16 vs 0.05,
    // 11pp) but its cost (10% of a 600 ticket, redeemed 60% of the time it
    // returns) can outweigh that lead once priced — exactly the STRONG_SIGNAL
    // finding this fix exists to let the report distinguish from a bug.
    const returnEffects = [
      { variantCode: 'REMINDER' as const, averageEffect: 0.05 },
      { variantCode: 'SOFT_BENEFIT' as const, averageEffect: 0.052 }, // near-identical return rate...
      { variantCode: 'PROGRESS_REMINDER' as const, averageEffect: 0.03 },
    ];
    const result = computeEconomicGroundTruth(
      returnEffects,
      ['REMINDER', 'SOFT_BENEFIT'],
      BASE_INPUT,
    );
    // ...but SOFT_BENEFIT alone pays a real redemption cost REMINDER never
    // does, so its net value per customer must be lower despite the (tiny)
    // return-rate edge.
    expect(result.economicWinner).toBe('REMINDER');
  });

  it('excludes a cost-bearing code from the winner computation when its true cost is genuinely unknown, rather than assuming zero', () => {
    const returnEffects = [
      { variantCode: 'REMINDER' as const, averageEffect: 0.05 },
      { variantCode: 'SOFT_BENEFIT' as const, averageEffect: 0.2 },
    ];
    const result = computeEconomicGroundTruth(
      returnEffects,
      ['REMINDER', 'SOFT_BENEFIT'],
      {
        ...BASE_INPUT,
        incentivePercentageValue: null,
      },
    );
    const softBenefit = result.effectsByVariant.find(
      (e) => e.variantCode === 'SOFT_BENEFIT',
    );
    expect(softBenefit?.trueNetValuePerCustomer).toBeNull();
    // REMINDER's cost is always known (zero) — it remains comparable and wins
    // by default once SOFT_BENEFIT is excluded, rather than the whole result
    // collapsing to null.
    expect(result.economicWinner).toBe('REMINDER');
  });

  it('never carries a cost for REMINDER/PROGRESS_REMINDER regardless of incentivePercentageValue', () => {
    const returnEffects = [
      { variantCode: 'REMINDER' as const, averageEffect: 0.1 },
      { variantCode: 'PROGRESS_REMINDER' as const, averageEffect: 0.1 },
    ];
    const result = computeEconomicGroundTruth(
      returnEffects,
      ['REMINDER', 'PROGRESS_REMINDER'],
      BASE_INPUT,
    );
    const reminder = result.effectsByVariant.find(
      (e) => e.variantCode === 'REMINDER',
    )!;
    const progress = result.effectsByVariant.find(
      (e) => e.variantCode === 'PROGRESS_REMINDER',
    )!;
    expect(reminder.trueNetValuePerCustomer).toBeCloseTo(
      progress.trueNetValuePerCustomer!,
      10,
    );
    expect(reminder.trueNetValuePerCustomer).toBeCloseTo(0.1 * 600 * 0.6, 10);
  });

  it('is null when no present code has a known cost/effect to compare', () => {
    const result = computeEconomicGroundTruth([], [], BASE_INPUT);
    expect(result.economicWinner).toBeNull();
  });
});
