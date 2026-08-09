/**
 * Batch 9 / Pre-piloto fix batch — executes N independent simulations (same
 * scenario, different seeds) back to back through the exact same
 * `SimulationRunnerService.run()` path the real queue worker uses, then
 * computes the §19/§24 batch-aggregation metrics across them. This script is
 * report-generation tooling only — it is not a new product feature, adds no
 * new endpoint, and is not part of the tracked repo (scripts-scratch/ is
 * this session's scratch area). It never touches production data: every run
 * goes through the same isolated-simulation-database path as
 * run-mandatory-simulation.ts, and each simulated business is cleaned up
 * immediately after its OWN per-seed extra-metrics query, before the next
 * seed starts.
 *
 * Usage: npx ts-node scripts-scratch/run-batch-simulation.ts <LABEL> <SCENARIO> <DAYS> <CUSTOMERS> <NUM_SEEDS> [FIRST_SEED] [WITH_AI] [OPT_MODE]
 */
import 'dotenv/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { SimulationConfigService } from '../src/modules/simulation/simulation-config.service';
import { SimulationRunnerService } from '../src/modules/simulation/simulation-runner.service';
import { resolveScenarioDefinition } from '../src/modules/simulation/scenarios';
import {
  SimulationScenario,
  SimulationStatus,
  OptimizationMode,
} from '@prisma/client';

interface OneRunSummary {
  seed: number;
  simulationRunId: string;
  winnerAccuracy: string;
  // Ajuste pre-piloto §1 — return vs. economic kept strictly separate.
  returnWinner: string | null;
  detectedReturnWinner: string | null;
  returnWinnerAccuracy: string;
  economicWinner: string | null;
  detectedEconomicWinner: string | null;
  economicWinnerAccuracy: string;
  optimizationObjectiveUsed: string | null;
  overallStatus: string;
  pilotReadiness: string;
  checkinVisibilityRate: number;
  estimationErrorPercent: number | null;
  estimatedIncrementalRevenue: number;
  promotionalCost: number;
  anyCriticalInvariantFailed: boolean;
  // §19 additions (pre-piloto fix) — null when not applicable to this run
  // (e.g. clearWinner is null when AUTOMATIC never even attempted a pick).
  clearWinner: boolean | null;
  automaticApplied: boolean;
  exposedByStrategyType: Record<string, number>;
  // REWARD_PROGRESS-only; null for every other scenario.
  progress: {
    activeGoalEligible: number;
    progressAssignments: number;
    progressMessagesSent: number;
    progressSkippedNoGoal: number;
  } | null;
}

