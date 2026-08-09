import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ExperienceVersion,
  OptimizationMode,
  OptimizationRunStatus,
  OptimizationTrigger,
  Prisma,
  RetentionExperimentStatus,
  RetentionStrategyType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { validateAllocation } from './allocation';
import { RetentionSettingsService } from './retention-settings.service';
import {
  RetentionExperimentMetricsService,
  type ExperimentResults,
} from './retention-experiment-metrics.service';
import { RetentionBudgetService } from './retention-budget.service';
import {
  DECISION_CODES,
  RetentionDecisionLogService,
  type DecisionCode,
} from './retention-decision-log.service';
import {
  checkOptimizationEligibility,
  type OptimizationEligibilityFacts,
  type OptimizationRejection,
} from './optimization-eligibility';
import { selectOptimizationObjective } from './optimization-objective';
import { proposeAllocation } from './allocation-proposal';

const INCENTIVE_STRATEGIES: RetentionStrategyType[] = [
  RetentionStrategyType.SOFT_BENEFIT,
  RetentionStrategyType.STRONG_BENEFIT,
];

const REJECTION_TO_DECISION_CODE: Record<OptimizationRejection, DecisionCode> =
  {
    BUSINESS_INACTIVE: DECISION_CODES.OPTIMIZATION_NOT_ELIGIBLE,
    NOT_CHECKIN_V2: DECISION_CODES.OPTIMIZATION_NOT_ELIGIBLE,
    ENGINE_DISABLED: DECISION_CODES.OPTIMIZATION_NOT_ELIGIBLE,
    AUTOMATION_DISABLED: DECISION_CODES.OPTIMIZATION_NOT_ELIGIBLE,
    OPTIMIZATION_OFF: DECISION_CODES.OPTIMIZATION_NOT_ELIGIBLE,
    EXPERIMENT_NOT_RUNNING: DECISION_CODES.OPTIMIZATION_NOT_ELIGIBLE,
    AUTOMATIC_MODE_REQUIRED: DECISION_CODES.OPTIMIZATION_NOT_ELIGIBLE,
    NO_CONTROL: DECISION_CODES.OPTIMIZATION_NOT_ELIGIBLE,
    INVALID_ALLOCATION: DECISION_CODES.OPTIMIZATION_NOT_ELIGIBLE,
    EXPERIMENT_ENDING_SOON: DECISION_CODES.OPTIMIZATION_NOT_ELIGIBLE,
    INSUFFICIENT_EXPOSURE_FOR_AUTOMATIC:
      DECISION_CODES.OPTIMIZATION_INSUFFICIENT_DATA,
    COOLDOWN_ACTIVE: DECISION_CODES.OPTIMIZATION_COOLDOWN,
    DRY_RUN: DECISION_CODES.DRY_RUN_OPTIMIZATION_PROPOSED,
    OPTIMIZATION_AMBIGUOUS_WINNER: DECISION_CODES.OPTIMIZATION_AMBIGUOUS_WINNER,
  };

export interface RunOptimizationOptions {
  triggeredBy: OptimizationTrigger;
  /** False for a pure preview — never writes, regardless of eligibility. */
  attemptApply: boolean;
  /** True only for the unattended worker (Fase G §29) — a manual apply is allowed in ASSISTED mode too. */
  requireAutomaticMode: boolean;
  now?: Date;
}

/**
 * Fase G §19 — the one place a RUNNING experiment's allocation is ever
 * computed or changed. Preview, manual apply, and the automatic worker all
 * call the SAME `run()` method (Fase G §28: "no implementar lógica
 * distinta") — the only difference between them is `attemptApply` and
 * `requireAutomaticMode`.
 *
 * Never touches an existing `RetentionAssignment` — only
 * `RetentionVariant.allocationPercent`, which only ever affects
 * `pickVariant`'s bucket boundaries for CUSTOMERS RECRUITED AFTER this
 * write (Fase G §1/§17/§18).
 */
