import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  RetentionExperimentMetricsService,
  type ExperimentResults,
} from '../retention-v2/retention-experiment-metrics.service';
import {
  determineWinnerByReturnRate,
  determineWinnerByEconomics,
} from '../retention-v2/experiment-metrics';
import {
  computeGroundTruth,
  computeEconomicGroundTruth,
  type TreatableVariantCode,
} from './simulation-ground-truth';
import type { InvariantCheckResult } from './simulation-invariants.service';
import type { DayResult } from './simulation-engine.service';
import type { ScenarioDefinition, ExperimentVariantCode } from './scenarios';
import type { SeededCustomer } from './simulation-seeder';

export type WinnerAccuracy = 'CORRECT' | 'NO_CONCLUSION' | 'INCORRECT';
/**
 * Ajuste pre-piloto §1 — which objective Flikker's REAL winner detection
 * actually used this round. Mirrors `experimentResults.winner.kind` 1:1
 * (`BEST_RETURN_RATE`→RETURN, `BEST_INCREMENTAL_VALUE`→ECONOMIC), exposed
 * under its own name so a report never has to remember which raw `kind`
 * string means which.
 */
export type OptimizationObjectiveUsed = 'RETURN' | 'ECONOMIC' | null;

export interface SimulationResult {
  customersCreated: number;
  physicalReturns: number;
  visibleReturns: number;
  checkinVisibilityRate: number;
  reviewPrompts: number;
  reviewClicks: number;
  rewardGoalsCreated: number;
  rewardGoalsUnlocked: number;
  rewardGoalsRedeemed: number;
  retentionAssignments: number;
  controlAssignments: number;
  messagesSent: number;
  messagesDelivered: number;
  messagesRead: number;
  messagesFailed: number;
  optimizationRunsApplied: number;
  optimizationRunsSkipped: number;

  // Partial — a two-arm scenario (pre-piloto fix §13/§14) only ever has
  // CONTROL plus one challenger; the other codes are simply absent, never a
  // fake 0.
  initialAllocation: Partial<Record<ExperimentVariantCode, number>>;
  finalAllocation: Partial<Record<ExperimentVariantCode, number>>;

  /** Flikker's own real return-rate read per treatable variant, from `RetentionExperimentMetricsService`. */
  returnRateByVariant: Record<TreatableVariantCode, number | null>;
  /** Flikker's own real uplift-vs-CONTROL read (§22/§23) — what a human owner would see. */
  estimatedEffectByVariant: Record<TreatableVariantCode, number | null>;
  /** The simulator's own answer key (§8/§13) — never seen by Flikker. */
  trueEffectByVariant: Record<TreatableVariantCode, number>;
  /** @deprecated kept for backward compatibility — identical to `returnWinner`. Prefer `returnWinner`/`economicWinner` split below. */
  trueWinner: TreatableVariantCode | null;
  /** @deprecated kept for backward compatibility — Flikker's actual pick, whichever objective it used. Prefer `detectedReturnWinner`/`detectedEconomicWinner`. */
  detectedWinner: ExperimentResults['winner'];
  /** @deprecated kept for backward compatibility — compares `trueWinner` against whatever objective Flikker actually used. Misleading once Flikker optimizes on economics — prefer `returnWinnerAccuracy`/`economicWinnerAccuracy`. */
  winnerAccuracy: WinnerAccuracy;

  // ── Ajuste pre-piloto §1 — return vs. economic, kept strictly separate ────
  /** Ground truth: which treatable code truly has the best RETURN-RATE effect (never accounts for cost). Same value as `trueWinner`. */
  returnWinner: TreatableVariantCode | null;
  /** What Flikker's dashboard would say the winner is if it only ever looked at return rate — economics, even if known, are ignored. */
  detectedReturnWinner: TreatableVariantCode | null;
  returnWinnerAccuracy: WinnerAccuracy;
  /** Ground truth: which treatable code truly has the best NET ECONOMIC value per customer (return-rate effect × ticket × margin, minus expected redemption cost). Null when no present code's cost is known. */
  economicWinner: TreatableVariantCode | null;
  /** What Flikker's dashboard would say the winner is if it only ever looked at net economic value — NO_CONCLUSION if any comparable candidate's economics are unknown, never a guess. */
  detectedEconomicWinner: TreatableVariantCode | null;
  economicWinnerAccuracy: WinnerAccuracy;
  /** Which objective Flikker's real, single winner-detection actually used this round — RETURN, ECONOMIC, or null (NO_CONCLUSION). */
  optimizationObjectiveUsed: OptimizationObjectiveUsed;

