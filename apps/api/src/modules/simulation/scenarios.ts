import {
  OptimizationMode,
  RetentionObjective,
  SimulationScenario,
} from '@prisma/client';
import { DEFAULT_PERSONA_MIX, type PersonaType } from './personas';

/** §7: the three fictitious incentives every scenario is built around. */
export type IncentiveKind = 'UPGRADE' | 'PERCENT_OFF' | 'FREE_ITEM';

export interface ScenarioIncentive {
  code: string;
  label: string;
  kind: IncentiveKind;
  percentageValue?: number;
}

export const DEFAULT_INCENTIVES: readonly ScenarioIncentive[] = [
  { code: 'UPGRADE', label: 'Upgrade de producto', kind: 'UPGRADE' },
  {
    code: 'PERCENT_OFF_10',
    label: '10% OFF',
    kind: 'PERCENT_OFF',
    percentageValue: 10,
  },
  {
    code: 'FREE_SMALL_ITEM',
    label: 'Producto chico gratis',
    kind: 'FREE_ITEM',
  },
];

/** §7: the four experiment variants every scenario allocates traffic across. */
export type ExperimentVariantCode =
  | 'CONTROL'
  | 'REMINDER'
  | 'PROGRESS_REMINDER'
  | 'SOFT_BENEFIT';

/**
 * Pre-piloto fix (§13/§14/§15) — CONTROL is always required (every
 * experiment needs one), but a scenario may now field only a subset of the
 * other three variants — a "two-arm" experiment (CONTROL + exactly one
 * challenger) concentrates sample instead of splitting it four ways.
 */
export type ExperimentAllocation = { CONTROL: number } & Partial<
  Record<Exclude<ExperimentVariantCode, 'CONTROL'>, number>
>;

/** §7: CONTROL 15% · REMINDER 30% · PROGRESS_REMINDER 30% · SOFT_BENEFIT 25%. */
export const DEFAULT_EXPERIMENT_ALLOCATION: ExperimentAllocation = {
  CONTROL: 15,
  REMINDER: 30,
  PROGRESS_REMINDER: 30,
  SOFT_BENEFIT: 25,
};

export interface ScenarioBudgetCaps {
  maxAutomatedIncentivesPerMonth: number | null;
  maxEstimatedIncentiveCostPerMonth: number | null;
}

export interface ScenarioBusinessConfig {
  retentionEngineV2Enabled: boolean;
  automaticCampaignsEnabled: boolean;
  rewardGoalsEnabled: boolean;
  optimizationMode: OptimizationMode;
  /** §7: 600 UYU by default. */
  averageTicketAmount: number;
  /** §7: 60% by default. */
  estimatedMarginPercent: number;
  budgetCaps: ScenarioBudgetCaps;
}

/** §19: the four seeded failure/behavior knobs every scenario configures. */
export interface ScenarioFailureInjection {
  /** [0,1] probability any given AI call fails (only relevant when `withAiDefault`). */
  aiFailureRate: number;
  /** [0,1] probability a WhatsApp send never leaves "sent" — passed to `FakeWhatsappTransport`. */
  messageFailureRate: number;
  /**
   * [0,1] probability a physical return also checks in (scans). This is the
   * §12 scenario-level knob — LOW 0.3 / MEDIUM 0.5 / BASE 0.7 / HIGH 0.9 —
   * applied on top of (not instead of) each persona's own
   * `baselineCheckinComplianceRate`; the engine (a later batch) decides the
   * exact combination rule.
   */
  checkinComplianceRate: number;
  /** [0,1] probability an unlocked reward actually gets redeemed. */
  rewardRedemptionRate: number;
}

