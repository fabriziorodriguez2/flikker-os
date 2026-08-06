import { Prisma } from '@prisma/client';
import { estimateIncentiveCost } from './incentive-cost';

function definition(overrides: Record<string, unknown> = {}) {
  return {
    estimatedCost: null,
    percentageValue: null,
    fixedValue: null,
    ...overrides,
  };
}

describe('estimateIncentiveCost — Fase D §19 (closing the C.5 percentage risk)', () => {
  it('an explicit estimatedCost always wins, whatever the type', () => {
    const result = estimateIncentiveCost(
      definition({ estimatedCost: 42, percentageValue: 10, fixedValue: 5 }),
      500,
    );
    expect(result).toEqual({ cost: 42, estimated: false });
  });

  it('estimates a percentage incentive from the average ticket', () => {
    const result = estimateIncentiveCost(
      definition({ percentageValue: 10 }),
      500,
    );
    expect(result).toEqual({ cost: 50, estimated: true });
  });

  it('a percentage incentive with no average ticket has an unknown cost', () => {
    const result = estimateIncentiveCost(
      definition({ percentageValue: 10 }),
      null,
    );
    expect(result).toBeNull();
  });

  it('a fixed-value incentive costs exactly its face value', () => {
    const result = estimateIncentiveCost(definition({ fixedValue: 100 }), null);
    expect(result).toEqual({ cost: 100, estimated: true });
  });

  it('a gift/upgrade with neither a declared cost nor a percentage is unknown', () => {
    const result = estimateIncentiveCost(definition(), 500);
    expect(result).toBeNull();
  });

  it('accepts Prisma.Decimal for both the definition and the ticket amount', () => {
    const result = estimateIncentiveCost(
      definition({ percentageValue: 20 }),
      new Prisma.Decimal(250),
    );
    expect(result).toEqual({ cost: 50, estimated: true });
  });

  it('a 0% average ticket produces a $0 estimate, not an unknown one', () => {
    const result = estimateIncentiveCost(
      definition({ percentageValue: 10 }),
      0,
    );
    expect(result).toEqual({ cost: 0, estimated: true });
  });
});