  promotionalCost: number;
  estimatedIncrementalRevenue: number;
  /** A disclosed approximation — ground-truth effect × exposure × margin, never presented as exact (§22). */
  trueIncrementalRevenue: number;
  /** Null when there is no true incremental revenue to divide by (avoids a misleading 0% or Infinity). */
  estimationErrorPercent: number | null;

  aiCalls: number;

  invariantResults: InvariantCheckResult[];
  durationMs: number;
}

export interface SimulationResultsInput {
  businessId: string;
  experimentId: string;
  scenario: ScenarioDefinition;
  customers: ReadonlyArray<SeededCustomer>;
  dayHistory: ReadonlyArray<DayResult>;
  invariantResults: InvariantCheckResult[];
  durationMs: number;
}

const TREATABLE_CODES: TreatableVariantCode[] = [
  'REMINDER',
  'PROGRESS_REMINDER',
  'SOFT_BENEFIT',
];

/**
 * Simulation Center §21/§22/§23 — turns the engine's day-by-day history
 * (batch 5) plus a real read of `RetentionExperimentMetricsService` (the
 * exact same numbers a real owner would see on the dashboard) into the
 * structured result a run persists. Never invents a number Flikker
 * couldn't have produced itself for the "estimated" side — only the
 * `true*`/ground-truth fields come from the simulator's own answer key.
 */
