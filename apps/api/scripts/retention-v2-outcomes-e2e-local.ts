/**
 * Reproducible LOCAL end-to-end run of Fase D — the experimental loop closing
 * from assignment through to a scored outcome (Fase D §42).
 *
 * Scenario, exactly as specified:
 *   1. Business on Check-in V2, engine enabled.
 *   2. Experiment: CONTROL 50% / REMINDER 50%.
 *   3. 20 assignments, all exposed (10 CONTROL, 10 REMINDER).
 *   4. 2 of the 10 CONTROL customers return within the window.
 *   5. 6 of the 10 REMINDER customers return within the window.
 *   6. Outcome worker runs once, after the window has closed for everyone.
 *   7. Results are read back through the same service the API uses.
 *
 * Expected: CONTROL 20%, REMINDER 60%, uplift +40pp, +4 incremental returns,
 * and (with a $500 ticket configured) $2,000 incremental revenue.
 *
 * Usage (from apps/api, against the LOCAL database):
 *   npx ts-node -r tsconfig-paths/register scripts/retention-v2-outcomes-e2e-local.ts
 *
 * Refuses to run against anything that is not localhost. Cleans up everything
 * it created, even on failure.
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import {
  ExperienceVersion,
  RetentionAssignmentStatus,
  RetentionObjective,
  RetentionStrategyType,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { RetentionOutcomeService } from '../src/modules/retention-v2/retention-outcome.service';
import { RetentionExperimentMetricsService } from '../src/modules/retention-v2/retention-experiment-metrics.service';

const SLUG = `zz-retention-v2-outcomes-e2e-${Date.now()}`;
const WINDOW_DAYS = 7;
const EXPOSED_AT = new Date(Date.now() - 20 * 86_400_000); // 20 days ago
const RETURN_AT = new Date(EXPOSED_AT.getTime() + 3 * 86_400_000); // day 3, inside window
const NOW = new Date(EXPOSED_AT.getTime() + (WINDOW_DAYS + 1) * 86_400_000); // window closed for everyone

function assert(condition: boolean, label: string) {
  console.log(`  ${condition ? '✓' : '✗'} ${label}`);
  if (!condition) throw new Error(`FAILED: ${label}`);
}

/** IEEE754 float comparison — 0.6 - 0.2 is 0.39999999999999997, not 0.4. */
function closeTo(
  actual: number | null,
  expected: number,
  epsilon = 1e-6,
): boolean {
  return actual !== null && Math.abs(actual - expected) < epsilon;
}

