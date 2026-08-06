import { computeEconomics, type EconomicsInput } from './experiment-economics';

function input(overrides: Partial<EconomicsInput> = {}): EconomicsInput {
  return {
    returnedCount: 10,
    confirmedReturnedCount: 0,
    estimatedIncrementalReturns: 4,
    averageTicketAmount: null,
    estimatedMarginPercent: null,
    incentiveDefinition: null,
    ...overrides,
  };
}

describe('computeEconomics — revenue (Fase D §15-16)', () => {
  it('shows no revenue at all when the ticket is not configured', () => {
    const result = computeEconomics(input({ averageTicketAmount: null }));
    expect(result.associatedRevenueEstimate).toBeNull();
    expect(result.incrementalRevenueEstimate).toBeNull();
  });

  it('associated revenue is returnedCount × averageTicketAmount', () => {
    const result = computeEconomics(
      input({ returnedCount: 22, averageTicketAmount: 500 }),
    );
    expect(result.associatedRevenueEstimate).toBe(11000);
  });

  it('incremental revenue is estimatedIncrementalReturns × averageTicketAmount', () => {
    const result = computeEconomics(
      input({ estimatedIncrementalReturns: 14, averageTicketAmount: 500 }),
    );
    expect(result.incrementalRevenueEstimate).toBe(7000);
  });

  it('a negative uplift produces negative incremental revenue, shown as-is', () => {
    const result = computeEconomics(
      input({ estimatedIncrementalReturns: -3, averageTicketAmount: 500 }),
    );
    expect(result.incrementalRevenueEstimate).toBe(-1500);
  });
});

describe('computeEconomics — margin (Fase D §17)', () => {
  it('no margin figure when estimatedMarginPercent is not configured', () => {
    const result = computeEconomics(
      input({
        estimatedIncrementalReturns: 14,
        averageTicketAmount: 500,
        estimatedMarginPercent: null,
      }),
    );
    expect(result.incrementalGrossMarginEstimate).toBeNull();
  });

  it('applies the margin percentage to incremental revenue', () => {
    const result = computeEconomics(
      input({
        estimatedIncrementalReturns: 14,
        averageTicketAmount: 500,
        estimatedMarginPercent: 40,
      }),
    );
    expect(result.incrementalGrossMarginEstimate).toBe(2800); // 7000 * 0.4
  });
});

describe('computeEconomics — promotional cost (Fase D §18)', () => {
  it('is zero for CONTROL/REMINDER, which carry no incentive', () => {
    const result = computeEconomics(
      input({ incentiveDefinition: null, confirmedReturnedCount: 5 }),
    );
    expect(result.knownPromotionalCost).toBe(0);
    expect(result.estimatedPromotionalCost).toBe(0);
    expect(result.unknownCostRedemptions).toBe(0);
  });

  it('an explicit estimatedCost is a known cost', () => {
    const result = computeEconomics(
      input({
        confirmedReturnedCount: 4,
        incentiveDefinition: {
          estimatedCost: 20,
          percentageValue: null,
          fixedValue: null,
        },
      }),
    );
    expect(result.knownPromotionalCost).toBe(80);
    expect(result.estimatedPromotionalCost).toBe(0);
  });

  it('a percentage incentive with an average ticket is an estimated cost', () => {
    const result = computeEconomics(
      input({
        confirmedReturnedCount: 4,
        averageTicketAmount: 500,
        incentiveDefinition: {
          estimatedCost: null,
          percentageValue: 10,
          fixedValue: null,
        },
      }),
    );
    expect(result.estimatedPromotionalCost).toBe(200); // 4 * 50
    expect(result.knownPromotionalCost).toBe(0);
  });

  it('a fixed discount costs exactly its face value, estimated', () => {
    const result = computeEconomics(
      input({
        confirmedReturnedCount: 3,
        incentiveDefinition: {
          estimatedCost: null,
          percentageValue: null,
          fixedValue: 100,
        },
      }),
    );
    expect(result.estimatedPromotionalCost).toBe(300);
  });

  it('a gift/upgrade with nothing to estimate from is an unknown cost', () => {
    const result = computeEconomics(
      input({
        confirmedReturnedCount: 2,
        incentiveDefinition: {
          estimatedCost: null,
          percentageValue: null,
          fixedValue: null,
        },
      }),
    );
    expect(result.unknownCostRedemptions).toBe(2);
    expect(result.knownPromotionalCost).toBe(0);
    expect(result.estimatedPromotionalCost).toBe(0);
  });
});