export interface ScenarioDefinition {
  scenario: SimulationScenario;
  description: string;
  days: number;
  customerCount: number;
  seed: number;
  withAiDefault: boolean;
  /** §17: never more than this many real/fake AI calls in one run — default 20. */
  maxAiCallsDefault: number;
  business: ScenarioBusinessConfig;
  incentives: readonly ScenarioIncentive[];
  experimentAllocation: ExperimentAllocation;
  personaMix: Record<PersonaType, number>;
  failureInjection: ScenarioFailureInjection;
  /**
   * Pre-piloto fix (§1/§2) — which `RetentionObjective` the seeded
   * experiment is created with. Defaults to `AT_RISK_RECOVERY` (every
   * scenario before this fix implicitly used it) when omitted — only
   * `REWARD_PROGRESS` overrides this to `REWARD_GOAL_PROGRESS`, whose
   * population (customers with an ACTIVE reward goal) is recruited by a
   * separate path that does not go through segment→objective resolution at
   * all (see `RetentionV2EvaluateService.evaluateBusinessForRewardGoalProgress`).
   */
  objective?: RetentionObjective;
}

/**
 * BUG FOUND during the mandatory runs (§38), fixed here, disclosed in the
 * final report: `RetentionBudgetService`/`IncentiveIssuerService` are
 * DELIBERATELY deny-by-default when NEITHER monthly cap is configured
 * ("the owner authorized automation but set no budget" is treated as "no
 * incentive may be issued automatically", never as "unlimited" — see
 * `retention-budget.service.ts`'s own header comment). That is correct,
 * intentional Flikker behavior — but it meant every scenario below except
 * LOW_BUDGET left SOFT_BENEFIT permanently unable to issue anything or
 * send a single message, in every run, silently. A "healthy" baseline
 * needs a REAL, generous cap — not "no cap" — for that arm to be
 * exercised at all. Generous relative to §7's 500-customer/600-ticket
 * baseline; LOW_BUDGET still overrides with its own deliberately tight
 * caps, so the contrast between the two scenarios stays meaningful.
 */
const GENEROUS_BUDGET_CAPS: ScenarioBudgetCaps = {
  maxAutomatedIncentivesPerMonth: 300,
  maxEstimatedIncentiveCostPerMonth: 50_000,
};

/** §7: shared defaults every scenario starts from before its own overrides. */
const BASELINE_BUSINESS: ScenarioBusinessConfig = {
  retentionEngineV2Enabled: true,
  automaticCampaignsEnabled: true,
  rewardGoalsEnabled: true,
  optimizationMode: OptimizationMode.ASSISTED,
  averageTicketAmount: 600,
  estimatedMarginPercent: 60,
  budgetCaps: GENEROUS_BUDGET_CAPS,
};

const BASELINE_FAILURE_INJECTION: ScenarioFailureInjection = {
  aiFailureRate: 0,
  messageFailureRate: 0.03,
  checkinComplianceRate: 0.7, // §12 BASE
  rewardRedemptionRate: 0.6,
};

/**
 * §6/§7 — one entry per `SimulationScenario` enum value, no more, no less
 * (a test enforces this). Every scenario is a full, self-contained
 * configuration — never a fragment the caller has to guess how to merge.
 */
export const SCENARIO_DEFINITIONS: Record<
  SimulationScenario,
  ScenarioDefinition
