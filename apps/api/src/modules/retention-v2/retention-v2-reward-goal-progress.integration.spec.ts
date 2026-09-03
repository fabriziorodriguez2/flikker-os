import { randomUUID } from 'crypto';
import {
  CustomerSegment,
  ExperienceVersion,
  RetentionObjective,
  RetentionStrategyType,
  RewardGoalStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RetentionV2EvaluateService } from './retention-v2-evaluate.service';
import { RetentionSettingsService } from './retention-settings.service';
import { RetentionExperimentService } from './retention-experiment.service';
import { RetentionAssignmentService } from './retention-assignment.service';
import { RetentionDecisionLogService } from './retention-decision-log.service';

/**
 * Pre-piloto fix — real-Postgres verification that REWARD_GOAL_PROGRESS
 * recruitment (§22) draws CONTROL and PROGRESS_REMINDER from exactly the
 * same population: customers with an ACTIVE, unexpired CustomerRewardGoal.
 * A mocked-Prisma unit test cannot prove the `where: { rewardGoals: { some:
 * {...} } } }` query filter actually excludes UNLOCKED/REDEEMED/EXPIRED/no-
 * goal customers against a real database — this does. Skips gracefully when
 * no database is reachable, same convention as
 * `retention-budget.integration.spec.ts`.
 */
