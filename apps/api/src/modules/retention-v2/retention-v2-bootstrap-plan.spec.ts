import { RetentionObjective, RetentionStrategyType } from '@prisma/client';
import {
  computeDesiredVariants,
  shapesMatch,
} from './retention-v2-bootstrap-plan';

describe('computeDesiredVariants — recovery objectives', () => {
  it('with zero authorized benefits, is exactly CONTROL + REMINDER', () => {
    const result = computeDesiredVariants(
      RetentionObjective.AT_RISK_RECOVERY,
      15,
      [],
    );

    expect(result.map((v) => v.strategyType)).toEqual([
      RetentionStrategyType.CONTROL,
      RetentionStrategyType.REMINDER,
    ]);
  });

  it('allocation always sums to exactly 100', () => {
    for (const benefitCount of [0, 1, 2, 3, 5]) {
      const result = computeDesiredVariants(
        RetentionObjective.INACTIVE_RECOVERY,
        15,
        Array.from({ length: benefitCount }, (_, i) => `ben-${i}`),
      );
      const total = result.reduce((sum, v) => sum + v.allocationPercent, 0);
      expect(total).toBe(100);
    }
  });

  it('CONTROL keeps a non-zero share even with an extreme configured percent', () => {
    const zero = computeDesiredVariants(RetentionObjective.SECOND_VISIT, 0, []);
    expect(zero[0].strategyType).toBe(RetentionStrategyType.CONTROL);
    expect(zero[0].allocationPercent).toBeGreaterThan(0);

    const hundred = computeDesiredVariants(
      RetentionObjective.SECOND_VISIT,
      100,
      [],
    );
    expect(hundred[0].allocationPercent).toBeLessThan(100);
    // At least one treatment arm always keeps a share too.
    expect(hundred[1].allocationPercent).toBeGreaterThan(0);
  });

  it('REMINDER stays present even when benefits are authorized — "solo recordatorio" must remain reachable', () => {
    const result = computeDesiredVariants(
      RetentionObjective.AT_RISK_RECOVERY,
      15,
      ['ben-1', 'ben-2'],
    );

    expect(result.map((v) => v.strategyType)).toEqual([
      RetentionStrategyType.CONTROL,
      RetentionStrategyType.REMINDER,
      RetentionStrategyType.SOFT_BENEFIT,
      RetentionStrategyType.SOFT_BENEFIT,
    ]);
  });

  it('one SOFT_BENEFIT variant per authorized incentive, each pointing at its own id', () => {
    const result = computeDesiredVariants(
      RetentionObjective.AT_RISK_RECOVERY,
      15,
      ['ben-1', 'ben-2'],
    );

    const incentiveIds = result
      .filter((v) => v.strategyType === RetentionStrategyType.SOFT_BENEFIT)
      .map((v) => v.incentiveDefinitionId);
    expect(incentiveIds.sort()).toEqual(['ben-1', 'ben-2']);
  });
});

describe('computeDesiredVariants — REWARD_GOAL_PROGRESS', () => {
  it('is exactly CONTROL + PROGRESS_REMINDER, regardless of authorized benefits', () => {
    const result = computeDesiredVariants(
      RetentionObjective.REWARD_GOAL_PROGRESS,
      15,
      ['ben-1'], // progress never carries a benefit — must be ignored
    );

    expect(result.map((v) => v.strategyType)).toEqual([
      RetentionStrategyType.CONTROL,
      RetentionStrategyType.PROGRESS_REMINDER,
    ]);
    expect(result.every((v) => v.incentiveDefinitionId === null)).toBe(true);
  });
});

describe('shapesMatch', () => {
  it('matches identical shapes regardless of order', () => {
    const a = [
      {
        strategyType: RetentionStrategyType.REMINDER,
        incentiveDefinitionId: null,
      },
      {
        strategyType: RetentionStrategyType.CONTROL,
        incentiveDefinitionId: null,
      },
    ];
    const b = [
      {
        strategyType: RetentionStrategyType.CONTROL,
        incentiveDefinitionId: null,
      },
      {
        strategyType: RetentionStrategyType.REMINDER,
        incentiveDefinitionId: null,
      },
    ];
    expect(shapesMatch(a, b)).toBe(true);
  });

  it('a newly authorized benefit changes the shape', () => {
    const before = [
      {
        strategyType: RetentionStrategyType.CONTROL,
        incentiveDefinitionId: null,
      },
      {
        strategyType: RetentionStrategyType.REMINDER,
        incentiveDefinitionId: null,
      },
    ];
    const after = [
      {
        strategyType: RetentionStrategyType.CONTROL,
        incentiveDefinitionId: null,
      },
      {
        strategyType: RetentionStrategyType.REMINDER,
        incentiveDefinitionId: null,
      },
      {
        strategyType: RetentionStrategyType.SOFT_BENEFIT,
        incentiveDefinitionId: 'ben-1',
      },
    ];
    expect(shapesMatch(after, before)).toBe(false);
  });

  it('a de-authorized benefit (removed variant) changes the shape', () => {
    const before = [
      {
        strategyType: RetentionStrategyType.CONTROL,
        incentiveDefinitionId: null,
      },
      {
        strategyType: RetentionStrategyType.REMINDER,
        incentiveDefinitionId: null,
      },
      {
        strategyType: RetentionStrategyType.SOFT_BENEFIT,
        incentiveDefinitionId: 'ben-1',
      },
    ];
    const after = [
      {
        strategyType: RetentionStrategyType.CONTROL,
        incentiveDefinitionId: null,
      },
      {
        strategyType: RetentionStrategyType.REMINDER,
        incentiveDefinitionId: null,
      },
    ];
    expect(shapesMatch(after, before)).toBe(false);
  });
});
