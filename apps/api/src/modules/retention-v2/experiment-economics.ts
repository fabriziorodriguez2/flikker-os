import { estimateIncentiveCost } from './incentive-cost';

/**
 * Pure economics for one variant (Fase D §15-21). Every field is an
 * ESTIMATE built from the owner's own declared numbers (`averageTicketAmount`,
 * `estimatedMarginPercent`) — never invented, and never shown at all when the
 * underlying number is missing. See the UX copy rules in Fase D §25/§39: this
 * module only computes the figures, the labels ("ingreso asociado estimado",
 * never "ingreso generado") are the UI's job.
 */

export interface EconomicsInput {
  returnedCount: number;
  confirmedReturnedCount: number;
  estimatedIncrementalReturns: number | null;
  averageTicketAmount: number | null;
  estimatedMarginPercent: number | null;
  /** The variant's incentive, when it carries one — null for CONTROL/REMINDER. */
  incentiveDefinition: {
    estimatedCost: number | null;
    percentageValue: number | null;
    fixedValue: number | null;
  } | null;
}

export interface EconomicsResult {
  associatedRevenueEstimate: number | null;
  incrementalRevenueEstimate: number | null;
  incrementalGrossMarginEstimate: number | null;
  knownPromotionalCost: number;
  estimatedPromotionalCost: number;
  unknownCostRedemptions: number;
  /** Null whenever any redemption's cost is unknown — never an undercount. */
  estimatedNetIncrementalValue: number | null;
  estimatedROI: number | null;
}

export function computeEconomics(input: EconomicsInput): EconomicsResult {
  const {
    associatedRevenueEstimate,
    incrementalRevenueEstimate,
    incrementalGrossMarginEstimate,
  } = computeRevenueAndMargin(input);

  const promo = computePromotionalCost(input);
  const totalPromotionalCost =
    promo.knownPromotionalCost + promo.estimatedPromotionalCost;

  const { estimatedNetIncrementalValue, estimatedROI } = computeNetAndRoi(
    incrementalGrossMarginEstimate,
    totalPromotionalCost,
    promo.unknownCostRedemptions,
  );

  return {
    associatedRevenueEstimate,
    incrementalRevenueEstimate,
    incrementalGrossMarginEstimate,
    ...promo,
    estimatedNetIncrementalValue,
    estimatedROI,
  };
}

function computeRevenueAndMargin(input: EconomicsInput) {
  if (input.averageTicketAmount === null) {
    return {
      associatedRevenueEstimate: null,
      incrementalRevenueEstimate: null,
      incrementalGrossMarginEstimate: null,
    };
  }

  const associatedRevenueEstimate =
    input.returnedCount * input.averageTicketAmount;
  const incrementalRevenueEstimate =
    input.estimatedIncrementalReturns === null
      ? null
      : input.estimatedIncrementalReturns * input.averageTicketAmount;

  const incrementalGrossMarginEstimate =
    incrementalRevenueEstimate === null || input.estimatedMarginPercent === null
      ? null
      : incrementalRevenueEstimate * (input.estimatedMarginPercent / 100);

  return {
    associatedRevenueEstimate,
    incrementalRevenueEstimate,
    incrementalGrossMarginEstimate,
  };
}

/**
 * Cost is charged per CONFIRMED redemption (`confirmedReturnedCount`), not
 * per return: a customer who came back without redeeming the benefit never
 * cost the business anything (Fase D §18).
 */
function computePromotionalCost(input: EconomicsInput) {
  if (!input.incentiveDefinition || input.confirmedReturnedCount === 0) {
    return {
      knownPromotionalCost: 0,
      estimatedPromotionalCost: 0,
      unknownCostRedemptions: 0,
    };
  }

  const unit = estimateIncentiveCost(
    input.incentiveDefinition,
    input.averageTicketAmount,
  );

  if (!unit) {
    return {
      knownPromotionalCost: 0,
      estimatedPromotionalCost: 0,
      unknownCostRedemptions: input.confirmedReturnedCount,
    };
  }

  const total = unit.cost * input.confirmedReturnedCount;
  return unit.estimated
    ? {
        knownPromotionalCost: 0,
        estimatedPromotionalCost: total,
        unknownCostRedemptions: 0,
      }
    : {
        knownPromotionalCost: total,
        estimatedPromotionalCost: 0,
        unknownCostRedemptions: 0,
      };
}

/**
 * Net value and ROI are withheld (not undercounted) whenever any redemption's
 * cost is unknown, or margin cannot be computed at all (Fase D §20/§21). ROI
 * is also withheld at zero cost rather than shown as an undefined infinity.
 */
function computeNetAndRoi(
  incrementalGrossMarginEstimate: number | null,
  totalPromotionalCost: number,
  unknownCostRedemptions: number,
) {
  if (incrementalGrossMarginEstimate === null || unknownCostRedemptions > 0) {
    return { estimatedNetIncrementalValue: null, estimatedROI: null };
  }

  const estimatedNetIncrementalValue =
    incrementalGrossMarginEstimate - totalPromotionalCost;
  const estimatedROI =
    totalPromotionalCost > 0
      ? estimatedNetIncrementalValue / totalPromotionalCost
      : null;

  return { estimatedNetIncrementalValue, estimatedROI };
}
