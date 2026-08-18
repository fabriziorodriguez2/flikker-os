import { randomUUID } from 'crypto';
import {
  BenefitType,
  BusinessStatus,
  CustomerSegment,
  ExperienceVersion,
  RetentionExperimentStatus,
  RetentionObjective,
  RetentionStrategyType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { IncentiveIssuerService } from './incentive-issuer.service';
import { RetentionBudgetService } from './retention-budget.service';
import { PlansService } from '../plans/plans.service';
import { PlansRepository } from '../plans/plans.repository';

/**
 * §17 — audits whether the existing budget check already has real atomicity
 * under concurrency, against real Postgres (a mocked Prisma cannot prove a
 * race is actually serialized). Conclusion, confirmed by the tests below:
 * yes — `IncentiveIssuerService.issueForAssignment` already takes a
 * `pg_advisory_xact_lock` on `(businessId, localMonth)` inside the same
 * transaction that checks and writes the `BenefitParticipation`, so this
 * file adds coverage rather than a fix.
 */
describe('Incentive budget — cap math and concurrency (integration)', () => {
  let prisma: PrismaService;
  let issuer: IncentiveIssuerService;
  const businesses: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    // Real PlansService, real DB: ninguno de estos negocios de test tiene
    // Subscription, así que `isBenefitsBlocked` es siempre `false` — cero
    // comportamiento nuevo para este archivo.
    issuer = new IncentiveIssuerService(
      prisma,
      new RetentionBudgetService(prisma),
      new PlansService(new PlansRepository(prisma)),
    );
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    for (const id of businesses.splice(0)) {
      await prisma.benefitParticipation.deleteMany({
        where: { businessId: id },
      });
      await prisma.retentionAssignment.deleteMany({
        where: { businessId: id },
      });
      await prisma.retentionVariant.deleteMany({ where: { businessId: id } });
      await prisma.retentionExperiment.deleteMany({
        where: { businessId: id },
      });
      await prisma.retentionIncentiveDefinition.deleteMany({
        where: { businessId: id },
      });
      await prisma.customer.deleteMany({ where: { businessId: id } });
      await prisma.benefit.deleteMany({ where: { businessId: id } });
      await prisma.retentionSettings.deleteMany({ where: { businessId: id } });
      await prisma.business.delete({ where: { id } }).catch(() => undefined);
    }
  });

  /** One business with N assignments, all pointing at one SOFT_BENEFIT variant. */
  async function makeFixture(quantityLimit: number, assignmentCount: number) {
    const business = await prisma.business.create({
      data: {
        id: randomUUID(),
        name: 'Café Budget',
        slug: `budget-${randomUUID().slice(0, 8)}`,
        status: BusinessStatus.ACTIVE,
        country: 'UY',
        currency: 'UYU',
        timezone: 'America/Montevideo',
        experienceVersion: ExperienceVersion.CHECKIN_V2,
        retentionEngineV2Enabled: true,
      },
    });
    businesses.push(business.id);

    await prisma.retentionSettings.create({
      data: {
        businessId: business.id,
        maxAutomatedIncentivesPerMonth: quantityLimit,
      },
    });

    const benefit = await prisma.benefit.create({
      data: {
        businessId: business.id,
        title: 'Café gratis',
        type: BenefitType.gift,
        active: false,
      },
    });
    const incentive = await prisma.retentionIncentiveDefinition.create({
      data: {
        businessId: business.id,
        benefitId: benefit.id,
        name: 'Café gratis',
        type: BenefitType.gift,
        active: true,
        automationEligible: true,
      },
    });

    const experiment = await prisma.retentionExperiment.create({
      data: {
        businessId: business.id,
        name: 'Test',
        objective: RetentionObjective.AT_RISK_RECOVERY,
        status: RetentionExperimentStatus.RUNNING,
      },
    });
    await prisma.retentionVariant.create({
      data: {
        experimentId: experiment.id,
        businessId: business.id,
        name: 'Control',
        strategyType: RetentionStrategyType.CONTROL,
        allocationPercent: 15,
      },
    });
    const benefitVariant = await prisma.retentionVariant.create({
      data: {
        experimentId: experiment.id,
        businessId: business.id,
        name: 'Beneficio',
        strategyType: RetentionStrategyType.SOFT_BENEFIT,
        incentiveDefinitionId: incentive.id,
        allocationPercent: 85,
      },
    });

    const assignments: { id: string }[] = [];
    for (let i = 0; i < assignmentCount; i++) {
      const customer = await prisma.customer.create({
        data: {
          businessId: business.id,
          name: `Cliente ${i}`,
          phoneE164: `+5989${String(Date.now() + i).slice(-7)}`,
        },
      });
      const assignment = await prisma.retentionAssignment.create({
        data: {
          experimentId: experiment.id,
          variantId: benefitVariant.id,
          businessId: business.id,
          customerId: customer.id,
          segmentAtAssignment: CustomerSegment.AT_RISK,
          visitCountAtAssignment: 1,
          daysSinceLastVisit: 20,
        },
      });
      assignments.push(assignment);
    }

    return { businessId: business.id, assignments };
  }

  it('cap alcanzado: el tercer assignment no emite, los dos primeros sí', async () => {
    const { businessId, assignments } = await makeFixture(2, 3);

    const first = await issuer.issueForAssignment(assignments[0].id);
    const second = await issuer.issueForAssignment(assignments[1].id);
    const third = await issuer.issueForAssignment(assignments[2].id);

    expect(first.status).toBe('issued');
    expect(second.status).toBe('issued');
    expect(third).toEqual({
      status: 'skipped',
      reason: 'MONTHLY_INCENTIVE_LIMIT',
    });

    const issued = await prisma.benefitParticipation.count({
      where: { businessId },
    });
    expect(issued).toBe(2); // nunca 3 — el cap se respetó
  });

  it('concurrencia: dos workers compitiendo por la última unidad — solo uno gana', async () => {
    const { businessId, assignments } = await makeFixture(1, 2);

    const [a, b] = await Promise.all([
      issuer.issueForAssignment(assignments[0].id),
      issuer.issueForAssignment(assignments[1].id),
    ]);

    const outcomes = [a.status, b.status].sort();
    expect(outcomes).toEqual(['issued', 'skipped']);

    // Nunca 11 de 10 — ni, en este caso más chico, nunca 2 de 1.
    const issued = await prisma.benefitParticipation.count({
      where: { businessId },
    });
    expect(issued).toBe(1);
  });

  it('concurrencia con 5 corredores y cap=3: exactamente 3 ganan, nunca más', async () => {
    const { businessId, assignments } = await makeFixture(3, 5);

    const results = await Promise.all(
      assignments.map((a) => issuer.issueForAssignment(a.id)),
    );

    const issuedCount = results.filter((r) => r.status === 'issued').length;
    const skippedCount = results.filter((r) => r.status === 'skipped').length;
    expect(issuedCount).toBe(3);
    expect(skippedCount).toBe(2);

    const participations = await prisma.benefitParticipation.count({
      where: { businessId },
    });
    expect(participations).toBe(3);
  });

  it('un beneficio sin estimatedCost SÍ se emite si hay cap de cantidad — nunca inventa costo 0', async () => {
    const { assignments } = await makeFixture(5, 1);

    const result = await issuer.issueForAssignment(assignments[0].id);

    expect(result.status).toBe('issued');
  });

  it('tenancy: el cap de un negocio nunca lo consume otro', async () => {
    const fixtureA = await makeFixture(1, 1);
    const fixtureB = await makeFixture(1, 1);

    const [resultA, resultB] = await Promise.all([
      issuer.issueForAssignment(fixtureA.assignments[0].id),
      issuer.issueForAssignment(fixtureB.assignments[0].id),
    ]);

    // Cada negocio tiene SU PROPIO cap=1 — los dos deben poder emitir, no
    // competir entre sí por una única unidad compartida.
    expect(resultA.status).toBe('issued');
    expect(resultB.status).toBe('issued');

    const countA = await prisma.benefitParticipation.count({
      where: { businessId: fixtureA.businessId },
    });
    const countB = await prisma.benefitParticipation.count({
      where: { businessId: fixtureB.businessId },
    });
    expect(countA).toBe(1);
    expect(countB).toBe(1);
  });
});
