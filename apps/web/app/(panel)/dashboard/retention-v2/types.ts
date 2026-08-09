// ─── Retention Engine V2 — shared types (Fase C.5) ─────────────────────────
// Mirrors the API's response shapes exactly. Kept in one file so the four
// sections of the page (settings, incentives, experiments, dry run) agree on
// what the backend actually returns.

export type BenefitType = "discount" | "gift" | "raffle" | "promotion" | "other";

export type RetentionObjective =
  | "SECOND_VISIT"
  | "AT_RISK_RECOVERY"
  | "INACTIVE_RECOVERY"
  // Piloto V2 — población: clientes con una CustomerRewardGoal ACTIVE (nunca
  // AT_RISK/INACTIVE). Solo admite variantes CONTROL/PROGRESS_REMINDER.
  | "REWARD_GOAL_PROGRESS";

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
  | "STRONG_BENEFIT"
  // Piloto V2 — solo válida dentro de un experimento REWARD_GOAL_PROGRESS.
  | "PROGRESS_REMINDER";

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
  // Fase F — AI Layer.
  aiCopyEnabled: boolean;
  aiInsightsEnabled: boolean;
  // Fase G — Safe Auto-Optimization.
  optimizationMode: OptimizationMode;
  minimumControlPercent: number;
  minimumExplorationPercent: number;
  maxAllocationChangePerOptimization: number;
  optimizationCooldownHours: number;
  minimumExposedPerVariantForOptimization: number | null;
  minimumMeaningfulUpliftPoints: number;
}

// ─── Fase G — Safe Auto-Optimization ────────────────────────────────────────

export type OptimizationMode = "OFF" | "ASSISTED" | "AUTOMATIC";

export type OptimizationRunStatus = "PREVIEWED" | "APPLIED" | "ROLLED_BACK" | "SKIPPED";

export type OptimizationTrigger =
  | "AUTOMATIC_WORKER"
  | "MANUAL_PREVIEW"
  | "MANUAL_APPLY"
  | "MANUAL_ROLLBACK";

export interface RetentionOptimizationRun {
  id: string;
  status: OptimizationRunStatus;
  triggeredBy: OptimizationTrigger;
  objectiveUsed: string | null;
  winnerVariantId: string | null;
  reasonCode: string;
  previousAllocations: Record<string, number>;
  proposedAllocations: Record<string, number>;
  appliedAllocations: Record<string, number> | null;
  dryRun: boolean;
  createdAt: string;
  appliedAt: string | null;
}

export const OPTIMIZATION_MODE_LABEL: Record<OptimizationMode, string> = {
  OFF: "Manual",
  ASSISTED: "Asistida",
  AUTOMATIC: "Automática",
};

export const OPTIMIZATION_REASON_LABEL: Record<string, string> = {
  OPTIMIZATION_INSUFFICIENT_DATA: "Todavía no hay suficientes datos.",
  OPTIMIZATION_COOLDOWN: "Se ajustó recientemente — esperando antes de volver a cambiar.",
  OPTIMIZATION_NO_CONCLUSION: "La diferencia entre variantes no es suficientemente clara.",
  OPTIMIZATION_BEST_RETURN: "Esta variante tiene mayor retorno confirmado.",
  OPTIMIZATION_BEST_ECONOMIC: "Esta variante presenta mejor valor económico estimado.",
  OPTIMIZATION_NEGATIVE_VARIANT: "Esta variante está rindiendo peor que el control.",
  OPTIMIZATION_BUDGET_CONSTRAINED: "El presupuesto del incentivo está cerca del límite.",
  OPTIMIZATION_APPLIED: "Se aplicó una nueva distribución.",
  OPTIMIZATION_PREVIEWED: "Vista previa generada.",
  OPTIMIZATION_ROLLED_BACK: "Se restauró la distribución anterior.",
  OPTIMIZATION_NOT_ELIGIBLE: "No se puede optimizar en este momento.",
  DRY_RUN_OPTIMIZATION_PROPOSED: "En modo de prueba — no se aplicó ningún cambio real.",
};

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
  /**
   * Piloto V2 — set when this catálogo row fue creado desde el puente de
   * Beneficios. Cuando está seteado, `automationEligible`/`rewardGoalEligible`
   * se editan únicamente desde /dashboard/beneficios — acá quedan de solo
   * lectura para no tener dos fuentes de verdad para el mismo flag.
   */
  benefitId: string | null;
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
  REWARD_GOAL_PROGRESS: "Recordar progreso de recompensa",
};

export const STRATEGY_LABEL: Record<RetentionStrategyType, string> = {
  CONTROL: "Control (sin mensaje)",
  REMINDER: "Recordatorio",
  SOFT_BENEFIT: "Beneficio suave",
  STRONG_BENEFIT: "Beneficio fuerte",
  PROGRESS_REMINDER: "Recordatorio de progreso",
};

/** Piloto V2 — qué estrategias son válidas para cada objective (mismo par que el backend). */
export const STRATEGIES_ALLOWED_FOR_OBJECTIVE: Record<
  RetentionObjective,
  RetentionStrategyType[]
> = {
  SECOND_VISIT: ["CONTROL", "REMINDER", "SOFT_BENEFIT", "STRONG_BENEFIT"],
  AT_RISK_RECOVERY: ["CONTROL", "REMINDER", "SOFT_BENEFIT", "STRONG_BENEFIT"],
  INACTIVE_RECOVERY: ["CONTROL", "REMINDER", "SOFT_BENEFIT", "STRONG_BENEFIT"],
  REWARD_GOAL_PROGRESS: ["CONTROL", "PROGRESS_REMINDER"],
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
