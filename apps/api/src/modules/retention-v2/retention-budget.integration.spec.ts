import { randomUUID } from 'crypto';
import {
  BenefitType,
  ExperienceVersion,
  RetentionObjective,
  RetentionStrategyType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RetentionBudgetService } from './retention-budget.service';
import { IncentiveIssuerService } from './incentive-issuer.service';

/**
 * Real-Postgres concurrency test for the monthly incentive budget. Verifies
 * that the advisory-lock transaction lets at most `cap` of several simultaneous
 * issuances succeed for the same business+month, even though every one of them
 * reads the running count independently. Skips gracefully when no database is
 * reachable (e.g. CI without Postgres) — the same convention
 * `visits.repository.integration.spec.ts` uses.
 */
describe('RetentionBudgetService concurrency (integration)', () => {
  let prisma: PrismaService;
  let issuer: IncentiveIssuerService;
  let available = false;
  let businessId = '';
  let experimentId = '';
  let variantId = '';
  const customerIds: string[] = [];
  const assignmentIds: string[] = [];

  const CAP = 3;
  const ATTEMPTS = 6;

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;
    prisma = new PrismaService();
    try {
      await prisma.$connect();

      const business = await prisma.business.create({
        data: {
          name: 'Budget Concurrency Co',
          slug: `budget-concurrency-${randomUUID()}`,
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
        data: { businessId, maxAutomatedIncentivesPerMonth: CAP },
      });

      const definition = await prisma.retentionIncentiveDefinition.create({
        data: {
          businessId,
          name: 'Budget test incentive',
          type: BenefitType.discount,
          percentageValue: 10,
          active: true,
          automationEligible: true,
        },
        select: { id: true },
      });

      const experiment = await prisma.retentionExperiment.create({
        data: {
          businessId,
          name: 'Budget concurrency experiment',
          objective: RetentionObjective.AT_RISK_RECOVERY,
        },
        select: { id: true },
      });
      experimentId = experiment.id;

      const variant = await prisma.retentionVariant.create({
        data: {
          experimentId,
          businessId,
          name: 'Soft benefit',
          strategyType: RetentionStrategyType.SOFT_BENEFIT,
          incentiveDefinitionId: definition.id,
          allocationPercent: 100,
        },
        select: { id: true },
      });
      variantId = variant.id;

      for (let i = 0; i < ATTEMPTS; i++) {
        const customer = await prisma.customer.create({
          data: {
            businessId,
            name: `Budget Tester ${i}`,
            phoneE164: `+5989900${String(i).padStart(4, '0')}`,
            origin: 'qr',
          },
          select: { id: true },
        });
        customerIds.push(customer.id);

        const assignment = await prisma.retentionAssignment.create({
          data: {
            experimentId,
            variantId,
            businessId,
            customerId: customer.id,
            segmentAtAssignment: 'AT_RISK',
            visitCountAtAssignment: 5,
            daysSinceLastVisit: 20,
          },
          select: { id: true },
        });
        assignmentIds.push(assignment.id);
      }

      issuer = new IncentiveIssuerService(prisma, new RetentionBudgetService());
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
    await prisma.retentionVariant.deleteMany({ where: { businessId } });
    await prisma.retentionExperiment.deleteMany({ where: { businessId } });
    await prisma.retentionIncentiveDefinition.deleteMany({
      where: { businessId },
    });
    await prisma.retentionSettings.deleteMany({ where: { businessId } });
    await prisma.benefitParticipation.deleteMany({ where: { businessId } });
    await prisma.benefit.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.deleteMany({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('never issues more than the configured monthly cap under concurrency', async () => {
    if (!available) {
      console.warn('DB unavailable — skipping budget concurrency test');
      return;
    }

    const results = await Promise.all(
      assignmentIds.map((id) => issuer.issueForAssignment(id, new Date())),
    );

    const issued = results.filter((r) => r.status === 'issued').length;
    const denied = results.filter(
      (r) => r.status === 'skipped' && r.reason === 'MONTHLY_INCENTIVE_LIMIT',
    ).length;
    const persisted = await prisma.benefitParticipation.count({
      where: { businessId },
    });

    expect(issued).toBe(CAP);
    expect(denied).toBe(ATTEMPTS - CAP);
    expect(persisted).toBe(CAP);
  });
});
