import { RetentionStrategyType } from '@prisma/client';
import {
  proposeAllocation,
  type CurrentAllocationEntry,
} from './allocation-proposal';

function entry(
  variantId: string,
  strategyType: RetentionStrategyType,
  allocationPercent: number,
): CurrentAllocationEntry {
  return { variantId, strategyType, allocationPercent };
}

const BASE = {
  minimumControlPercent: 10,
  minimumExplorationPercent: 15,
  maxAllocationChangePerOptimization: 15,
};

function sum(allocations: Record<string, number>) {
  return Object.values(allocations).reduce((a, b) => a + b, 0);
}

describe('proposeAllocation — Fase G §20: core invariants', () => {
  const current = [
    entry('control', RetentionStrategyType.CONTROL, 15),
    entry('reminder', RetentionStrategyType.REMINDER, 30),
    entry('upgrade', RetentionStrategyType.SOFT_BENEFIT, 30),
    entry('discount', RetentionStrategyType.STRONG_BENEFIT, 25),
  ];

  it('returns unchanged when there is no winner (NO_CONCLUSION)', () => {
    const result = proposeAllocation({
      current,
      winnerVariantId: null,
      ...BASE,
    });
    expect(result.changed).toBe(false);
    expect(result.allocations).toEqual({
      control: 15,
      reminder: 30,
      upgrade: 30,
      discount: 25,
    });
  });

  it('always sums to exactly 100', () => {
    const result = proposeAllocation({
      current,
      winnerVariantId: 'upgrade',
      ...BASE,
    });
    expect(sum(result.allocations)).toBe(100);
  });

  it('never drops CONTROL below minimumControlPercent', () => {
    const result = proposeAllocation({
      current,
      winnerVariantId: 'upgrade',
      ...BASE,
    });
    expect(result.allocations.control).toBeGreaterThanOrEqual(10);
  });

  it('never drops combined exploration (non-winner, non-control) below minimumExplorationPercent', () => {
    const result = proposeAllocation({
      current,
      winnerVariantId: 'upgrade',
      ...BASE,
    });
    const exploration =
      result.allocations.reminder + result.allocations.discount;
    expect(exploration).toBeGreaterThanOrEqual(15);
  });

  it('increases the winner, never shrinks it', () => {
    const result = proposeAllocation({
      current,
      winnerVariantId: 'upgrade',
      ...BASE,
    });
    expect(result.allocations.upgrade).toBeGreaterThan(30);
  });

  it('never moves the winner by more than maxAllocationChangePerOptimization in one round', () => {
    const result = proposeAllocation({
      current,
      winnerVariantId: 'upgrade',
      ...BASE,
    });
    expect(result.allocations.upgrade - 30).toBeLessThanOrEqual(15);
  });

  it('never leaves any allocation negative', () => {
    const result = proposeAllocation({
      current,
      winnerVariantId: 'upgrade',
      ...BASE,
    });
    for (const value of Object.values(result.allocations)) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it('marks changed=true when the winner actually grows', () => {
    const result = proposeAllocation({
      current,
      winnerVariantId: 'upgrade',
      ...BASE,
    });
    expect(result.changed).toBe(true);
  });
});

describe('proposeAllocation — repeated rounds are gradual, not one big jump', () => {
  it('two consecutive optimizations never produce a 25→70 style jump in one round', () => {
    let allocation = [
      entry('control', RetentionStrategyType.CONTROL, 15),
      entry('reminder', RetentionStrategyType.REMINDER, 30),
      entry('upgrade', RetentionStrategyType.SOFT_BENEFIT, 25),
      entry('discount', RetentionStrategyType.STRONG_BENEFIT, 30),
    ];

    const round1 = proposeAllocation({
      current: allocation,
      winnerVariantId: 'upgrade',
      ...BASE,
    });
    expect(round1.allocations.upgrade - 25).toBeLessThanOrEqual(15);

    allocation = allocation.map((v) => ({
      ...v,
      allocationPercent: round1.allocations[v.variantId],
    }));

    const round2 = proposeAllocation({
      current: allocation,
      winnerVariantId: 'upgrade',
      ...BASE,
    });
    expect(
      round2.allocations.upgrade - round1.allocations.upgrade,
    ).toBeLessThanOrEqual(15);
    // Across two rounds it can still approach a much larger share...
    expect(round2.allocations.upgrade).toBeGreaterThan(
      round1.allocations.upgrade,
    );
    // ...but never in a single round.
  });
});

describe('proposeAllocation — negative-uplift / near-floor losers (Fase G §12)', () => {
  it('shrinks a losing variant gradually rather than zeroing it in one round', () => {
    const current = [
      entry('control', RetentionStrategyType.CONTROL, 15),
      entry('reminder', RetentionStrategyType.REMINDER, 10), // small already
      entry('upgrade', RetentionStrategyType.SOFT_BENEFIT, 50),
      entry('discount', RetentionStrategyType.STRONG_BENEFIT, 25),
    ];
    const result = proposeAllocation({
      current,
      winnerVariantId: 'upgrade',
      ...BASE,
    });
    // reminder can shrink, but never below 0 and never by more than maxStep.
    expect(result.allocations.reminder).toBeGreaterThanOrEqual(0);
    expect(10 - result.allocations.reminder).toBeLessThanOrEqual(15);
  });

  it('never lets combined exploration go below the floor even with an aggressive winner ceiling', () => {
    const current = [
      entry('control', RetentionStrategyType.CONTROL, 10),
      entry('reminder', RetentionStrategyType.REMINDER, 5),
      entry('upgrade', RetentionStrategyType.SOFT_BENEFIT, 75),
      entry('discount', RetentionStrategyType.STRONG_BENEFIT, 10),
    ];
    const result = proposeAllocation({
      current,
      winnerVariantId: 'upgrade',
      minimumControlPercent: 10,
      minimumExplorationPercent: 15,
      maxAllocationChangePerOptimization: 30,
    });
    const exploration =
      result.allocations.reminder + result.allocations.discount;
    expect(exploration).toBeGreaterThanOrEqual(15);
    expect(sum(result.allocations)).toBe(100);
  });
});

describe('proposeAllocation — CONTROL correction when it starts below the floor', () => {
  it('grows an under-floor CONTROL toward the minimum, gradually', () => {
    const current = [
      entry('control', RetentionStrategyType.CONTROL, 5), // below the 10% floor
      entry('reminder', RetentionStrategyType.REMINDER, 45),
      entry('upgrade', RetentionStrategyType.SOFT_BENEFIT, 50),
    ];
    const result = proposeAllocation({
      current,
      winnerVariantId: 'upgrade',
      ...BASE,
    });
    expect(result.allocations.control).toBeGreaterThan(5);
    expect(result.allocations.control).toBeLessThanOrEqual(10);
    expect(sum(result.allocations)).toBe(100);
  });
});

describe('proposeAllocation — budget-constrained variant (Fase G §14)', () => {
  it('never increases a variant blocked from growth, even if it is the winner', () => {
    const current = [
      entry('control', RetentionStrategyType.CONTROL, 15),
      entry('reminder', RetentionStrategyType.REMINDER, 35),
      entry('discount', RetentionStrategyType.STRONG_BENEFIT, 50),
    ];
    const result = proposeAllocation({
      current,
      winnerVariantId: 'discount',
      blockedFromIncrease: new Set(['discount']),
      ...BASE,
    });
    expect(result.allocations.discount).toBeLessThanOrEqual(50);
    expect(sum(result.allocations)).toBe(100);
  });
});

describe('proposeAllocation — single non-control variant', () => {
  it('handles a 2-variant experiment (CONTROL + one winner) without a loser to shrink', () => {
    const current = [
      entry('control', RetentionStrategyType.CONTROL, 20),
      entry('upgrade', RetentionStrategyType.SOFT_BENEFIT, 80),
    ];
    const result = proposeAllocation({
      current,
      winnerVariantId: 'upgrade',
      minimumControlPercent: 10,
      minimumExplorationPercent: 0, // no other variant to explore
      maxAllocationChangePerOptimization: 15,
    });
    expect(sum(result.allocations)).toBe(100);
    expect(result.allocations.control).toBeGreaterThanOrEqual(10);
  });
});