@Injectable()
export class RetentionOptimizationService {
  private readonly logger = new Logger(RetentionOptimizationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: RetentionSettingsService,
    private readonly metrics: RetentionExperimentMetricsService,
    private readonly budget: RetentionBudgetService,
    private readonly decisions: RetentionDecisionLogService,
  ) {}

  /** Fase G §27 — computes and stores a proposal; never writes an allocation. */
  preview(businessId: string, experimentId: string, now: Date = new Date()) {
    return this.run(businessId, experimentId, {
      triggeredBy: OptimizationTrigger.MANUAL_PREVIEW,
      attemptApply: false,
      requireAutomaticMode: false,
      now,
    });
  }

  /** Fase G §28 — OWNER/ADMIN-triggered apply. Allowed in ASSISTED or AUTOMATIC mode. */
  apply(businessId: string, experimentId: string, now: Date = new Date()) {
    return this.run(businessId, experimentId, {
      triggeredBy: OptimizationTrigger.MANUAL_APPLY,
      attemptApply: true,
      requireAutomaticMode: false,
      now,
    });
  }

  /** Fase G §26/§29 — the unattended worker. Requires optimizationMode=AUTOMATIC specifically. */
  runAutomatic(
    businessId: string,
    experimentId: string,
    now: Date = new Date(),
  ) {
    return this.run(businessId, experimentId, {
      triggeredBy: OptimizationTrigger.AUTOMATIC_WORKER,
      attemptApply: true,
      requireAutomaticMode: true,
      now,
    });
  }

  /**
   * Fase G §26 — every RUNNING experiment the automatic worker is even
   * allowed to touch: active business, CHECKIN_V2, engine on,
   * optimizationMode=AUTOMATIC specifically. `run()`'s own eligibility
   * check re-verifies all of this (and more — cooldown, dry-run, ...)
   * immediately before acting, so a stale read here can never cause a bad
   * write; this query only decides what is worth attempting at all.
   */
  findAutomaticCandidates() {
    return this.prisma.retentionExperiment.findMany({
      where: {
        status: RetentionExperimentStatus.RUNNING,
        business: {
          isActive: true,
          experienceVersion: ExperienceVersion.CHECKIN_V2,
          retentionEngineV2Enabled: true,
          retentionSettings: { optimizationMode: OptimizationMode.AUTOMATIC },
        },
      },
      select: { id: true, businessId: true },
    });
  }

