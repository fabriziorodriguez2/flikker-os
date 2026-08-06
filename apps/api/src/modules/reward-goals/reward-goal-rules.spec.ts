import { CustomerSegment } from '@prisma/client';
import {
  decideRewardGoal,
  pickTargetAdditionalVisits,
} from './reward-goal-rules';

function input(
  overrides: Partial<Parameters<typeof decideRewardGoal>[0]> = {},
) {
  return {
    segment: CustomerSegment.NEW,
    hasActiveGoal: false,
    cooldownActive: false,
    eligibleIncentiveIds: ['inc-1'],
    overrideMinVisits: null,
    overrideMaxVisits: null,
    ...overrides,
  };
}

describe('decideRewardGoal — gating (Fase E §7/§33)', () => {
  it('never creates a second goal while one is already ACTIVE', () => {
    expect(decideRewardGoal(input({ hasActiveGoal: true }))).toEqual({
      action: 'NO_GOAL',
      reasonCode: 'ALREADY_HAS_ACTIVE_GOAL',
    });
  });

  it('respects the post-unlock cooldown', () => {
    expect(decideRewardGoal(input({ cooldownActive: true }))).toEqual({
      action: 'NO_GOAL',
      reasonCode: 'COOLDOWN_ACTIVE',
    });
  });

  it('refuses when there is no eligible incentive to offer', () => {
    expect(decideRewardGoal(input({ eligibleIncentiveIds: [] }))).toEqual({
      action: 'NO_GOAL',
      reasonCode: 'NO_ELIGIBLE_INCENTIVE',
    });
  });
});

describe('decideRewardGoal — segment defaults (Fase E §9)', () => {
  it('NEW asks for exactly 1 more visit', () => {
    const result = decideRewardGoal(input({ segment: CustomerSegment.NEW }));
    expect(result).toMatchObject({
      action: 'CREATE_GOAL',
      targetAdditionalVisits: 1,
    });
  });

  it('REPEAT asks for 2', () => {
    const result = decideRewardGoal(input({ segment: CustomerSegment.REPEAT }));
    expect(result).toMatchObject({ targetAdditionalVisits: 2 });
  });

  it('FREQUENT asks for the low end of its wider range (3)', () => {
    const result = decideRewardGoal(
      input({ segment: CustomerSegment.FREQUENT }),
    );
    expect(result).toMatchObject({ targetAdditionalVisits: 3 });
  });

  it('RECOVERED asks for a short reinforcement goal (1)', () => {
    const result = decideRewardGoal(
      input({ segment: CustomerSegment.RECOVERED }),
    );
    expect(result).toMatchObject({ targetAdditionalVisits: 1 });
  });

  it('AT_RISK never gets an automatic long goal — defers to the Retention Engine', () => {
    expect(
      decideRewardGoal(input({ segment: CustomerSegment.AT_RISK })),
    ).toEqual({
      action: 'NO_GOAL',
      reasonCode: 'AT_RISK_DEFERRED_TO_RETENTION_ENGINE',
    });
  });

  it('INACTIVE never gets an automatic long goal either', () => {
    expect(
      decideRewardGoal(input({ segment: CustomerSegment.INACTIVE })),
    ).toEqual({
      action: 'NO_GOAL',
      reasonCode: 'INACTIVE_DEFERRED_TO_RETENTION_ENGINE',
    });
  });
});

describe('decideRewardGoal — incentive selection is deterministic', () => {
  it('always picks the same incentive for the same candidate set, regardless of order', () => {
    const a = decideRewardGoal(
      input({ eligibleIncentiveIds: ['inc-b', 'inc-a'] }),
    );
    const b = decideRewardGoal(
      input({ eligibleIncentiveIds: ['inc-a', 'inc-b'] }),
    );
    expect(a).toEqual(b);
    expect(a).toMatchObject({ incentiveDefinitionId: 'inc-a' });
  });
});

describe('pickTargetAdditionalVisits — owner override (Fase E §31)', () => {
  it('uses the segment default when there is no override', () => {
    expect(pickTargetAdditionalVisits({ min: 3, max: 5 }, null, null)).toBe(3);
  });

  it('raises the floor when the override minimum is higher', () => {
    expect(pickTargetAdditionalVisits({ min: 1, max: 1 }, 3, null)).toBe(3);
  });

  it('falls back to the segment minimum if the override range is inverted/invalid', () => {
    expect(pickTargetAdditionalVisits({ min: 3, max: 5 }, 10, 2)).toBe(3);
  });

  it('clamps to the override maximum when it is lower than the segment default', () => {
    expect(pickTargetAdditionalVisits({ min: 3, max: 5 }, null, 4)).toBe(3);
  });
});