async function main() {
  const [
    label,
    scenarioArg,
    daysArg,
    customersArg,
    numSeedsArg,
    firstSeedArg,
    withAiArg,
    optModeArg,
  ] = process.argv.slice(2);
  if (!label || !scenarioArg || !numSeedsArg) {
    console.error(
      'Usage: run-batch-simulation.ts <LABEL> <SCENARIO> <DAYS> <CUSTOMERS> <NUM_SEEDS> [FIRST_SEED] [WITH_AI] [OPT_MODE]',
    );
    process.exit(1);
  }

  const simulationDatabaseUrl = process.env.SIMULATION_DATABASE_URL;
  if (!simulationDatabaseUrl) {
    console.error('SIMULATION_DATABASE_URL is not set.');
    process.exit(1);
  }

  const prisma = new PrismaService();
  await prisma.onModuleInit();

  const config = {
    available: true,
    enabled: true,
    databaseUrl: simulationDatabaseUrl,
    unavailableReason: null,
    maxConcurrentRuns: 1,
    maxCustomers: 1000,
    maxDays: 90,
  } as unknown as SimulationConfigService;

  const runner = new SimulationRunnerService(prisma, config);

  const scenario = scenarioArg as SimulationScenario;
  const days = daysArg ? Number(daysArg) : undefined;
  const customerCount = customersArg ? Number(customersArg) : undefined;
  const numSeeds = Number(numSeedsArg);
  const firstSeed = firstSeedArg ? Number(firstSeedArg) : 1;
  const withAi = withAiArg === 'true';
  const optimizationMode = optModeArg
    ? (optModeArg as OptimizationMode)
    : undefined;

  const runs: OneRunSummary[] = [];

  for (let i = 0; i < numSeeds; i++) {
    const seed = firstSeed + i;
    const def = resolveScenarioDefinition(
      scenario,
      { days, customerCount, seed, withAi, optimizationMode },
      { maxDays: 90, maxCustomers: 1000 },
    );

    console.log(
      `\n=== RUN ${label} seed ${seed} (${i + 1}/${numSeeds}) — ${scenario} — days=${def.days} customers=${def.customerCount} ===`,
    );

    const user = await prisma.user.create({
      data: {
        email: `batch-run-${label}-${seed}-${Date.now()}@flikker-simulation.local`,
        passwordHash: 'not-a-real-hash',
        firstName: 'Simulation',
        lastName: 'BatchRunnerScript',
        isPlatformAdmin: true,
      },
      select: { id: true },
    });

    const created = await prisma.simulationRun.create({
      data: {
        scenario: def.scenario,
        status: SimulationStatus.PENDING,
        seed: def.seed,
        days: def.days,
        customerCount: def.customerCount,
        withAi: def.withAiDefault,
        configuration: def as never,
        createdByUserId: user.id,
      },
      select: { id: true },
    });

    const startedAt = Date.now();
    await runner.run(created.id);
    const elapsedMs = Date.now() - startedAt;

    const finished = await prisma.simulationRun.findUniqueOrThrow({
      where: { id: created.id },
    });
    console.log(
      `status=${finished.status} progress=${finished.progress} elapsedMs=${elapsedMs}`,
    );

    const results = finished.results as unknown as {
      winnerAccuracy: string;
      returnWinner: string | null;
      detectedReturnWinner: string | null;
      returnWinnerAccuracy: string;
      economicWinner: string | null;
      detectedEconomicWinner: string | null;
      economicWinnerAccuracy: string;
      optimizationObjectiveUsed: string | null;
      checkinVisibilityRate: number;
      estimationErrorPercent: number | null;
      estimatedIncrementalRevenue: number;
      promotionalCost: number;
      optimizationRunsApplied: number;
      invariantResults: { status: string; critical: boolean }[];
    } | null;
    const summary = finished.summary as unknown as {
      overallStatus: string;
      pilotReadiness: string;
    } | null;

    if (!results || !summary) {
      console.error(
        `Run seed=${seed} did not produce results/summary — status=${finished.status} failureReason=${finished.failureReason}`,
      );
    } else {
      const extra = await collectExtraMetrics(
        simulationDatabaseUrl,
        created.id,
        scenario,
      );
      runs.push({
        seed,
        simulationRunId: created.id,
        winnerAccuracy: results.winnerAccuracy,
        returnWinner: results.returnWinner,
        detectedReturnWinner: results.detectedReturnWinner,
        returnWinnerAccuracy: results.returnWinnerAccuracy,
        economicWinner: results.economicWinner,
        detectedEconomicWinner: results.detectedEconomicWinner,
        economicWinnerAccuracy: results.economicWinnerAccuracy,
        optimizationObjectiveUsed: results.optimizationObjectiveUsed,
        overallStatus: summary.overallStatus,
        pilotReadiness: summary.pilotReadiness,
        checkinVisibilityRate: results.checkinVisibilityRate,
        estimationErrorPercent: results.estimationErrorPercent,
        estimatedIncrementalRevenue: results.estimatedIncrementalRevenue,
        promotionalCost: results.promotionalCost,
        anyCriticalInvariantFailed: results.invariantResults.some(
          (inv) => inv.critical && inv.status === 'FAIL',
        ),
        clearWinner: extra.clearWinner,
        automaticApplied: results.optimizationRunsApplied > 0,
        exposedByStrategyType: extra.exposedByStrategyType,
        progress: extra.progress,
      });
    }

    await cleanupIsolatedBusiness(simulationDatabaseUrl, created.id);
  }

  console.log('\n\n=== PER-SEED RESULTS ===');
  console.log(JSON.stringify(runs, null, 2));

  const n = runs.length;
  const correctWinnerRate =
    runs.filter((r) => r.winnerAccuracy === 'CORRECT').length / n;
  const noConclusionRate =
    runs.filter((r) => r.winnerAccuracy === 'NO_CONCLUSION').length / n;
  const incorrectWinnerRate =
    runs.filter((r) => r.winnerAccuracy === 'INCORRECT').length / n;
  // Ajuste pre-piloto §1 — never a single winnerAccuracy once
  // optimizationObjectiveUsed can be ECONOMIC: report both lenses on their
  // own terms.
  const returnWinnerCorrectRate =
    runs.filter((r) => r.returnWinnerAccuracy === 'CORRECT').length / n;
  const returnWinnerIncorrectRate =
    runs.filter((r) => r.returnWinnerAccuracy === 'INCORRECT').length / n;
  const economicWinnerCorrectRate =
    runs.filter((r) => r.economicWinnerAccuracy === 'CORRECT').length / n;
  const economicWinnerIncorrectRate =
    runs.filter((r) => r.economicWinnerAccuracy === 'INCORRECT').length / n;
  const economicWinnerNoConclusionRate =
    runs.filter((r) => r.economicWinnerAccuracy === 'NO_CONCLUSION').length /
    n;
  const objectiveUsedCounts = runs.reduce(
    (acc, r) => {
      const key = r.optimizationObjectiveUsed ?? 'NONE';
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const safetyFailureRate =
    runs.filter((r) => r.anyCriticalInvariantFailed).length / n;
  const meanVisibility =
    runs.reduce((sum, r) => sum + r.checkinVisibilityRate, 0) / n;
  const errorSamples = runs
    .map((r) => r.estimationErrorPercent)
    .filter((v): v is number => v !== null);
  const meanEstimationError =
    errorSamples.length > 0
      ? errorSamples.reduce((sum, v) => sum + v, 0) / errorSamples.length
      : null;
  const meanNetValue =
    runs.reduce(
      (sum, r) => sum + (r.estimatedIncrementalRevenue - r.promotionalCost),
      0,
    ) / n;

  // §19 additions — clearWinnerRate only counts runs where a pick was
  // actually attempted (clearWinner !== null); automaticAppliedRate is over
  // every run (an ASSISTED scenario legitimately never applies at all).
  const clearWinnerSamples = runs
    .map((r) => r.clearWinner)
    .filter((v): v is boolean => v !== null);
  const clearWinnerRate =
    clearWinnerSamples.length > 0
      ? clearWinnerSamples.filter(Boolean).length / clearWinnerSamples.length
      : null;
  const automaticAppliedRate =
    runs.filter((r) => r.automaticApplied).length / n;

  const meanExposedControl =
    runs.reduce((sum, r) => sum + (r.exposedByStrategyType.CONTROL ?? 0), 0) /
    n;
  const challengerStrategyTypes = Array.from(
    new Set(
      runs.flatMap((r) =>
        Object.keys(r.exposedByStrategyType).filter((k) => k !== 'CONTROL'),
      ),
    ),
  );
  const meanExposedChallenger =
    runs.reduce(
      (sum, r) =>
        sum +
        challengerStrategyTypes.reduce(
          (s, k) => s + (r.exposedByStrategyType[k] ?? 0),
          0,
        ),
      0,
    ) / n;

  const progressRuns = runs
    .map((r) => r.progress)
    .filter((v): v is NonNullable<OneRunSummary['progress']> => v !== null);
  const progressAggregate =
    progressRuns.length > 0
      ? {
          meanActiveGoalEligible:
            progressRuns.reduce((s, p) => s + p.activeGoalEligible, 0) /
            progressRuns.length,
          meanProgressAssignments:
            progressRuns.reduce((s, p) => s + p.progressAssignments, 0) /
            progressRuns.length,
          meanProgressMessagesSent:
            progressRuns.reduce((s, p) => s + p.progressMessagesSent, 0) /
            progressRuns.length,
          totalProgressSkippedNoGoal: progressRuns.reduce(
            (s, p) => s + p.progressSkippedNoGoal,
            0,
          ),
        }
      : null;

  console.log('\n=== BATCH AGGREGATE (§19/§24) ===');
  console.log(
    JSON.stringify(
      {
        n,
        correctWinnerRate,
        noConclusionRate,
        incorrectWinnerRate,
        returnWinnerCorrectRate,
        returnWinnerIncorrectRate,
        economicWinnerCorrectRate,
        economicWinnerIncorrectRate,
        economicWinnerNoConclusionRate,
        optimizationObjectiveUsedCounts: objectiveUsedCounts,
        clearWinnerRate,
        automaticAppliedRate,
        meanExposedControl,
        meanExposedChallenger,
        meanVisibility,
        meanEstimationError,
        estimationErrorSampleCount: errorSamples.length,
        safetyFailureRate,
        meanNetValue,
        progress: progressAggregate,
      },
      null,
      2,
    ),
  );

  await prisma.onModuleDestroy();
}

/**
 * §19 — extra metrics the standard `SimulationResult` DTO doesn't carry,
 * queried directly against the isolated database BEFORE cleanup deletes the
 * simulated business. Read-only; never modifies anything a real invariant
 * check or result field already covers.
 */
async function collectExtraMetrics(
  simulationDatabaseUrl: string,
  simulationRunId: string,
  scenario: SimulationScenario,
): Promise<{
  clearWinner: boolean | null;
  exposedByStrategyType: Record<string, number>;
  progress: OneRunSummary['progress'];
}> {
  const { PrismaClient } = require('@prisma/client');

  const { PrismaPg } = require('@prisma/adapter-pg');
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: simulationDatabaseUrl }),
  });
  try {
    const business = await client.business.findUnique({
      where: { slug: `sim-${simulationRunId}` },
      select: { id: true },
    });
    if (!business) {
      return { clearWinner: null, exposedByStrategyType: {}, progress: null };
    }
    const businessId = business.id;
    const experiment = await client.retentionExperiment.findFirst({
      where: { businessId },
      select: { id: true },
    });
    const experimentId = experiment?.id;

    // clearWinner — from the LAST optimization run's evidenceSnapshot, only
    // meaningful for AUTOMATIC-mode scenarios; null when none ever ran
    // (e.g. every ASSISTED scenario, correctly, never auto-attempts one).
    let clearWinner: boolean | null = null;
    if (experimentId) {
      const lastRun = await client.retentionOptimizationRun.findFirst({
        where: { businessId, experimentId },
        orderBy: { createdAt: 'desc' },
        select: { evidenceSnapshot: true },
      });
      const snapshot = lastRun?.evidenceSnapshot as
        | { clearWinner?: boolean }
        | undefined;
      clearWinner =
        typeof snapshot?.clearWinner === 'boolean'
          ? snapshot.clearWinner
          : null;
    }

    // Exposed count per strategy type — "exposed" mirrors
    // `EXPOSED_STATUSES` (Fase D): CONTROL counts as exposed by simply being
    // assigned (it receives nothing to wait on); every other variant counts
    // once actually sent. Approximated here via `sentAt IS NOT NULL OR
    // strategyType = CONTROL`, matching that same rule without importing the
    // module's internal constant into a scratch script.
    const exposedByStrategyType: Record<string, number> = {};
    if (experimentId) {
      const assignments = await client.retentionAssignment.findMany({
        where: { experimentId },
        select: { sentAt: true, variant: { select: { strategyType: true } } },
      });
      for (const a of assignments as {
        sentAt: Date | null;
        variant: { strategyType: string };
      }[]) {
        const exposed =
          a.variant.strategyType === 'CONTROL' || a.sentAt !== null;
        if (!exposed) continue;
        exposedByStrategyType[a.variant.strategyType] =
          (exposedByStrategyType[a.variant.strategyType] ?? 0) + 1;
      }
    }

    let progress: OneRunSummary['progress'] = null;
    if (scenario === SimulationScenario.REWARD_PROGRESS && experimentId) {
      const [
        activeGoalEligible,
        progressAssignments,
        progressMessagesSent,
        progressSkippedNoGoal,
      ] = await Promise.all([
        client.customerRewardGoal.count({
          where: { businessId, status: 'ACTIVE' },
        }),
        client.retentionAssignment.count({
          where: {
            experimentId,
            variant: { strategyType: 'PROGRESS_REMINDER' },
          },
        }),
        client.retentionAssignment.count({
          where: {
            experimentId,
            variant: { strategyType: 'PROGRESS_REMINDER' },
            sentAt: { not: null },
          },
        }),
        client.retentionDecisionLog.count({
          where: { businessId, decisionCode: 'SKIPPED_NO_ACTIVE_REWARD_GOAL' },
        }),
      ]);
      progress = {
        activeGoalEligible,
        progressAssignments,
        progressMessagesSent,
        progressSkippedNoGoal,
      };
    }

    return { clearWinner, exposedByStrategyType, progress };
  } finally {
    await client.$disconnect();
  }
}