  /** Fase G §26 — one pass: attempts every AUTOMATIC-eligible experiment, one failure never blocking the rest. */
  async sweepAutomatic(now: Date = new Date()) {
    const candidates = await this.findAutomaticCandidates();
    let applied = 0;
    let skipped = 0;
    for (const experiment of candidates) {
      try {
        const result = await this.runAutomatic(
          experiment.businessId,
          experiment.id,
          now,
        );
        if (result.status === OptimizationRunStatus.APPLIED) applied += 1;
        else skipped += 1;
      } catch (error) {
        skipped += 1;
        this.logger.error(
          `Automatic optimization failed for experiment ${experiment.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    this.logger.log(
      `Optimization sweep experiments=${candidates.length} applied=${applied} skipped=${skipped}`,
    );
    return { experiments: candidates.length, applied, skipped };
  }

  /**
   * Fase G §38 — restores the allocation that was in effect just BEFORE the
   * most recent APPLIED run. Creates a NEW run rather than deleting
   * anything (§16: history is never rewritten), and never touches an
   * existing `RetentionAssignment`.
   */
  async rollback(
    businessId: string,
    experimentId: string,
    now: Date = new Date(),
  ) {
    const experiment = await this.prisma.retentionExperiment.findFirst({
      where: { id: experimentId, businessId },
      include: { variants: true },
    });
    if (!experiment) throw new NotFoundException('Experiment not found');

    const lastApplied = await this.prisma.retentionOptimizationRun.findFirst({
      where: {
        businessId,
        experimentId,
        status: OptimizationRunStatus.APPLIED,
      },
      orderBy: { appliedAt: 'desc' },
    });
    if (!lastApplied) {
      throw new NotFoundException('No applied optimization to roll back');
    }

    const currentAllocations = allocationsOf(experiment.variants);
    const restoredAllocations = lastApplied.previousAllocations as Record<
      string,
      number
    >;

    const results = await this.metrics.forExperiment(businessId, experimentId);

    const created = await this.prisma.$transaction(async (tx) => {
      await this.writeAllocations(tx, restoredAllocations);
      return tx.retentionOptimizationRun.create({
        data: {
          businessId,
          experimentId,
          status: OptimizationRunStatus.ROLLED_BACK,
          triggeredBy: OptimizationTrigger.MANUAL_ROLLBACK,
          objectiveUsed: null,
          winnerVariantId: null,
          reasonCode: DECISION_CODES.OPTIMIZATION_ROLLED_BACK,
          previousAllocations: currentAllocations,
          proposedAllocations: restoredAllocations,
          appliedAllocations: restoredAllocations,
          metricsSnapshot: snapshotMetrics(results),
          evidenceSnapshot: {},
          dryRun: false,
          appliedAt: now,
        },
      });
    });

    await this.decisions.record({
      businessId,
      decisionCode: DECISION_CODES.OPTIMIZATION_ROLLED_BACK,
      metadata: { experimentId, runId: created.id },
    });

    return created;
  }

  history(businessId: string, experimentId: string) {
    return this.prisma.retentionOptimizationRun.findMany({
      where: { businessId, experimentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async run(
    businessId: string,
    experimentId: string,
    options: RunOptimizationOptions,
  ) {
    const now = options.now ?? new Date();

    const experiment = await this.prisma.retentionExperiment.findFirst({
      where: { id: experimentId, businessId },
      include: {
        variants: { include: { incentiveDefinition: true } },
        business: true,
      },
    });
    if (!experiment) throw new NotFoundException('Experiment not found');

    const settings = await this.settings.getOrCreate(businessId);
    const results = await this.metrics.forExperiment(businessId, experimentId);

    const activeVariants = experiment.variants.filter((v) => v.active);
    const allocationCheck = validateAllocation(activeVariants);
    const hasControl = activeVariants.some(
      (v) => v.strategyType === RetentionStrategyType.CONTROL,
    );

    const lastApplied = await this.prisma.retentionOptimizationRun.findFirst({
      where: {
        businessId,
        experimentId,
        status: OptimizationRunStatus.APPLIED,
      },
      orderBy: { appliedAt: 'desc' },
    });

    // Computed BEFORE eligibility: the AUTOMATIC-only exposure gate below
    // (Fase G §37) needs to know the picked winner's own exposedCount, not
    // just whether ENOUGH_DATA holds in general.
    const control = results.variants.find(
      (v) => v.strategyType === RetentionStrategyType.CONTROL,
    );
    const candidates = results.variants.filter(
      (v) => v.strategyType !== RetentionStrategyType.CONTROL,
    );
    const objective = selectOptimizationObjective({
      control,
      candidates,
      previousWinnerVariantId: lastApplied?.winnerVariantId ?? null,
      minimumMeaningfulUpliftPoints: settings.minimumMeaningfulUpliftPoints,
    });
    const winnerResult =
      objective.variantId === null
        ? null
        : (results.variants.find((v) => v.variantId === objective.variantId) ??
          null);

    const facts: OptimizationEligibilityFacts = {
      business: {
        isActive: experiment.business.isActive,
        experienceVersion: experiment.business.experienceVersion,
        retentionEngineV2Enabled: experiment.business.retentionEngineV2Enabled,
      },
      settings: {
        automaticCampaignsEnabled: settings.automaticCampaignsEnabled,
        optimizationMode: settings.optimizationMode,
        optimizationCooldownHours: settings.optimizationCooldownHours,
      },
      experiment: { status: experiment.status, endAt: experiment.endAt },
      dryRunEnabled: settings.dryRunEnabled,
      hasControl,
      allocationSumsTo100: allocationCheck.valid,
      lastAppliedAt: lastApplied?.appliedAt ?? null,
      now,
      isWriteAttempt: options.attemptApply,
      requireAutomaticMode: options.requireAutomaticMode,
      // Fase G §37 — stricter than plain ENOUGH_DATA, and only enforced for
      // the unattended worker (requireAutomaticMode); a manual apply/preview
      // already has a human deciding to click, which is its own safety valve.
      requiredExposurePerVariantForAutomatic:
        settings.minimumExposedPerVariantForOptimization ??
        settings.minimumSampleSizeForRecommendations,
      controlExposedCount: control?.stats.exposedCount ?? 0,
      winnerExposedCount: winnerResult?.stats.exposedCount ?? null,
      clearWinner: objective.clearWinner,
    };
    const eligibility = checkOptimizationEligibility(facts);

    const blockedFromIncrease = await this.budgetConstrainedVariantIds(
      businessId,
      experiment.business.timezone,
      now,
      activeVariants,
      settings,
    );

    const currentAllocations = allocationsOf(activeVariants);
    const proposal =
      objective.variantId === null
        ? { allocations: currentAllocations, changed: false }
        : proposeAllocation({
            current: activeVariants.map((v) => ({
              variantId: v.id,
              strategyType: v.strategyType,
              allocationPercent: v.allocationPercent,
            })),
            winnerVariantId: objective.variantId,
            minimumControlPercent: settings.minimumControlPercent,
            minimumExplorationPercent: settings.minimumExplorationPercent,
            maxAllocationChangePerOptimization:
              settings.maxAllocationChangePerOptimization,
            blockedFromIncrease,
          });

    const budgetConstrained =
      objective.variantId !== null &&
      blockedFromIncrease.has(objective.variantId);

    let status: OptimizationRunStatus;
    let reasonCode: DecisionCode;
    let dryRun = false;

    // Eligibility is checked FIRST: whether this run is even ALLOWED to
    // write must never be masked by "there was nothing to change anyway" —
    // a dry-run/cooldown/mode-off business must always see ITS OWN reason,
    // not an unrelated "no conclusion" (Fase G §5/§21/§22/§33).
    if (!eligibility.eligible) {
      if (eligibility.reasonCode === 'DRY_RUN') {
        status = OptimizationRunStatus.PREVIEWED;
        reasonCode = DECISION_CODES.DRY_RUN_OPTIMIZATION_PROPOSED;
        dryRun = true;
      } else {
        status = OptimizationRunStatus.SKIPPED;
        reasonCode = REJECTION_TO_DECISION_CODE[eligibility.reasonCode];
      }
    } else if (objective.kind === 'NO_CONCLUSION' || !proposal.changed) {
      status = OptimizationRunStatus.SKIPPED;
      reasonCode = budgetConstrained
        ? DECISION_CODES.OPTIMIZATION_BUDGET_CONSTRAINED
        : objective.reasonCode;
    } else if (!options.attemptApply) {
      status = OptimizationRunStatus.PREVIEWED;
      reasonCode = budgetConstrained
        ? DECISION_CODES.OPTIMIZATION_BUDGET_CONSTRAINED
        : objective.reasonCode;
    } else {
      status = OptimizationRunStatus.APPLIED;
      reasonCode = budgetConstrained
        ? DECISION_CODES.OPTIMIZATION_BUDGET_CONSTRAINED
        : objective.reasonCode;
    }

    const runData = {
      businessId,
      experimentId,
      status,
      triggeredBy: options.triggeredBy,
      objectiveUsed: objective.kind === 'NO_CONCLUSION' ? null : objective.kind,
      winnerVariantId: objective.variantId,
      reasonCode,
      previousAllocations: currentAllocations,
      proposedAllocations: proposal.allocations,
      appliedAllocations:
        status === OptimizationRunStatus.APPLIED
          ? proposal.allocations
          : Prisma.JsonNull,
      metricsSnapshot: snapshotMetrics(results),
      evidenceSnapshot: {
        vsControl: objective.evidenceByVariant,
        // Pre-piloto fix (§7/§8) — surfaced so ASSISTED preview can explain
        // "no hay evidencia suficiente para ajustar automáticamente" even
        // when a tentative pick exists (§12).
        clearWinner: objective.clearWinner,
        runnerUpVariantId: objective.runnerUpVariantId,
      },
      dryRun,
    };

    const created =
      status === OptimizationRunStatus.APPLIED
        ? await this.prisma.$transaction(async (tx) => {
            await this.writeAllocations(tx, proposal.allocations);
            return tx.retentionOptimizationRun.create({
              data: { ...runData, appliedAt: now },
            });
          })
        : await this.prisma.retentionOptimizationRun.create({ data: runData });

    await this.decisions.record({
      businessId,
      decisionCode: reasonCode,
      metadata: {
        experimentId,
        runId: created.id,
        status,
        objectiveUsed: objective.kind,
        winnerVariantId: objective.variantId,
      },
    });

    this.logger.log(
      `Optimization ${options.triggeredBy} experiment=${experimentId} status=${status} reason=${reasonCode}`,
    );

    return created;
  }

  private async writeAllocations(
    tx: Prisma.TransactionClient,
    allocations: Record<string, number>,
  ) {
    for (const [variantId, allocationPercent] of Object.entries(allocations)) {
      await tx.retentionVariant.update({
        where: { id: variantId },
        data: { allocationPercent },
      });
    }
  }

  /**
   * Fase G §14 — which active, incentive-bearing variants must not receive
   * MORE share this round because their budget headroom is thin or their
   * incentive is inactive. REMINDER/CONTROL/PROGRESS_REMINDER never carry an
   * incentive, so they are never in this set.
   */
  private async budgetConstrainedVariantIds(
    businessId: string,
    timezone: string,
    now: Date,
    variants: {
      id: string;
      strategyType: RetentionStrategyType;
      incentiveDefinition: {
        active: boolean;
        estimatedCost: Prisma.Decimal | null;
        percentageValue: number | null;
        fixedValue: Prisma.Decimal | null;
      } | null;
    }[],
    settings: {
      maxAutomatedIncentivesPerMonth: number | null;
      maxEstimatedIncentiveCostPerMonth: Prisma.Decimal | null;
      averageTicketAmount: Prisma.Decimal | null;
    },
  ): Promise<Set<string>> {
    const blocked = new Set<string>();
    for (const variant of variants) {
      if (!INCENTIVE_STRATEGIES.includes(variant.strategyType)) continue;
      if (!variant.incentiveDefinition) continue;

      const headroom = await this.budget.headroom({
        businessId,
        timezone,
        now,
        caps: {
          maxAutomatedIncentivesPerMonth:
            settings.maxAutomatedIncentivesPerMonth,
          maxEstimatedIncentiveCostPerMonth:
            settings.maxEstimatedIncentiveCostPerMonth,
        },
        averageTicketAmount: settings.averageTicketAmount,
        incentiveActive: variant.incentiveDefinition.active,
      });
      if (headroom.nearLimit) blocked.add(variant.id);
    }
    return blocked;
  }
}

function allocationsOf(
  variants: { id: string; allocationPercent: number }[],
): Record<string, number> {
  return Object.fromEntries(variants.map((v) => [v.id, v.allocationPercent]));
}

/** Never chain-of-thought (Fase G §15) — just the numbers the decision was based on. */
function snapshotMetrics(results: ExperimentResults) {
  return {
    variants: results.variants.map((v) => ({
      variantId: v.variantId,
      strategyType: v.strategyType,
      evidenceState: v.stats.evidenceState,
      exposedCount: v.stats.exposedCount,
      returnRate: v.stats.returnRate,
      upliftPercentagePoints: v.upliftPercentagePoints,
      estimatedNetIncrementalValue: v.economics.estimatedNetIncrementalValue,
    })),
    winner: results.winner,
  };
}
