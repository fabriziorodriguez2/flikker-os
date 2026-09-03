import { randomUUID } from 'crypto';
import { ExperienceVersion } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MyFlikkerService } from './my-flikker.service';
import { RewardGoalOrchestratorService } from '../reward-goals/reward-goal-orchestrator.service';
import { RewardGoalEngineService } from '../reward-goals/reward-goal-engine.service';
import { RewardGoalUnlockService } from '../reward-goals/reward-goal-unlock.service';
import { RewardGoalIssuerService } from '../reward-goals/reward-goal-issuer.service';
import { RetentionDecisionLogService } from '../retention-v2/retention-decision-log.service';
import { PlansService } from '../plans/plans.service';
import { PlansRepository } from '../plans/plans.repository';

/**
 * Real-Postgres proof of Fase E §4/§38: a single FlikkerAccount, linked to
 * Customer rows in two SEPARATE businesses, can see both through
 * `MyFlikkerService` — but each business's OWN data stays scoped to that
 * business alone. Skips gracefully when no database is reachable, same
 * convention as the other `*.integration.spec.ts` files.
 */
describe('MyFlikkerService — cross-business aggregation is real (integration)', () => {
  let prisma: PrismaService;
  let service: MyFlikkerService;
  let available = false;
  let flikkerAccountId = '';
  let businessAId = '';
  let businessBId = '';
  let customerAId = '';
  let customerBId = '';

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;
    prisma = new PrismaService();
    try {
      await prisma.$connect();

      const account = await prisma.flikkerAccount.create({
        data: {
          phoneE164: `+598${randomUUID().replace(/\D/g, '').slice(0, 8)}`,
        },
        select: { id: true },
      });
      flikkerAccountId = account.id;

      const businessA = await prisma.business.create({
        data: {
          name: 'Café A',
          slug: `myflikker-a-${randomUUID()}`,
          country: 'UY',
          timezone: 'America/Montevideo',
          currency: 'UYU',
          experienceVersion: ExperienceVersion.CHECKIN_V2,
        },
        select: { id: true },
      });
      businessAId = businessA.id;

      const businessB = await prisma.business.create({
        data: {
          name: 'Bar B',
          slug: `myflikker-b-${randomUUID()}`,
          country: 'UY',
          timezone: 'America/Montevideo',
          currency: 'UYU',
          experienceVersion: ExperienceVersion.CHECKIN_V2,
        },
        select: { id: true },
      });
      businessBId = businessB.id;

      const customerA = await prisma.customer.create({
        data: {
          businessId: businessAId,
          name: 'Ana en A',
          phoneE164: '+59891112222',
          origin: 'qr',
          flikkerAccountId,
        },
        select: { id: true },
      });
      customerAId = customerA.id;

      const customerB = await prisma.customer.create({
        data: {
          businessId: businessBId,
          name: 'Ana en B',
          phoneE164: '+59891112222',
          origin: 'qr',
          flikkerAccountId,
        },
        select: { id: true },
      });
      customerBId = customerB.id;

      await prisma.visit.create({
        data: {
          businessId: businessAId,
          customerId: customerAId,
          visitDayKey: '2026-09-01',
          verificationType: 'manual',
        },
      });
      await prisma.visit.createMany({
        data: [
          {
            businessId: businessBId,
            customerId: customerBId,
            visitDayKey: '2026-09-01',
            verificationType: 'manual',
          },
          {
            businessId: businessBId,
            customerId: customerBId,
            visitDayKey: '2026-09-02',
            verificationType: 'persistent_session',
          },
        ],
      });

      const decisions = new RetentionDecisionLogService(prisma);
      // Real PlansService, real DB: sin Subscription (ninguno de estos
      // negocios de test la tiene) `canAddParticipant` es siempre `true` —
      // cero comportamiento nuevo para este test.
      const plans = new PlansService(new PlansRepository(prisma));
      const engine = new RewardGoalEngineService(prisma, decisions, plans);
      const issuer = new RewardGoalIssuerService(prisma);
      // Este test es sobre agregación cross-business de `currentView`, no
      // sobre el desbloqueo en sí — nunca llega a evaluateUnlock — así que
      // un stub alcanza en vez de construir el árbol completo de
      // notificaciones (LifecycleEmailsService/AutomationCooldownService).
      const unlockNotificationStub = { notify: () => Promise.resolve() };
      const unlock = new RewardGoalUnlockService(
        prisma,
        decisions,
        issuer,
        unlockNotificationStub as never,
      );
      const orchestrator = new RewardGoalOrchestratorService(
        prisma,
        engine,
        unlock,
      );
      // Este test es sobre aislamiento cross-business de visitas/reward
      // goals — no sobre beneficios de promoción, así que un stub alcanza
      // en vez de construir el árbol completo de `BenefitsService`.
      const benefitsStub = {
        getOtherAvailableBenefits: () => Promise.resolve([]),
      };
      // Misiones no participan de este test de aislamiento: sin misiones
      // creadas, el read-model devuelve una lista vacia igual que en la vida
      // real.
      const missionsStub = { currentView: () => Promise.resolve([]) };
      // Rachas tampoco: este test es sobre aislamiento cross-business de
      // visitas y reward goals.
      const streaksStub = {
        getStreaksForCustomers: () => Promise.resolve(new Map()),
      };
      service = new MyFlikkerService(
        prisma,
        orchestrator,
        missionsStub as never,
        streaksStub as never,
        { currentViewForCustomers: () => Promise.resolve(new Map()) } as never,
        benefitsStub as never,
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
    await prisma.visit.deleteMany({
      where: { businessId: { in: [businessAId, businessBId] } },
    });
    await prisma.customer.deleteMany({
      where: { id: { in: [customerAId, customerBId] } },
    });
    await prisma.business.deleteMany({
      where: { id: { in: [businessAId, businessBId] } },
    });
    await prisma.flikkerAccount.deleteMany({ where: { id: flikkerAccountId } });
    await prisma.$disconnect();
  });

  it('lists both businesses for the account that has a Customer in each', async () => {
    if (!available) {
      console.warn('DB unavailable — skipping Mi Flikker integration test');
      return;
    }

    const places = await service.listPlaces(flikkerAccountId);

    expect(places).toHaveLength(2);
    const byBusiness = new Map(places.map((p) => [p.businessId, p]));
    expect(byBusiness.get(businessAId)?.visitsTotal).toBe(1);
    expect(byBusiness.get(businessBId)?.visitsTotal).toBe(2);
  });

  it('keeps each business’s visit count independent — no bleed between them', async () => {
    if (!available) return;

    const detailA = await service.placeDetail(flikkerAccountId, businessAId);
    const detailB = await service.placeDetail(flikkerAccountId, businessBId);

    expect(detailA.visitsTotal).toBe(1);
    expect(detailB.visitsTotal).toBe(2);
    expect(detailA.businessName).toBe('Café A');
    expect(detailB.businessName).toBe('Bar B');
  });

  it('404s for a business this account has no Customer in — no directory browsing', async () => {
    if (!available) return;

    await expect(
      service.placeDetail(flikkerAccountId, 'some-unrelated-business-id'),
    ).rejects.toThrow('Business not found');
  });

  it('scopes RewardGoal reads to one business even for the same underlying person (Fase E §38)', async () => {
    if (!available) return;

    await prisma.retentionSettings.create({
      data: { businessId: businessAId, rewardGoalsEnabled: true },
    });
    const incentiveA = await prisma.retentionIncentiveDefinition.create({
      data: {
        businessId: businessAId,
        name: 'Upgrade en A',
        type: 'gift',
        active: true,
        rewardGoalEligible: true,
      },
      select: { id: true },
    });
    const goalA = await prisma.customerRewardGoal.create({
      data: {
        businessId: businessAId,
        customerId: customerAId,
        incentiveDefinitionId: incentiveA.id,
        startingVisitCount: 0,
        targetAdditionalVisits: 1,
        reasonCode: 'NEW_SECOND_VISIT',
        segmentAtCreation: 'NEW',
      },
    });

    try {
      // Business B's own view of the SAME person's account never surfaces
      // business A's goal — the query is scoped by businessId, not by the
      // shared flikkerAccountId.
      const goalVisibleFromB = await prisma.customerRewardGoal.findFirst({
        where: { businessId: businessBId, customerId: customerBId },
      });
      expect(goalVisibleFromB).toBeNull();

      const goalVisibleFromA = await prisma.customerRewardGoal.findFirst({
        where: { businessId: businessAId, customerId: customerAId },
      });
      expect(goalVisibleFromA?.id).toBe(goalA.id);

      // And Mi Flikker's own cross-business view correctly attributes the
      // goal to business A only.
      const detailA = await service.placeDetail(flikkerAccountId, businessAId);
      const detailB = await service.placeDetail(flikkerAccountId, businessBId);
      expect(detailA.rewardGoal?.incentiveName).toBe('Upgrade en A');
      expect(detailB.rewardGoal).toBeNull();
    } finally {
      await prisma.customerRewardGoal.deleteMany({
        where: { businessId: businessAId },
      });
      await prisma.retentionIncentiveDefinition.deleteMany({
        where: { businessId: businessAId },
      });
      await prisma.retentionSettings.deleteMany({
        where: { businessId: businessAId },
      });
    }
  });

  it('never lets one account see a DIFFERENT account’s places', async () => {
    if (!available) return;

    const otherAccount = await prisma.flikkerAccount.create({
      data: { phoneE164: `+598${randomUUID().replace(/\D/g, '').slice(0, 8)}` },
      select: { id: true },
    });

    try {
      const places = await service.listPlaces(otherAccount.id);
      expect(places).toHaveLength(0);

      await expect(
        service.placeDetail(otherAccount.id, businessAId),
      ).rejects.toThrow('Business not found');
    } finally {
      await prisma.flikkerAccount.delete({ where: { id: otherAccount.id } });
    }
  });
});