async function main() {
  const url = process.env.DATABASE_URL ?? '';
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    throw new Error('Refusing to run: DATABASE_URL is not a local database');
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  });
  const prisma = app.get(PrismaService);
  const outcomes = app.get(RetentionOutcomeService);
  const metrics = app.get(RetentionExperimentMetricsService);

  let businessId = '';

  try {
    console.log('\n=== SEED ===');
    const business = await prisma.business.create({
      data: {
        name: 'E2E Outcomes',
        slug: SLUG,
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
    console.log(`  business ${SLUG}`);

    await prisma.retentionSettings.create({
      data: {
        businessId,
        averageTicketAmount: 500,
        // Low enough that this scenario's 10-per-arm sample clears it — the
        // owner's real minimum (default 30) is a product decision, not
        // something this script is testing.
        minimumSampleSizeForRecommendations: 5,
      },
    });

    const experiment = await prisma.retentionExperiment.create({
      data: {
        businessId,
        name: 'E2E outcomes experiment',
        objective: RetentionObjective.AT_RISK_RECOVERY,
        attributionWindowDays: WINDOW_DAYS,
      },
      select: { id: true },
    });
    const control = await prisma.retentionVariant.create({
      data: {
        businessId,
        experimentId: experiment.id,
        name: 'Control',
        strategyType: RetentionStrategyType.CONTROL,
        allocationPercent: 50,
      },
      select: { id: true },
    });
    const reminder = await prisma.retentionVariant.create({
      data: {
        businessId,
        experimentId: experiment.id,
        name: 'Reminder',
        strategyType: RetentionStrategyType.REMINDER,
        allocationPercent: 50,
      },
      select: { id: true },
    });
    console.log('  experiment: CONTROL 50% / REMINDER 50%');

    const controlAssignmentIds: string[] = [];
    const reminderAssignmentIds: string[] = [];
    const controlCustomerIds: string[] = [];
    const reminderCustomerIds: string[] = [];

    for (const [variant, ids, customerIds] of [
      [control, controlAssignmentIds, controlCustomerIds],
      [reminder, reminderAssignmentIds, reminderCustomerIds],
    ] as const) {
      for (let i = 0; i < 10; i++) {
        const customer = await prisma.customer.create({
          data: {
            businessId,
            name: `${variant.id === control.id ? 'Control' : 'Reminder'} customer ${i}`,
            phoneE164: `+5989${variant.id === control.id ? '9' : '8'}${String(i).padStart(6, '0')}`,
            origin: 'qr',
          },
          select: { id: true },
        });
        customerIds.push(customer.id);

        const assignment = await prisma.retentionAssignment.create({
          data: {
            businessId,
            experimentId: experiment.id,
            variantId: variant.id,
            customerId: customer.id,
            segmentAtAssignment: 'AT_RISK',
            visitCountAtAssignment: 5,
            daysSinceLastVisit: 20,
            assignedAt: EXPOSED_AT,
            exposedAt: EXPOSED_AT,
            status:
              variant.id === control.id
                ? RetentionAssignmentStatus.OBSERVING
                : RetentionAssignmentStatus.SENT,
          },
          select: { id: true },
        });
        ids.push(assignment.id);
      }
    }
    console.log(
      '  20 assignments exposed 20 days ago (10 CONTROL, 10 REMINDER)',
    );

    // 2 of 10 CONTROL customers return within the window.
    for (const customerId of controlCustomerIds.slice(0, 2)) {
      await prisma.visit.create({
        data: {
          businessId,
          customerId,
          occurredAt: RETURN_AT,
          visitDayKey: RETURN_AT.toISOString().slice(0, 10),
          verificationType: 'persistent_session',
        },
      });
    }
    // 6 of 10 REMINDER customers return within the window.
    for (const customerId of reminderCustomerIds.slice(0, 6)) {
      await prisma.visit.create({
        data: {
          businessId,
          customerId,
          occurredAt: RETURN_AT,
          visitDayKey: RETURN_AT.toISOString().slice(0, 10),
          verificationType: 'persistent_session',
        },
      });
    }
    console.log(
      '  simulated 2 CONTROL returns and 6 REMINDER returns, day 3 of 7',
    );

    console.log('\n=== OUTCOME WORKER ===');
    const result = await outcomes.runOnce(NOW);
    console.log(
      `  processed=${result.processed} returned=${result.returned} confirmed=${result.confirmed} closedNoReturn=${result.closedNoReturn} stillOpen=${result.stillOpen}`,
    );
    assert(result.processed === 20, 'processed all 20 exposed assignments');
    assert(
      result.returned === 8,
      '8 returns detected (2 CONTROL + 6 REMINDER)',
    );
    assert(result.closedNoReturn === 12, '12 windows closed with no return');
    assert(
      result.stillOpen === 0,
      'nothing left open — the window has fully closed',
    );

    console.log('\n=== RE-RUN (idempotency) ===');
    // The 12 `returned: false` outcomes are permanently closed and never
    // selected again. The 8 `returned: true, confirmedByRedemption: false`
    // ones ARE re-selected (that is what lets a later redemption still
    // upgrade them) — re-running must be a no-op for them, not a duplicate.
    const outcomesBefore = await prisma.retentionOutcome.findMany({
      where: { businessId },
      select: { id: true, updatedAt: true },
    });
    const secondRun = await outcomes.runOnce(NOW);
    const outcomesAfter = await prisma.retentionOutcome.findMany({
      where: { businessId },
      select: { id: true, updatedAt: true },
    });
    assert(
      secondRun.processed === 8,
      'only the 8 still-unconfirmed returns are re-checked, never the 12 closed ones',
    );
    assert(
      outcomesAfter.length === outcomesBefore.length,
      'no duplicate outcome rows were created',
    );

    console.log('\n=== RESULTS ===');
    const results = await metrics.forExperiment(businessId, experiment.id);
    const controlResult = results.variants.find(
      (v) => v.variantId === control.id,
    )!;
    const reminderResult = results.variants.find(
      (v) => v.variantId === reminder.id,
    )!;

    console.log(
      `  CONTROL:  exposed=${controlResult.stats.exposedCount} returned=${controlResult.stats.returnedCount} rate=${(controlResult.stats.returnRate * 100).toFixed(0)}%`,
    );
    console.log(
      `  REMINDER: exposed=${reminderResult.stats.exposedCount} returned=${reminderResult.stats.returnedCount} rate=${(reminderResult.stats.returnRate * 100).toFixed(0)}%`,
    );
    console.log(
      `  uplift=${((reminderResult.upliftPercentagePoints ?? 0) * 100).toFixed(0)}pp incrementalReturns=${reminderResult.estimatedIncrementalReturns} incrementalRevenue=${reminderResult.economics.incrementalRevenueEstimate}`,
    );

    assert(controlResult.stats.exposedCount === 10, 'CONTROL exposed = 10');
    assert(controlResult.stats.returnedCount === 2, 'CONTROL returned = 2');
    assert(
      closeTo(controlResult.stats.returnRate, 0.2),
      'CONTROL return rate = 20%',
    );
    assert(reminderResult.stats.exposedCount === 10, 'REMINDER exposed = 10');
    assert(reminderResult.stats.returnedCount === 6, 'REMINDER returned = 6');
    assert(
      closeTo(reminderResult.stats.returnRate, 0.6),
      'REMINDER return rate = 60%',
    );
    assert(
      closeTo(reminderResult.upliftPercentagePoints, 0.4),
      'uplift = +40 percentage points',
    );
    assert(
      closeTo(reminderResult.estimatedIncrementalReturns, 4),
      'estimated incremental returns = 4',
    );
    assert(
      closeTo(reminderResult.economics.incrementalRevenueEstimate, 2000),
      'incremental revenue estimate = $2,000 ($500 ticket × 4)',
    );

    console.log('\n=== ALL CHECKS PASSED ===');
  } finally {
    if (businessId) {
      console.log('\n=== CLEANUP ===');
      await prisma.retentionOutcome.deleteMany({ where: { businessId } });
      await prisma.visit.deleteMany({ where: { businessId } });
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