> = {
  [SimulationScenario.BASELINE_HEALTHY]: {
    scenario: SimulationScenario.BASELINE_HEALTHY,
    description:
      'Negocio saludable, sin estrés adicional — el punto de referencia contra el que se leen todos los demás escenarios.',
    days: 60,
    customerCount: 500,
    seed: 42,
    withAiDefault: false,
    maxAiCallsDefault: 20,
    business: BASELINE_BUSINESS,
    incentives: DEFAULT_INCENTIVES,
    experimentAllocation: DEFAULT_EXPERIMENT_ALLOCATION,
    personaMix: DEFAULT_PERSONA_MIX,
    failureInjection: BASELINE_FAILURE_INJECTION,
  },

  [SimulationScenario.LOW_CHECKIN_COMPLIANCE]: {
    scenario: SimulationScenario.LOW_CHECKIN_COMPLIANCE,
    description:
      '§12 LOW — solo ~30% de las visitas físicas se registran como check-in. Mide visibilityRate y cuánto se degrada la estimación de Flikker.',
    days: 60,
    customerCount: 500,
    seed: 42,
    withAiDefault: false,
    maxAiCallsDefault: 20,
    business: BASELINE_BUSINESS,
    incentives: DEFAULT_INCENTIVES,
    experimentAllocation: DEFAULT_EXPERIMENT_ALLOCATION,
    personaMix: DEFAULT_PERSONA_MIX,
    failureInjection: {
      ...BASELINE_FAILURE_INJECTION,
      checkinComplianceRate: 0.3,
    },
  },

  [SimulationScenario.HIGH_CHECKIN_COMPLIANCE]: {
    scenario: SimulationScenario.HIGH_CHECKIN_COMPLIANCE,
    description:
      '§12 HIGH — ~90% de visibilidad. Punto de comparación contra LOW_CHECKIN_COMPLIANCE (§33).',
    days: 60,
    customerCount: 500,
    seed: 42,
    withAiDefault: false,
    maxAiCallsDefault: 20,
    business: BASELINE_BUSINESS,
    incentives: DEFAULT_INCENTIVES,
    experimentAllocation: DEFAULT_EXPERIMENT_ALLOCATION,
    personaMix: DEFAULT_PERSONA_MIX,
    failureInjection: {
      ...BASELINE_FAILURE_INJECTION,
      checkinComplianceRate: 0.9,
    },
  },

  [SimulationScenario.PROMO_SENSITIVE]: {
    scenario: SimulationScenario.PROMO_SENSITIVE,
    description:
      'Población sesgada hacia PROMOTION_SENSITIVE — el ground truth favorece fuerte a SOFT_BENEFIT; valida si Flikker lo detecta.',
    days: 60,
    customerCount: 500,
    seed: 42,
    withAiDefault: false,
    maxAiCallsDefault: 20,
    business: BASELINE_BUSINESS,
    incentives: DEFAULT_INCENTIVES,
    experimentAllocation: DEFAULT_EXPERIMENT_ALLOCATION,
    personaMix: {
      WEEKLY_REGULAR: 0.1,
      BIWEEKLY: 0.1,
      MONTHLY: 0.1,
      NEW: 0.05,
      HIGH_CHURN: 0.03,
      IRREGULAR: 0.05,
      PROMOTION_SENSITIVE: 0.5,
      PROMOTION_INSENSITIVE: 0.05,
      PROGRESS_SENSITIVE: 0.02,
    },
    failureInjection: BASELINE_FAILURE_INJECTION,
  },

  [SimulationScenario.PROGRESS_SENSITIVE]: {
    scenario: SimulationScenario.PROGRESS_SENSITIVE,
    description:
      'Población sesgada hacia PROGRESS_SENSITIVE — el ground truth favorece fuerte a PROGRESS_REMINDER.',
    days: 60,
    customerCount: 500,
    seed: 42,
    withAiDefault: false,
    maxAiCallsDefault: 20,
    business: BASELINE_BUSINESS,
    incentives: DEFAULT_INCENTIVES,
    experimentAllocation: DEFAULT_EXPERIMENT_ALLOCATION,
    personaMix: {
      WEEKLY_REGULAR: 0.1,
      BIWEEKLY: 0.1,
      MONTHLY: 0.1,
      NEW: 0.05,
      HIGH_CHURN: 0.03,
      IRREGULAR: 0.05,
      PROMOTION_SENSITIVE: 0.05,
      PROMOTION_INSENSITIVE: 0.02,
      PROGRESS_SENSITIVE: 0.5,
    },
    failureInjection: BASELINE_FAILURE_INJECTION,
  },

  [SimulationScenario.HIGH_CHURN]: {
    scenario: SimulationScenario.HIGH_CHURN,
    description:
      'Población sesgada hacia HIGH_CHURN/IRREGULAR/NEW — presiona la capacidad de Retention V2 de frenar caídas reales.',
    days: 60,
    customerCount: 500,
    seed: 42,
    withAiDefault: false,
    maxAiCallsDefault: 20,
    business: BASELINE_BUSINESS,
    incentives: DEFAULT_INCENTIVES,
    experimentAllocation: DEFAULT_EXPERIMENT_ALLOCATION,
    personaMix: {
      WEEKLY_REGULAR: 0.05,
      BIWEEKLY: 0.05,
      MONTHLY: 0.05,
      NEW: 0.15,
      HIGH_CHURN: 0.45,
      IRREGULAR: 0.15,
      PROMOTION_SENSITIVE: 0.03,
      PROMOTION_INSENSITIVE: 0.02,
      PROGRESS_SENSITIVE: 0.05,
    },
    failureInjection: BASELINE_FAILURE_INJECTION,
  },

  [SimulationScenario.LOW_BUDGET]: {
    scenario: SimulationScenario.LOW_BUDGET,
    description:
      'Topes mensuales de incentivo deliberadamente bajos — valida que el budget guard (Fase G) frene antes de exceder el presupuesto.',
    days: 60,
    customerCount: 500,
    seed: 42,
    withAiDefault: false,
    maxAiCallsDefault: 20,
    business: {
      ...BASELINE_BUSINESS,
      budgetCaps: {
        maxAutomatedIncentivesPerMonth: 20,
        maxEstimatedIncentiveCostPerMonth: 3_000,
      },
    },
    incentives: DEFAULT_INCENTIVES,
    experimentAllocation: DEFAULT_EXPERIMENT_ALLOCATION,
    personaMix: DEFAULT_PERSONA_MIX,
    failureInjection: BASELINE_FAILURE_INJECTION,
  },

  [SimulationScenario.AI_PROVIDER_FAILURE]: {
    scenario: SimulationScenario.AI_PROVIDER_FAILURE,
    description:
      '§19/§38 run E — IA prendida pero el fake provider falla el 100% de las veces. Debe caer siempre al fallback determinístico, sin pérdida de mensajes.',
    days: 30,
    customerCount: 100,
    seed: 42,
    withAiDefault: true,
    maxAiCallsDefault: 20,
    business: BASELINE_BUSINESS,
    incentives: DEFAULT_INCENTIVES,
    experimentAllocation: DEFAULT_EXPERIMENT_ALLOCATION,
    personaMix: DEFAULT_PERSONA_MIX,
    failureInjection: { ...BASELINE_FAILURE_INJECTION, aiFailureRate: 1 },
  },

  [SimulationScenario.MESSAGE_PROVIDER_FAILURE]: {
    scenario: SimulationScenario.MESSAGE_PROVIDER_FAILURE,
    description:
      'El transporte fake de WhatsApp falla el 100% de los envíos — valida que Flikker no rompa nada cuando ningún mensaje sale.',
    days: 60,
    customerCount: 500,
    seed: 42,
    withAiDefault: false,
    maxAiCallsDefault: 20,
    business: BASELINE_BUSINESS,
    incentives: DEFAULT_INCENTIVES,
    experimentAllocation: DEFAULT_EXPERIMENT_ALLOCATION,
    personaMix: DEFAULT_PERSONA_MIX,
    failureInjection: { ...BASELINE_FAILURE_INJECTION, messageFailureRate: 1 },
  },

  [SimulationScenario.OPTIMIZATION_STRESS]: {
    scenario: SimulationScenario.OPTIMIZATION_STRESS,
    description:
      'optimizationMode=AUTOMATIC con más población y días — estresa el worker de Safe Auto-Optimization (pisos, cooldown, Holm-Bonferroni) sin ayuda humana.',
    days: 90,
    customerCount: 1000,
    seed: 42,
    withAiDefault: false,
    maxAiCallsDefault: 20,
    business: {
      ...BASELINE_BUSINESS,
      optimizationMode: OptimizationMode.AUTOMATIC,
    },
    incentives: DEFAULT_INCENTIVES,
    experimentAllocation: DEFAULT_EXPERIMENT_ALLOCATION,
    personaMix: DEFAULT_PERSONA_MIX,
    failureInjection: BASELINE_FAILURE_INJECTION,
  },

  // ── Pre-piloto fix (§13-§17) — simpler two-arm experiments recommended for
  // a small business's first pilot, plus two ground-truth-engineered
  // scenarios for the clear-winner gate (Part B). ──────────────────────────

  [SimulationScenario.TWO_ARM_REMINDER]: {
    scenario: SimulationScenario.TWO_ARM_REMINDER,
    description:
      '§13 — piloto recomendado: CONTROL 30% / REMINDER 70%, un solo brazo, concentra muestra. Ground truth moderado (DEFAULT_PERSONA_MIX).',
    days: 60,
    customerCount: 500,
    seed: 42,
    withAiDefault: false,
    maxAiCallsDefault: 20,
    business: BASELINE_BUSINESS,
    incentives: DEFAULT_INCENTIVES,
    experimentAllocation: { CONTROL: 30, REMINDER: 70 },
    personaMix: DEFAULT_PERSONA_MIX,
    failureInjection: BASELINE_FAILURE_INJECTION,
  },

  [SimulationScenario.TWO_ARM_SOFT_BENEFIT]: {
    scenario: SimulationScenario.TWO_ARM_SOFT_BENEFIT,
    description:
      '§14 — piloto recomendado: CONTROL 30% / SOFT_BENEFIT 70%, un solo brazo. Incluye la economía real del incentivo (mismo catálogo/budget que BASELINE_HEALTHY).',
    days: 60,
    customerCount: 500,
    seed: 42,
    withAiDefault: false,
    maxAiCallsDefault: 20,
    business: BASELINE_BUSINESS,
    incentives: DEFAULT_INCENTIVES,
    experimentAllocation: { CONTROL: 30, SOFT_BENEFIT: 70 },
    personaMix: DEFAULT_PERSONA_MIX,
    failureInjection: BASELINE_FAILURE_INJECTION,
  },

  [SimulationScenario.REWARD_PROGRESS]: {
    scenario: SimulationScenario.REWARD_PROGRESS,
    description:
      '§15 — fix de diseño Parte A: objective REWARD_GOAL_PROGRESS. Población = solo customers con CustomerRewardGoal ACTIVE (recruitment por goal, no por segmento). CONTROL 30% / PROGRESS_REMINDER 70%. Mix con más peso en PROGRESS_SENSITIVE para generar suficientes metas activas.',
    days: 60,
    customerCount: 500,
    seed: 42,
    withAiDefault: false,
    maxAiCallsDefault: 20,
    business: BASELINE_BUSINESS,
    incentives: DEFAULT_INCENTIVES,
    experimentAllocation: { CONTROL: 30, PROGRESS_REMINDER: 70 },
    personaMix: {
      WEEKLY_REGULAR: 0.15,
      BIWEEKLY: 0.2,
      MONTHLY: 0.2,
      NEW: 0.15,
      HIGH_CHURN: 0.05,
      IRREGULAR: 0.05,
      PROMOTION_SENSITIVE: 0.03,
      PROMOTION_INSENSITIVE: 0.02,
      PROGRESS_SENSITIVE: 0.15,
    },
    failureInjection: BASELINE_FAILURE_INJECTION,
    objective: RetentionObjective.REWARD_GOAL_PROGRESS,
  },

  [SimulationScenario.NEAR_TIE]: {
    scenario: SimulationScenario.NEAR_TIE,
    description:
      '§16 — ground truth construido ANTES de correr nada (no ajustado después de ver resultados): REMINDER y SOFT_BENEFIT quedan a menos de ~1pp de efecto entre sí. Objetivo: medir clearWinnerRate/automaticAppliedRate — se espera que AUTOMATIC se abstenga la mayoría de las veces.',
    days: 90,
    customerCount: 1000,
    seed: 42,
    withAiDefault: false,
    maxAiCallsDefault: 20,
    business: {
      ...BASELINE_BUSINESS,
      optimizationMode: OptimizationMode.AUTOMATIC,
    },
    incentives: DEFAULT_INCENTIVES,
    experimentAllocation: DEFAULT_EXPERIMENT_ALLOCATION,
    // Ligero corrimiento desde DEFAULT_PERSONA_MIX (PROMOTION_SENSITIVE 0.05→0.02,
    // PROMOTION_INSENSITIVE 0.03→0.06) — acerca el softBenefitEffect ponderado
    // (~7.7%) al reminderEffect ponderado (~7.0%), gap ≈0.7pp. Aritmética
    // documentada en el informe final (§ Simulation results).
    personaMix: {
      WEEKLY_REGULAR: 0.15,
      BIWEEKLY: 0.2,
      MONTHLY: 0.2,
      NEW: 0.15,
      HIGH_CHURN: 0.1,
      IRREGULAR: 0.1,
      PROMOTION_SENSITIVE: 0.02,
      PROMOTION_INSENSITIVE: 0.06,
      PROGRESS_SENSITIVE: 0.02,
    },
    failureInjection: BASELINE_FAILURE_INJECTION,
  },

  [SimulationScenario.STRONG_SIGNAL]: {
    scenario: SimulationScenario.STRONG_SIGNAL,
    description:
      '§17 — ground truth con un ganador claramente superior: mismo mix fuertemente sesgado a PROMOTION_SENSITIVE que PROMO_SENSITIVE (softBenefitEffect ponderado ≈16% vs reminderEffect ≈5%, gap ≈11pp). Objetivo: correctWinnerRate alto y AUTOMATIC convergiendo con suficiente muestra.',
    days: 90,
    customerCount: 1000,
    seed: 42,
    withAiDefault: false,
    maxAiCallsDefault: 20,
    business: {
      ...BASELINE_BUSINESS,
      optimizationMode: OptimizationMode.AUTOMATIC,
    },
    incentives: DEFAULT_INCENTIVES,
    experimentAllocation: DEFAULT_EXPERIMENT_ALLOCATION,
    personaMix: {
      WEEKLY_REGULAR: 0.1,
      BIWEEKLY: 0.1,
      MONTHLY: 0.1,
      NEW: 0.05,
      HIGH_CHURN: 0.05,
      IRREGULAR: 0.05,
      PROMOTION_SENSITIVE: 0.5,
      PROMOTION_INSENSITIVE: 0.03,
      PROGRESS_SENSITIVE: 0.02,
    },
    failureInjection: BASELINE_FAILURE_INJECTION,
  },
};

