import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BenefitIssuanceSource,
  BenefitType,
  ExperienceVersion,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { DashboardModule } from './dashboard.module';
import { DashboardOverviewService } from './dashboard-overview.service';
import {
  createTestBusiness,
  makeTestSuffix,
} from '../reviews/reviews.test-helpers';

/**
 * Contra DB real (sin mocks) — el service dispara ~25 queries Prisma
 * directas; esto es lo que de verdad prueba que cada nombre de campo y
 * relación existe, más allá de lo que tsc puede chequear en un `select`
 * literal.
 */
describe('DashboardOverviewService (integration)', () => {
  let prisma: PrismaService;
  let service: DashboardOverviewService;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [DashboardModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    service = moduleRef.get(DashboardOverviewService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function cleanup(businessId: string) {
    await prisma.customerRewardGoal.deleteMany({ where: { businessId } });
    await prisma.benefitParticipation.deleteMany({ where: { businessId } });
    await prisma.retentionIncentiveDefinition.deleteMany({
      where: { businessId },
    });
    await prisma.retentionSettings.deleteMany({ where: { businessId } });
    await prisma.visit.deleteMany({ where: { businessId } });
    await prisma.visitSource.deleteMany({ where: { businessId } });
    await prisma.benefit.deleteMany({ where: { businessId } });
    await prisma.googleReview.deleteMany({ where: { businessId } });
    await prisma.scanEvent
      .deleteMany({ where: { businessId } })
      .catch(() => undefined);
    await prisma.message
      .deleteMany({ where: { businessId } })
      .catch(() => undefined);
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
  }

  it('empty CHECKIN_V2 business — no data anywhere, nothing throws, honest empty shapes', async () => {
    const suffix = makeTestSuffix();
    const business = await createTestBusiness(prisma, `dash-empty-${suffix}`);
    await prisma.business.update({
      where: { id: business.id },
      data: { experienceVersion: ExperienceVersion.CHECKIN_V2 },
    });

    try {
      const result = await service.getOverview(business.id, { period: '30' });

      expect(result.experienceVersion).toBe('CHECKIN_V2');
      expect(result.objective.goal).toBeNull();
      expect(result.rating.current).toBeNull();
      expect(result.rating.totalReviews).toBe(0);
      expect(result.activeCustomers).toEqual({
        available: true,
        current: 0,
        previous: 0,
        change: { absolute: 0, percent: null },
        trend: expect.any(Array),
      });
      expect(result.qrActivity.label).toBe('Check-ins');
      expect(result.qrActivity.current).toBe(0);
      expect(result.performance.kpis).toHaveLength(4);
      expect(result.recentActivity).toEqual([]);
      expect(result.retentionSignal).toBeNull(); // retentionEngineV2Enabled=false
      expect(result.rewardGoalsSignal).toBeNull(); // rewardGoalsEnabled=false (default)
      // Sin nada configurado, "Creá tu primer beneficio" es la prioridad más alta real.
      expect(result.nextSteps.some((s) => s.id === 'no-benefits')).toBe(true);
    } finally {
      await cleanup(business.id);
    }
  });

  it('LEGACY business — Card C queda "no disponible", Card D usa Escaneos QR (ScanEvent)', async () => {
    const suffix = makeTestSuffix();
    const business = await createTestBusiness(prisma, `dash-legacy-${suffix}`);
    // LEGACY es el default de createTestBusiness — no hace falta setearlo.

    try {
      const result = await service.getOverview(business.id, { period: '30' });

      expect(result.experienceVersion).toBe('LEGACY');
      expect(result.activeCustomers).toBeNull();
      expect(result.qrActivity.label).toBe('Escaneos QR');
      expect(result.performance.kpis.map((k) => k.key)).toEqual([
        'scans',
        'reviews',
        'newCustomers',
        'messages',
      ]);
    } finally {
      await cleanup(business.id);
    }
  });

  it('CHECKIN_V2 con datos reales — reseñas, visitas, beneficio canjeado, Reward Goals', async () => {
    const suffix = makeTestSuffix();
    const business = await createTestBusiness(prisma, `dash-full-${suffix}`);
    await prisma.business.update({
      where: { id: business.id },
      data: { experienceVersion: ExperienceVersion.CHECKIN_V2 },
    });

    const customer = await prisma.customer.create({
      data: {
        id: randomUUID(),
        businessId: business.id,
        name: `Cliente ${suffix}`,
        phoneE164: `+59890${suffix.slice(0, 6)}`,
      },
    });

    const now = new Date();
    await prisma.googleReview.create({
      data: {
        businessId: business.id,
        googleReviewId: `gr-${suffix}`,
        reviewerName: 'Ana',
        stars: 5,
        postedAt: now,
      },
    });
    await prisma.visitSource.create({
      data: {
        businessId: business.id,
        name: 'Mostrador',
        token: `tok-${suffix}`,
      },
    });
    await prisma.visit.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        occurredAt: now,
        visitDayKey: now.toISOString().slice(0, 10),
        verificationType: 'manual',
      },
    });

    const benefit = await prisma.benefit.create({
      data: {
        businessId: business.id,
        type: BenefitType.gift,
        title: 'Capuccino gratis',
        active: false,
      },
    });
    await prisma.benefitParticipation.create({
      data: {
        businessId: business.id,
        benefitId: benefit.id,
        customerId: customer.id,
        source: BenefitIssuanceSource.LEGACY,
        redeemedAt: now,
      },
    });

    await prisma.retentionSettings.create({
      data: { businessId: business.id, rewardGoalsEnabled: true },
    });
    const incentive = await prisma.retentionIncentiveDefinition.create({
      data: {
        businessId: business.id,
        name: 'Upgrade',
        type: BenefitType.promotion,
        rewardGoalEligible: true,
      },
    });
    await prisma.customerRewardGoal.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        incentiveDefinitionId: incentive.id,
        status: 'UNLOCKED',
        startingVisitCount: 1,
        targetAdditionalVisits: 1,
        unlockedAt: now,
        reasonCode: 'TEST',
        segmentAtCreation: 'NEW',
      },
    });

    try {
      const result = await service.getOverview(business.id, { period: '30' });

      expect(result.rating.current).toBe(5);
      expect(result.rating.totalReviews).toBe(1);
      expect(result.rating.newInPeriod).toBe(1);
      expect(result.activeCustomers).toMatchObject({
        available: true,
        current: 1,
      });
      expect(result.qrActivity).toMatchObject({
        label: 'Check-ins',
        current: 1,
      });
      expect(result.rewardGoalsSignal).toMatchObject({
        inProgress: 0,
        unlockedInPeriod: 1,
        redeemedInPeriod: 0,
      });
      // Actividad reciente real: reseña, check-in, beneficio canjeado, reward goal.
      const types = result.recentActivity.map((a) => a.type);
      expect(types).toEqual(
        expect.arrayContaining([
          'review',
          'visit',
          'benefit_redeemed',
          'reward_goal_unlocked',
          'visit_source_created',
        ]),
      );
    } finally {
      await cleanup(business.id);
    }
  });
});