@Injectable()
export class SimulationResultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: RetentionExperimentMetricsService,
  ) {}

  async compute(input: SimulationResultsInput): Promise<SimulationResult> {
    const aggregated = aggregateDayHistory(input.dayHistory);

    const experimentResults = await this.metrics.forExperiment(
      input.businessId,
      input.experimentId,
    );

    const finalAllocation = await this.readCurrentAllocation(
      input.businessId,
      input.experimentId,
    );

    const controlAssignments = await this.prisma.retentionAssignment.count({
      where: {
        businessId: input.businessId,
        experimentId: input.experimentId,
        variant: { strategyType: 'CONTROL' },
      },
    });

    const aiCalls = await this.prisma.aiUsageEvent.count({
      where: { businessId: input.businessId },
    });

    const returnRateByVariant = {} as Record<
      TreatableVariantCode,
      number | null
    >;
    const estimatedEffectByVariant = {} as Record<
      TreatableVariantCode,
      number | null
    >;
    let promotionalCost = 0;
    let estimatedIncrementalRevenue = 0;
    for (const code of TREATABLE_CODES) {
      const variant = experimentResults.variants.find(
        (v) => v.strategyType === code,
      );
      returnRateByVariant[code] = variant?.stats.returnRate ?? null;
      estimatedEffectByVariant[code] = variant?.upliftPercentagePoints ?? null;
      if (variant) {
        promotionalCost +=
          variant.economics.knownPromotionalCost +
          variant.economics.estimatedPromotionalCost;
        estimatedIncrementalRevenue +=
          variant.economics.incrementalRevenueEstimate ?? 0;
      }
    }

    // Pre-piloto fix (§13/§14/§15) — restrict the comparable-for-winner set
    // to codes actually seeded in this experiment (a two-arm scenario has
    // only one), so `winnerAccuracy` never faults Flikker for "failing" to
    // detect a variant that was never part of the experiment at all.
    const presentCodes = Object.keys(
      input.scenario.experimentAllocation,
    ).filter((code): code is TreatableVariantCode => code !== 'CONTROL');
    const groundTruth = computeGroundTruth(input.customers, presentCodes);
    const trueEffectByVariant = {} as Record<TreatableVariantCode, number>;
    for (const effect of groundTruth.effectsByVariant) {
      trueEffectByVariant[effect.variantCode] = effect.averageEffect;
    }

    const detectedWinnerCode = this.winnerCodeOf(
      experimentResults.winner,
      experimentResults.variants,
    );
    const winnerAccuracy = this.classifyWinnerAccuracy(
      groundTruth.trueWinner,
      detectedWinnerCode,
    );

    // Ajuste pre-piloto §1 — the return-only and economic-only reads,
    // computed independently of whichever single objective Flikker's real
    // detection actually used this round.
    const control = experimentResults.variants.find(
      (v) => v.strategyType === 'CONTROL',
    );
    const candidates = experimentResults.variants.filter(
      (v) => v.strategyType !== 'CONTROL',
    );
    const detectedReturnWinnerConclusion = determineWinnerByReturnRate(
      control?.stats,
      candidates,
    );
    const detectedEconomicWinnerConclusion = determineWinnerByEconomics(
      control?.stats,
      candidates.map((v) => ({
        stats: v.stats,
        netIncrementalValue: v.economics.estimatedNetIncrementalValue,
      })),
    );
    const detectedReturnWinnerCode = this.winnerCodeOf(
      detectedReturnWinnerConclusion,
      experimentResults.variants,
    );
    const detectedEconomicWinnerCode = this.winnerCodeOf(
      detectedEconomicWinnerConclusion,
      experimentResults.variants,
    );
    const returnWinnerAccuracy = this.classifyWinnerAccuracy(
      groundTruth.trueWinner,
      detectedReturnWinnerCode,
    );
    const optimizationObjectiveUsed: OptimizationObjectiveUsed =
      experimentResults.winner.kind === 'BEST_RETURN_RATE'
        ? 'RETURN'
        : experimentResults.winner.kind === 'BEST_INCREMENTAL_VALUE'
          ? 'ECONOMIC'
          : null;

    // Mirrors SimulationSeeder's own preference for PERCENT_OFF_10 — the
    // economic ground truth must price the SAME incentive the seeder
    // actually attached to SOFT_BENEFIT, or the two would silently drift.
    const incentivePercentageValue =
      input.scenario.incentives.find((i) => i.code === 'PERCENT_OFF_10')
        ?.percentageValue ??
      input.scenario.incentives[0]?.percentageValue ??
      null;
    const economicGroundTruth = computeEconomicGroundTruth(
      groundTruth.effectsByVariant,
      presentCodes,
      {
        averageTicketAmount: input.scenario.business.averageTicketAmount,
        estimatedMarginPercent: input.scenario.business.estimatedMarginPercent,
        rewardRedemptionRate:
          input.scenario.failureInjection.rewardRedemptionRate,
        incentivePercentageValue,
      },
    );
    const economicWinnerAccuracy = this.classifyWinnerAccuracy(
      economicGroundTruth.economicWinner,
      detectedEconomicWinnerCode,
    );

    const averageTicketAmount = input.scenario.business.averageTicketAmount;
    const marginFraction = input.scenario.business.estimatedMarginPercent / 100;
    const trueIncrementalRevenue = TREATABLE_CODES.reduce((sum, code) => {
      const variant = experimentResults.variants.find(
        (v) => v.strategyType === code,
      );
      const exposedCount = variant?.stats.exposedCount ?? 0;
      return (
        sum +
        trueEffectByVariant[code] *
          exposedCount *
          averageTicketAmount *
          marginFraction
      );
    }, 0);
    const estimationErrorPercent =
      trueIncrementalRevenue !== 0
        ? Math.abs(
            (estimatedIncrementalRevenue - trueIncrementalRevenue) /
              trueIncrementalRevenue,
          ) * 100
        : null;

    return {
      customersCreated: input.customers.length,
      physicalReturns: aggregated.physicalReturns,
      visibleReturns: aggregated.visibleReturns,
      checkinVisibilityRate:
        aggregated.physicalReturns > 0
          ? aggregated.visibleReturns / aggregated.physicalReturns
          : 0,
      reviewPrompts: aggregated.reviewPrompts,
      reviewClicks: aggregated.reviewClicks,
      rewardGoalsCreated: aggregated.rewardGoalsCreated,
      rewardGoalsUnlocked: aggregated.rewardGoalsUnlocked,
      rewardGoalsRedeemed: aggregated.rewardGoalsRedeemed,
      retentionAssignments: aggregated.assignmentsCreated,
      controlAssignments,
      messagesSent: aggregated.messagesSent,
      messagesDelivered: aggregated.messagesDelivered,
      messagesRead: aggregated.messagesRead,
      messagesFailed: aggregated.messagesFailed,
      optimizationRunsApplied: aggregated.optimizationRunsApplied,
      optimizationRunsSkipped: aggregated.optimizationRunsSkipped,
      initialAllocation: input.scenario.experimentAllocation,
      finalAllocation,
      returnRateByVariant,
      estimatedEffectByVariant,
      trueEffectByVariant,
      trueWinner: groundTruth.trueWinner,
      detectedWinner: experimentResults.winner,
      winnerAccuracy,
      returnWinner: groundTruth.trueWinner,
      detectedReturnWinner: detectedReturnWinnerCode,
      returnWinnerAccuracy,
      economicWinner: economicGroundTruth.economicWinner,
      detectedEconomicWinner: detectedEconomicWinnerCode,
      economicWinnerAccuracy,
      optimizationObjectiveUsed,
      promotionalCost,
      estimatedIncrementalRevenue,
      trueIncrementalRevenue,
      estimationErrorPercent,
      aiCalls,
      invariantResults: input.invariantResults,
      durationMs: input.durationMs,
    };
  }

  private async readCurrentAllocation(
    businessId: string,
    experimentId: string,
  ): Promise<Record<ExperimentVariantCode, number>> {
    const variants = await this.prisma.retentionVariant.findMany({
      where: { businessId, experimentId, active: true },
      select: { strategyType: true, allocationPercent: true },
    });
    const allocation = {
      CONTROL: 0,
      REMINDER: 0,
      PROGRESS_REMINDER: 0,
      SOFT_BENEFIT: 0,
    } as Record<ExperimentVariantCode, number>;
    for (const variant of variants) {
      if (variant.strategyType in allocation) {
        allocation[variant.strategyType as ExperimentVariantCode] =
          variant.allocationPercent;
      }
    }
    return allocation;
  }

  /**
   * Maps any `WinnerConclusion` (Flikker's real dashboard pick, or either of
   * the return-only/economic-only reads above) back onto our 3 treatable
   * codes. Generalized from a single `ExperimentResults` read so all three
   * "detected winner" questions share the exact same mapping logic.
   */
  private winnerCodeOf(
    winner: ExperimentResults['winner'],
    variants: ExperimentResults['variants'],
  ): TreatableVariantCode | null {
    if (winner.kind === 'NO_CONCLUSION') return null;
    const variant = variants.find((v) => v.variantId === winner.variantId);
    const code = variant?.strategyType;
    return code === 'REMINDER' ||
      code === 'PROGRESS_REMINDER' ||
      code === 'SOFT_BENEFIT'
      ? code
      : null;
  }

  /**
   * §23 — NO_CONCLUSION is never penalized the same as INCORRECT: with a
   * small sample, "we don't know yet" can be exactly the right, honest
   * answer, not a wrong one.
   */
  private classifyWinnerAccuracy(
    trueWinner: TreatableVariantCode | null,
    detectedWinner: TreatableVariantCode | null,
  ): WinnerAccuracy {
    if (detectedWinner === null) return 'NO_CONCLUSION';
    if (trueWinner === null) return 'NO_CONCLUSION';
    return detectedWinner === trueWinner ? 'CORRECT' : 'INCORRECT';
  }
}