export function getScenarioDefinition(
  scenario: SimulationScenario,
): ScenarioDefinition {
  return SCENARIO_DEFINITIONS[scenario];
}

/** §25 — the fields a platform admin may override when creating a run. */
export interface ScenarioOverrides {
  days?: number;
  customerCount?: number;
  seed?: number;
  withAi?: boolean;
  optimizationMode?: OptimizationMode;
  checkinComplianceRate?: number;
  aiFailureRate?: number;
  messageFailureRate?: number;
  rewardRedemptionRate?: number;
}

/**
 * §25/§3 — merges a platform admin's overrides onto a scenario's own
 * defaults, clamping `days`/`customerCount` to the deployment's configured
 * ceilings (`SIMULATION_MAX_DAYS`/`SIMULATION_MAX_CUSTOMERS`) — never
 * silently ignored, always the smaller of the two. The result is exactly
 * what gets persisted as `SimulationRun.configuration` (§1: "fully resolved
 * input... exactly what the engine ran with").
 */
export function resolveScenarioDefinition(
  scenario: SimulationScenario,
  overrides: ScenarioOverrides,
  limits: { maxDays: number; maxCustomers: number },
): ScenarioDefinition {
  const base = getScenarioDefinition(scenario);
  return {
    ...base,
    days: Math.min(overrides.days ?? base.days, limits.maxDays),
    customerCount: Math.min(
      overrides.customerCount ?? base.customerCount,
      limits.maxCustomers,
    ),
    seed: overrides.seed ?? base.seed,
    withAiDefault: overrides.withAi ?? base.withAiDefault,
    business: {
      ...base.business,
      optimizationMode:
        overrides.optimizationMode ?? base.business.optimizationMode,
    },
    failureInjection: {
      ...base.failureInjection,
      checkinComplianceRate:
        overrides.checkinComplianceRate ??
        base.failureInjection.checkinComplianceRate,
      aiFailureRate:
        overrides.aiFailureRate ?? base.failureInjection.aiFailureRate,
      messageFailureRate:
        overrides.messageFailureRate ??
        base.failureInjection.messageFailureRate,
      rewardRedemptionRate:
        overrides.rewardRedemptionRate ??
        base.failureInjection.rewardRedemptionRate,
    },
  };
}