async function cleanupIsolatedBusiness(
  simulationDatabaseUrl: string,
  simulationRunId: string,
) {
  const { PrismaClient } = require('@prisma/client');

  const { PrismaPg } = require('@prisma/adapter-pg');
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: simulationDatabaseUrl }),
  });
  try {
    const business = await client.business.findUnique({
      where: { slug: `sim-${simulationRunId}` },
      select: { id: true },
    });
    if (!business) return;
    const businessId = business.id;
    await client.message.deleteMany({ where: { businessId } });
    await client.benefitParticipation.deleteMany({ where: { businessId } });
    await client.customerRewardGoal.deleteMany({ where: { businessId } });
    await client.retentionDecisionLog.deleteMany({ where: { businessId } });
    await client.retentionOptimizationRun.deleteMany({ where: { businessId } });
    await client.visit.deleteMany({ where: { businessId } });
    await client.retentionAssignment.deleteMany({ where: { businessId } });
    await client.retentionVariant.deleteMany({ where: { businessId } });
    await client.retentionExperiment.deleteMany({ where: { businessId } });
    await client.retentionIncentiveDefinition.deleteMany({
      where: { businessId },
    });
    await client.retentionSettings.deleteMany({ where: { businessId } });
    await client.customer.deleteMany({ where: { businessId } });
    await client.business.delete({ where: { id: businessId } });
    console.log(
      `Cleaned isolated business ${businessId} from the simulation database.`,
    );
  } finally {
    await client.$disconnect();
  }
}

main().catch((e) => {
  console.error('SCRIPT_FAILED', e);
  process.exit(1);
});
