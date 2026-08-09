/**
 * Fase G §47 — extended simulation: several rounds of outcomes +
 * optimization back to back, against real Postgres. This is a stress /
 * sanity script, NOT a statistical validity test of the algorithm itself
 * (that is what the unit tests in `allocation-proposal.spec.ts` /
 * `optimization-objective.spec.ts` are for) — it exists to catch anything
 * that only shows up after several REAL applied rounds in sequence: drift,
 * an invariant that quietly breaks on round 3, a cooldown that doesn't
 * actually cool down, etc.
 *
 * Seed is fixed (a plain LCG, not Math.random()) so a failure is
 * reproducible from the printed seed alone.
 *
 * Usage (from apps/api, against the LOCAL database):
 *   npx ts-node -r tsconfig-paths/register scripts/retention-optimization-simulation-local.ts
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import {
  ExperienceVersion,
  OptimizationMode,
  RetentionAssignmentStatus,
  RetentionObjective,
  RetentionStrategyType,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RetentionOptimizationService } from '../src/modules/retention-v2/retention-optimization.service';
import { RetentionExperimentsAdminService } from '../src/modules/retention-v2/retention-experiments-admin.service';

const SUFFIX = Date.now();
const ROUNDS = 6;
const PER_VARIANT_PER_ROUND = 40;

/** Deterministic pseudo-random in [0,1) — reproducible without Math.random(). */
function makeLcg(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function assert(condition: boolean, label: string) {
  console.log(`  ${condition ? '✓' : '✗'} ${label}`);
  if (!condition) throw new Error(`FAILED: ${label}`);
}

async function seedRoundOutcomes(
  prisma: PrismaService,
  input: {
    businessId: string;
    experimentId: string;
    variantId: string;
    status: RetentionAssignmentStatus;
    exposedAt: Date;
    returnProbability: number;
    rng: () => number;
    label: string;
    round: number;
  },
) {
  let returned = 0;
  for (let i = 0; i < PER_VARIANT_PER_ROUND; i++) {
    const customer = await prisma.customer.create({
      data: {
        businessId: input.businessId,
        name: `${input.label} r${input.round} #${i}`,
        phoneE164: `+59893${SUFFIX.toString().slice(-5)}${input.round}${String(i).padStart(2, '0')}`,
        origin: 'qr',
      },
      select: { id: true },
    });
    const assignment = await prisma.retentionAssignment.create({
      data: {
        businessId: input.businessId,
        customerId: customer.id,
        experimentId: input.experimentId,
        variantId: input.variantId,
        status: input.status,
        segmentAtAssignment: 'AT_RISK',
        visitCountAtAssignment: 1,
        daysSinceLastVisit: 20,
        exposedAt: input.exposedAt,
        sentAt:
          input.status === RetentionAssignmentStatus.SENT
            ? input.exposedAt
            : null,
      },
      select: { id: true },
    });
    const didReturn = input.rng() < input.returnProbability;
    if (didReturn) returned += 1;
    await prisma.retentionOutcome.create({
      data: {
        businessId: input.businessId,
        assignmentId: assignment.id,
        experimentId: input.experimentId,
        variantId: input.variantId,
        customerId: customer.id,
        returned: didReturn,
        confirmedByRedemption:
          didReturn && input.status === RetentionAssignmentStatus.SENT,
        returnedAt: didReturn
          ? new Date(input.exposedAt.getTime() + 5 * 86_400_000)
          : null,
        daysToReturn: didReturn ? 5 : null,
        observedWithinWindow: true,
      },
    });
  }
  return returned;
}

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error('Refusing to run: DATABASE_URL is not a local database');
  }
  const SEED = 42;
  console.log(`Simulation seed: ${SEED}`);
  const rng = makeLcg(SEED);

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const prisma = app.get(PrismaService);
  const optimization = app.get(RetentionOptimizationService);
  const experimentsAdmin = app.get(RetentionExperimentsAdminService);

  let businessId = '';

  try {
    const business = await prisma.business.create({
      data: {
        name: 'Café Simulación',
        slug: `opt-sim-${SUFFIX}`,
        country: 'UY',
        timezone: 'America/Montevideo',
        currency: 'UYU',
        isActive: true,
        experienceVersion: ExperienceVersion.CHECKIN_V2,
        retentionEngineV2Enabled: true,
      },
      select: { id: true },
    });
    businessId = business.id;

    await prisma.retentionSettings.create({
      data: {
        businessId,
        averageTicketAmount: 1000,
        estimatedMarginPercent: 50,
        minimumSampleSizeForRecommendations: 10,
        optimizationMode: OptimizationMode.AUTOMATIC,
        minimumControlPercent: 10,
        minimumExplorationPercent: 15,
        maxAllocationChangePerOptimization: 15,
        optimizationCooldownHours: 24, // shorter, so 6 rounds of "next day" clear it each time
        minimumMeaningfulUpliftPoints: 5,
      },
    });

    const experiment = await prisma.retentionExperiment.create({
      data: {
        businessId,
        name: 'A vs B',
        objective: RetentionObjective.AT_RISK_RECOVERY,
      },
      select: { id: true },
    });
    const control = await prisma.retentionVariant.create({
      data: {
        businessId,
        experimentId: experiment.id,
        name: 'Control',
        strategyType: RetentionStrategyType.CONTROL,
        allocationPercent: 20,
      },
      select: { id: true },
    });
    const variantA = await prisma.retentionVariant.create({
      data: {
        businessId,
        experimentId: experiment.id,
        name: 'A (reminder)',
        strategyType: RetentionStrategyType.REMINDER,
        allocationPercent: 40,
      },
      select: { id: true },
    });
    const variantB = await prisma.retentionVariant.create({
      data: {
        businessId,
        experimentId: experiment.id,
        name: 'B (progress)',
        strategyType: RetentionStrategyType.PROGRESS_REMINDER,
        allocationPercent: 40,
      },
      select: { id: true },
    });
    await experimentsAdmin.start(businessId, experiment.id);

    console.log(
      `\n=== ${ROUNDS} rounds, ${PER_VARIANT_PER_ROUND} exposed/variant/round ===`,
    );
    console.log('round | control | A     | B     | applied? | reason');
    console.log('------|---------|-------|-------|----------|-------');

    let now = new Date();
    for (let round = 1; round <= ROUNDS; round++) {
      const exposedAt = new Date(now.getTime() - 10 * 86_400_000);
      await seedRoundOutcomes(prisma, {
        businessId,
        experimentId: experiment.id,
        variantId: control.id,
        status: RetentionAssignmentStatus.OBSERVING,
        exposedAt,
        returnProbability: 0.1,
        rng,
        label: 'control',
        round,
      });
      await seedRoundOutcomes(prisma, {
        businessId,
        experimentId: experiment.id,
        variantId: variantA.id,
        status: RetentionAssignmentStatus.SENT,
        exposedAt,
        returnProbability: 0.14,
        rng,
        label: 'A',
        round,
      });
      // B is the consistently-better variant across every round — the
      // allocation should trend toward it without ever violating a floor.
      await seedRoundOutcomes(prisma, {
        businessId,
        experimentId: experiment.id,
        variantId: variantB.id,
        status: RetentionAssignmentStatus.SENT,
        exposedAt,
        returnProbability: 0.24,
        rng,
        label: 'B',
        round,
      });

      const result = await optimization.runAutomatic(
        businessId,
        experiment.id,
        now,
      );
      const variants = await prisma.retentionVariant.findMany({
        where: { experimentId: experiment.id },
        select: { id: true, allocationPercent: true },
      });
      const byId = Object.fromEntries(
        variants.map((v) => [v.id, v.allocationPercent]),
      );
      console.log(
        `  ${round}   |   ${String(byId[control.id]).padStart(2)}%   |  ${String(byId[variantA.id]).padStart(2)}%  |  ${String(byId[variantB.id]).padStart(2)}%  | ${result.status === 'APPLIED' ? 'yes' : 'no '}      | ${result.reasonCode}`,
      );

      const sum = byId[control.id] + byId[variantA.id] + byId[variantB.id];
      assert(sum === 100, `round ${round}: allocation sums to exactly 100`);
      assert(
        byId[control.id] >= 10,
        `round ${round}: control never below floor`,
      );
      assert(
        byId[variantA.id] >= 15 - 0.001 || byId[variantB.id] >= 15,
        `round ${round}: exploration never collapses`,
      );

      // Advance past the cooldown so the NEXT round is genuinely eligible
      // to apply again — this is what actually exercises repeated real
      // application, not just repeated preview.
      now = new Date(now.getTime() + 25 * 3_600_000);
    }

    console.log('\n=== Final sanity ===');
    const finalVariants = await prisma.retentionVariant.findMany({
      where: { experimentId: experiment.id },
      select: { id: true, allocationPercent: true },
    });
    const finalById = Object.fromEntries(
      finalVariants.map((v) => [v.id, v.allocationPercent]),
    );
    assert(
      finalById[variantB.id] > 40,
      'after several rounds, the consistently-better B ends up favored over its starting share',
    );
    assert(
      finalById[control.id] >= 10,
      'control still intact after every round',
    );

    const history = await optimization.history(businessId, experiment.id);
    assert(
      history.length >= ROUNDS,
      `at least one audit row per round (${history.length} total)`,
    );

    console.log('\n=== ALL CHECKS PASSED ===');
  } finally {
    console.log('\n=== CLEANUP ===');
    if (businessId) {
      await prisma.retentionOutcome.deleteMany({ where: { businessId } });
      await prisma.retentionDecisionLog.deleteMany({ where: { businessId } });
      await prisma.retentionOptimizationRun.deleteMany({
        where: { businessId },
      });
      await prisma.retentionAssignment.deleteMany({ where: { businessId } });
      await prisma.retentionVariant.deleteMany({ where: { businessId } });
      await prisma.retentionExperiment.deleteMany({ where: { businessId } });
      await prisma.retentionSettings.deleteMany({ where: { businessId } });
      await prisma.customer.deleteMany({ where: { businessId } });
      await prisma.business.delete({ where: { id: businessId } });
      console.log('  removed every seeded row');
    }
    await app.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(
      `\nERROR: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