describe('computeEconomics — net incremental value and ROI (Fase D §20-21)', () => {
  it('net value is margin minus total promotional cost', () => {
    const result = computeEconomics(
      input({
        estimatedIncrementalReturns: 14,
        averageTicketAmount: 500,
        estimatedMarginPercent: 40,
        confirmedReturnedCount: 4,
        incentiveDefinition: {
          estimatedCost: 20,
          percentageValue: null,
          fixedValue: null,
        },
      }),
    );
    // margin 2800 - cost 80
    expect(result.estimatedNetIncrementalValue).toBe(2720);
  });

  it('withholds net value entirely when margin is not calculable', () => {
    const result = computeEconomics(
      input({
        estimatedIncrementalReturns: 14,
        averageTicketAmount: 500,
        estimatedMarginPercent: null,
        confirmedReturnedCount: 4,
        incentiveDefinition: {
          estimatedCost: 20,
          percentageValue: null,
          fixedValue: null,
        },
      }),
    );
    expect(result.estimatedNetIncrementalValue).toBeNull();
    expect(result.estimatedROI).toBeNull();
    // Revenue and cost are still shown separately, per §20's own instruction.
    expect(result.incrementalRevenueEstimate).toBe(7000);
    expect(result.estimatedPromotionalCost + result.knownPromotionalCost).toBe(
      80,
    );
  });

  it('withholds net value when any redemption has an unknown cost, never underestimating it', () => {
    const result = computeEconomics(
      input({
        estimatedIncrementalReturns: 14,
        averageTicketAmount: 500,
        estimatedMarginPercent: 40,
        confirmedReturnedCount: 2,
        incentiveDefinition: {
          estimatedCost: null,
          percentageValue: null,
          fixedValue: null,
        },
      }),
    );
    expect(result.estimatedNetIncrementalValue).toBeNull();
  });

  it('computes ROI as net value over promotional cost', () => {
    const result = computeEconomics(
      input({
        estimatedIncrementalReturns: 14,
        averageTicketAmount: 500,
        estimatedMarginPercent: 40,
        confirmedReturnedCount: 4,
        incentiveDefinition: {
          estimatedCost: 20,
          percentageValue: null,
          fixedValue: null,
        },
      }),
    );
    expect(result.estimatedROI).toBeCloseTo(2720 / 80);
  });

  it('withholds ROI at zero promotional cost instead of showing infinity', () => {
    const result = computeEconomics(
      input({
        estimatedIncrementalReturns: 14,
        averageTicketAmount: 500,
        estimatedMarginPercent: 40,
        confirmedReturnedCount: 0,
        incentiveDefinition: null,
      }),
    );
    expect(result.estimatedNetIncrementalValue).not.toBeNull();
    expect(result.estimatedROI).toBeNull();
  });

  it('a negative uplift can produce a negative net incremental value, shown honestly', () => {
    const result = computeEconomics(
      input({
        estimatedIncrementalReturns: -3,
        averageTicketAmount: 500,
        estimatedMarginPercent: 40,
        confirmedReturnedCount: 2,
        incentiveDefinition: {
          estimatedCost: 50,
          percentageValue: null,
          fixedValue: null,
        },
      }),
    );
    // margin: -3*500*0.4 = -600; cost: 100 → net = -700
    expect(result.estimatedNetIncrementalValue).toBe(-700);
  });
});