describe('RetentionV2EvaluateService — REWARD_GOAL_PROGRESS recruitment (integration)', () => {
  let prisma: PrismaService;
  let service: RetentionV2EvaluateService;
  let available = false;
  let businessId = '';
  let experimentId = '';
  const customerIdByLabel: Record<string, string> = {};

  const NOW = new Date('2026-09-15T15:00:00.000Z');

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;
    prisma = new PrismaService();
    try {
      await prisma.$connect();

      const business = await prisma.business.create({
        data: {
          name: 'Reward Progress Co',
          slug: `reward-progress-${randomUUID()}`,
          country: 'UY',
          timezone: 'America/Montevideo',
          currency: 'UYU',
          experienceVersion: ExperienceVersion.CHECKIN_V2,
          retentionEngineV2Enabled: true,
        },
        select: { id: true },
      });
      businessId = business.id;

      await prisma.retentionSettings.create({
        data: {
          businessId,
          automaticCampaignsEnabled: true,
          // El pase de progreso tiene su propio interruptor desde que los dos
          // toggles del onboarding dejaron de ser el mismo campo.
          progressReminderEnabled: true,
          minimumDaysBetweenRetentionMessages: 14,
          maximumRetentionMessagesPer30Days: 2,
        },
      });

      const incentive = await prisma.retentionIncentiveDefinition.create({
        data: {
          businessId,
          name: 'Progress incentive',
          type: 'discount',
          percentageValue: 10,
          active: true,
          automationEligible: true,
          rewardGoalEligible: true,
        },
        select: { id: true },
      });

      const experiment = await prisma.retentionExperiment.create({
        data: {
          businessId,
          name: 'Progress reminder pilot',
          objective: RetentionObjective.REWARD_GOAL_PROGRESS,
          status: 'RUNNING',
        },
        select: { id: true },
      });
      experimentId = experiment.id;

      await prisma.retentionVariant.createMany({
        data: [
          {
            experimentId,
            businessId,
            name: 'Control',
            strategyType: RetentionStrategyType.CONTROL,
            allocationPercent: 30,
          },
          {
            experimentId,
            businessId,
            name: 'Progress reminder',
            strategyType: RetentionStrategyType.PROGRESS_REMINDER,
            allocationPercent: 70,
          },
        ],
      });

      // Five customers, one per CustomerRewardGoal state (plus one with no
      // goal at all) — only 'active' should ever be recruited.
      const labels = [
        'active',
        'unlocked',
        'redeemed',
        'expired',
        'no-goal',
      ] as const;
      for (const label of labels) {
        const customer = await prisma.customer.create({
          data: {
            businessId,
            name: `Customer ${label}`,
            phoneE164: `+5989901${labels.indexOf(label)}000`,
            origin: 'qr',
          },
          select: { id: true },
        });
        customerIdByLabel[label] = customer.id;

        if (label === 'no-goal') continue;

        const statusByLabel: Record<string, RewardGoalStatus> = {
          active: RewardGoalStatus.ACTIVE,
          unlocked: RewardGoalStatus.UNLOCKED,
          redeemed: RewardGoalStatus.REDEEMED,
          expired: RewardGoalStatus.ACTIVE, // status hasn't been swept yet — expiresAt is what must gate it
        };

        await prisma.customerRewardGoal.create({
          data: {
            businessId,
            customerId: customer.id,
            incentiveDefinitionId: incentive.id,
            status: statusByLabel[label],
            startingVisitCount: 0,
            targetAdditionalVisits: 2,
            activatedAt: new Date(NOW.getTime() - 5 * 86_400_000),
            expiresAt:
              label === 'expired'
                ? new Date(NOW.getTime() - 86_400_000) // yesterday
                : null,
            reasonCode: 'NEW_SECOND_VISIT',
            segmentAtCreation: CustomerSegment.NEW,
          },
        });
      }

      service = new RetentionV2EvaluateService(
        prisma,
        new RetentionSettingsService(prisma),
        new RetentionExperimentService(prisma),
        new RetentionAssignmentService(prisma),
        // Fase 3: este test es sobre recordatorios de progreso, no sobre
        // desafíos de vuelta.
        { ensureReturnChallenge: () => Promise.resolve(null) } as never,
        new RetentionDecisionLogService(prisma),
      );
      available = true;
    } catch {
      available = false;
    }
  });

  afterAll(async () => {
    if (!available) {
      await prisma?.$disconnect().catch(() => undefined);
      return;
    }
    await prisma.retentionAssignment.deleteMany({ where: { businessId } });
    await prisma.customerRewardGoal.deleteMany({ where: { businessId } });
    await prisma.retentionVariant.deleteMany({ where: { businessId } });
    await prisma.retentionExperiment.deleteMany({ where: { businessId } });
    await prisma.retentionIncentiveDefinition.deleteMany({
      where: { businessId },
    });
    await prisma.retentionSettings.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.deleteMany({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('recruits only the customer with an ACTIVE, unexpired CustomerRewardGoal — never UNLOCKED/REDEEMED/EXPIRED/no-goal', async () => {
    if (!available) {
      console.warn('DB unavailable — skipping reward-goal-progress test');
      return;
    }

    await service.runDaily(NOW);

    const assignments = await prisma.retentionAssignment.findMany({
      where: { experimentId },
      select: { customerId: true, variant: { select: { strategyType: true } } },
    });

    expect(assignments).toHaveLength(1);
    expect(assignments[0].customerId).toBe(customerIdByLabel.active);
  });

  it('recruits CONTROL and PROGRESS_REMINDER from the identical population — no separate filter for either arm', async () => {
    if (!available) {
      console.warn('DB unavailable — skipping reward-goal-progress test');
      return;
    }

    // Give every remaining candidate (unlocked/redeemed/expired/no-goal) a
    // fresh ACTIVE, unexpired goal, then re-run: whichever variant
    // `pickVariant` deterministically assigns each of the 5 customers to
    // (CONTROL or PROGRESS_REMINDER), ALL 5 must be recruited — the query
    // that resolves the population never looks at which variant a customer
    // will land in.
    //
    // 'unlocked'/'redeemed'/'expired' already have a row (from beforeAll) —
    // the partial unique index `customer_reward_goals_one_active_per_customer`
    // (business_id, customer_id) WHERE status='ACTIVE' means a customer can
    // never have two ACTIVE rows at once, so this reactivates the EXISTING
    // row rather than inserting a second one. 'no-goal' has none yet, so it
    // still needs a fresh `create`.
    const incentive =
      await prisma.retentionIncentiveDefinition.findFirstOrThrow({
        where: { businessId },
        select: { id: true },
      });
    for (const label of ['unlocked', 'redeemed', 'expired']) {
      await prisma.customerRewardGoal.updateMany({
        where: { businessId, customerId: customerIdByLabel[label] },
        data: { status: RewardGoalStatus.ACTIVE, expiresAt: null },
      });
    }
    await prisma.customerRewardGoal.create({
      data: {
        businessId,
        customerId: customerIdByLabel['no-goal'],
        incentiveDefinitionId: incentive.id,
        status: RewardGoalStatus.ACTIVE,
        startingVisitCount: 0,
        targetAdditionalVisits: 2,
        activatedAt: NOW,
        expiresAt: null,
        reasonCode: 'NEW_SECOND_VISIT',
        segmentAtCreation: CustomerSegment.NEW,
      },
    });

    await service.runDaily(NOW);

    const assignments = await prisma.retentionAssignment.findMany({
      where: { experimentId },
      select: { customerId: true },
    });
    // The 'active' customer was already recruited by the previous test;
    // assignment is idempotent (unique experimentId+customerId), so this
    // confirms the other 4 are now recruited too — 5 total, one per
    // customer, regardless of which variant each one landed in.
    expect(assignments.map((a) => a.customerId).sort()).toEqual(
      Object.values(customerIdByLabel).sort(),
    );
  });

  it('never double-assigns the same customer to the same experiment', async () => {
    if (!available) {
      console.warn('DB unavailable — skipping reward-goal-progress test');
      return;
    }

    await service.runDaily(NOW);
    await service.runDaily(NOW);

    const count = await prisma.retentionAssignment.count({
      where: { experimentId, customerId: customerIdByLabel.active },
    });
    expect(count).toBe(1);
  });
});