function aggregateDayHistory(dayHistory: ReadonlyArray<DayResult>) {
  const initial = {
    physicalReturns: 0,
    visibleReturns: 0,
    reviewPrompts: 0,
    reviewClicks: 0,
    rewardGoalsCreated: 0,
    rewardGoalsUnlocked: 0,
    rewardGoalsRedeemed: 0,
    assignmentsCreated: 0,
    messagesSent: 0,
    messagesDelivered: 0,
    messagesRead: 0,
    messagesFailed: 0,
    optimizationRunsApplied: 0,
    optimizationRunsSkipped: 0,
  };
  for (const day of dayHistory) {
    initial.physicalReturns += day.physicalReturns;
    initial.visibleReturns += day.visibleReturns;
    initial.reviewPrompts += day.reviewPrompts;
    initial.reviewClicks += day.reviewClicks;
    initial.rewardGoalsCreated += day.rewardGoalsCreated;
    initial.rewardGoalsUnlocked += day.rewardGoalsUnlocked;
    initial.rewardGoalsRedeemed += day.rewardGoalsRedeemed;
    initial.assignmentsCreated += day.assignmentsCreated;
    initial.messagesSent += day.messagesSent;
    initial.messagesDelivered += day.messagesDelivered;
    initial.messagesRead += day.messagesRead;
    initial.messagesFailed += day.messagesFailed;
    initial.optimizationRunsApplied += day.optimizationRunsApplied;
    initial.optimizationRunsSkipped += day.optimizationRunsSkipped;
  }
  return initial;
}
