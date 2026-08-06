// ─── Retention Engine V2 — shared types (Fase C.5) ─────────────────────────
// Mirrors the API's response shapes exactly. Kept in one file so the four
// sections of the page (settings, incentives, experiments, dry run) agree on
// what the backend actually returns.

export type BenefitType = "discount" | "gift" | "raffle" | "promotion" | "other";

export type RetentionObjective =
  | "SECOND_VISIT"
  | "AT_RISK_RECOVERY"
  | "INACTIVE_RECOVERY";

export type CustomerSegment =
  | "NEW"
  | "REPEAT"
  | "FREQUENT"
  | "AT_RISK"
  | "INACTIVE"
  | "RECOVERED";

export type RetentionStrategyType =
  | "CONTROL"
  | "REMINDER"
  | "SOFT_BENEFIT"
  | "STRONG_BENEFIT";

export type RetentionExperimentStatus =
  | "DRAFT"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED";

export interface RetentionSettingsView {
  businessId: string;
  automaticCampaignsEnabled: boolean;
  averageTicketAmount: string | number | null;
  estimatedMarginPercent: number | null;
  minimumDaysBetweenRetentionMessages: number;
  maximumRetentionMessagesPer30Days: number;
  sendingHourStart: number;
  sendingHourEnd: number;
  allowedSendingDays: number[];
  controlGroupPercent: number;
  minimumSampleSizeForRecommendations: number;
  maxAutomatedIncentivesPerMonth: number | null;
  maxEstimatedIncentiveCostPerMonth: string | number | null;
  dryRunEnabled: boolean;
  hasIncentiveBearingVariants: boolean;
  budgetConfigured: boolean;
  // Fase E — Reward Goals.
  rewardGoalsEnabled: boolean;
  rewardGoalMinVisits: number | null;
  rewardGoalMaxVisits: number | null;
  rewardGoalCooldownDays: number;
  maxPromisedRewardGoalsPerIncentive: number | null;
}

export interface RetentionIncentive {
  id: string;
  name: string;
  type: BenefitType;
  percentageValue: number | null;
  fixedValue: string | number | null;
  estimatedCost: string | number | null;
  description: string | null;
  conditions: string | null;
  expiresInDays: number;
  active: boolean;
  automationEligible: boolean;
  rewardGoalEligible: boolean;
  maxRedemptionsPerCustomer: number | null;
  maxTotalRedemptions: number | null;
  validDays: number[];
}

export interface RetentionVariant {
  id: string;
  name: string;
  strategyType: RetentionStrategyType;
  incentiveDefinitionId: string | null;
  incentiveDefinition: RetentionIncentive | null;
  allocationPercent: number;
  active: boolean;
}

export interface RetentionExperiment {
  id: string;
  name: string;
  objective: RetentionObjective;
  segment: CustomerSegment | null;
  status: RetentionExperimentStatus;
  variants: RetentionVariant[];
}

export interface DryRunReport {
  date: string;
  analyzed: number;
  detectedAtRisk: number;
  wouldControl: number;
  wouldSend: number;
  wouldOfferIncentive: number;
  /** Fase E §32 — reward goals the engine would have created today. */
  wouldCreateRewardGoals: number;
  rewardGoalsByReason: Record<string, number>;
}

export const REWARD_GOAL_REASON_LABEL: Record<string, string> = {
  NEW_SECOND_VISIT: "de segunda visita",
  REPEAT_HABIT_BUILDING: "de recurrencia",
  FREQUENT_LOW_FREQUENCY_REWARD: "de frecuencia alta",
  RECOVERED_REINFORCEMENT: "post-recuperación",
};

// ─── Results (Fase D) ───────────────────────────────────────────────────────

export type EvidenceState = "INSUFFICIENT_DATA" | "PRELIMINARY" | "ENOUGH_DATA";

export interface VariantStats {
  variantId: string;
  assignedCount: number;
  exposedCount: number;
  returnedCount: number;
  confirmedReturnedCount: number;
  nonReturnedCount: number;
  returnRate: number;
  confirmedReturnRate: number;
  averageDaysToReturn: number | null;
  medianDaysToReturn: number | null;
  evidenceState: EvidenceState;
}

export interface EconomicsResult {
  associatedRevenueEstimate: number | null;
  incrementalRevenueEstimate: number | null;
  incrementalGrossMarginEstimate: number | null;
  knownPromotionalCost: number;
  estimatedPromotionalCost: number;
  unknownCostRedemptions: number;
  estimatedNetIncrementalValue: number | null;
  estimatedROI: number | null;
}

export interface VariantResult {
  variantId: string;
  variantName: string;
  strategyType: RetentionStrategyType;
  stats: VariantStats;
  upliftPercentagePoints: number | null;
  estimatedIncrementalReturns: number | null;
  economics: EconomicsResult;
  significanceVsControl: { pValue: number; zScore: number } | null;
}

export type WinnerConclusion =
  | { kind: "NO_CONCLUSION"; reason: string }
  | { kind: "BEST_RETURN_RATE"; variantId: string }
  | { kind: "BEST_INCREMENTAL_VALUE"; variantId: string };

export interface ExperimentResults {
  experimentId: string;
  experimentName: string;
  attributionWindowDays: number;
  controlVariantId: string | null;
  variants: VariantResult[];
  winner: WinnerConclusion;
}

export interface ExperimentOverview {
  experimentId: string;
  experimentName: string;
  status: RetentionExperimentStatus;
  exposedCount: number;
  returnedCount: number;
  confirmedReturnedCount: number;
  controlReturnRate: number | null;
  bestVariant: { variantId: string; variantName: string } | null;
  upliftBestVariant: number | null;
  estimatedIncrementalReturns: number | null;
  incrementalRevenueEstimate: number | null;
  winner: WinnerConclusion;
}

export const EVIDENCE_LABEL: Record<EvidenceState, string> = {
  INSUFFICIENT_DATA: "Datos insuficientes",
  PRELIMINARY: "Preliminar",
  ENOUGH_DATA: "Suficiente",
};

export const OBJECTIVE_LABEL: Record<RetentionObjective, string> = {
  SECOND_VISIT: "Segunda visita",
  AT_RISK_RECOVERY: "Recuperar clientes en riesgo",
  INACTIVE_RECOVERY: "Recuperar clientes inactivos",
};

export const STRATEGY_LABEL: Record<RetentionStrategyType, string> = {
  CONTROL: "Control (sin mensaje)",
  REMINDER: "Recordatorio",
  SOFT_BENEFIT: "Beneficio suave",
  STRONG_BENEFIT: "Beneficio fuerte",
};

export const STATUS_LABEL: Record<RetentionExperimentStatus, string> = {
  DRAFT: "Borrador",
  RUNNING: "Activo",
  PAUSED: "Pausado",
  COMPLETED: "Finalizado",
};

export const TYPE_LABEL: Record<BenefitType, string> = {
  discount: "Descuento",
  gift: "Regalo",
  raffle: "Sorteo",
  promotion: "Promoción",
  other: "Otro",
};
