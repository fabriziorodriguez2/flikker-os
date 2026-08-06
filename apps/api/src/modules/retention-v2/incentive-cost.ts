import { Prisma } from '@prisma/client';

/**
 * One estimate of what a single redemption of an incentive costs the
 * business — shared by the monthly budget check (Fase C.5, fixed in Fase D
 * §19) and the economics service (Fase D §18), so the two never disagree on
 * the same incentive's cost.
 *
 * Priority, matching the product rule exactly:
 *   1. `RetentionIncentiveDefinition.estimatedCost`, when the owner declared
 *      one explicitly — always wins, whatever the type.
 *   2. A percentage discount with no explicit cost: estimated from the
 *      business's own `averageTicketAmount`, if configured.
 *   3. A fixed-amount discount with no explicit cost: the fixed value itself
 *      IS the cost (a $100 OFF costs the business $100).
 *   4. Anything else (a gift/upgrade/raffle with neither an explicit cost nor
 *      a percentage) — genuinely unknown. Returned as `null`, never guessed.
 */
export interface IncentiveCostEstimate {
  cost: number;
  /** False only for case 1 (an explicit, owner-declared cost). */
  estimated: boolean;
}

export function estimateIncentiveCost(
  definition: {
    estimatedCost: Prisma.Decimal | number | null;
    percentageValue: number | null;
    fixedValue: Prisma.Decimal | number | null;
  },
  averageTicketAmount: Prisma.Decimal | number | null,
): IncentiveCostEstimate | null {
  if (definition.estimatedCost != null) {
    return { cost: Number(definition.estimatedCost), estimated: false };
  }

  if (definition.percentageValue != null) {
    if (averageTicketAmount == null) return null;
    // percentageValue is stored as a whole number (10 for "10% OFF"), so it
    // is a fraction of the ticket, not the ticket amount itself.
    return {
      cost: (definition.percentageValue / 100) * Number(averageTicketAmount),
      estimated: true,
    };
  }

  if (definition.fixedValue != null) {
    return { cost: Number(definition.fixedValue), estimated: true };
  }

  return null;
}
