import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { BenefitType, RewardGoalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RetentionDecisionLogService } from '../retention-v2/retention-decision-log.service';
import { RewardGoalEngineService } from './reward-goal-engine.service';
import { RewardGoalIssuerService } from './reward-goal-issuer.service';
import { RewardGoalUnlockService } from './reward-goal-unlock.service';
import { RewardGoalUnlockNotificationService } from './reward-goal-unlock-notification.service';
import { RewardGoalOrchestratorService } from './reward-goal-orchestrator.service';
import { PlansService } from '../plans/plans.service';
import { PlansRepository } from '../plans/plans.repository';
import { RetentionSettingsService } from '../retention-v2/retention-settings.service';
import { AutomationCooldownService } from '../../jobs/automation-cooldown.service';
import { LifecycleEmailsService } from '../../jobs/lifecycle-emails.service';
import { EmailService } from '../../jobs/email.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { CustomerPublicUrlService } from '../public/customer-public-url.service';
import { VisitSourcesService } from '../visit-sources/visit-sources.service';
import { VisitSourcesRepository } from '../visit-sources/visit-sources.repository';
import { OwnerNotificationsQueue } from '../../jobs/owner-notifications.queue';
import {
  createTestBusiness,
  makeTestSuffix,
} from '../reviews/reviews.test-helpers';

/**
 * La regla de ciclo, contra DB real.
 *
 * Cuando una tarjeta llega a N/N el ciclo siguiente nace en el MISMO flujo,
 * sin esperar canje, vencimiento ni próxima visita. Y la visita que completó
 * el ciclo anterior NO puede contar para el nuevo: sería el mismo sello dos
 * veces.
 *
 * Contra DB real y no con mocks porque lo que se prueba es justamente la
 * aritmética de `activatedAt` contra `Visit.occurredAt` — la parte que un
 * mock no puede equivocarse igual que la base.
 */
describe('Reward Goals — el ciclo siguiente nace con el unlock (integration)', () => {
  let prisma: PrismaService;
  let orchestrator: RewardGoalOrchestratorService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        RetentionDecisionLogService,
        RewardGoalEngineService,
        RewardGoalIssuerService,
        RewardGoalUnlockService,
        RewardGoalUnlockNotificationService,
        RewardGoalOrchestratorService,
        PlansService,
        PlansRepository,
        RetentionSettingsService,
        AutomationCooldownService,
        LifecycleEmailsService,
        EmailService,
        WhatsAppBspService,
        CustomerPublicUrlService,
        VisitSourcesService,
        VisitSourcesRepository,
        OwnerNotificationsQueue,
      ],
    }).compile();

    prisma = module.get(PrismaService);
    orchestrator = module.get(RewardGoalOrchestratorService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function setup(target = 2, rewardGoalsEnabled = true) {
    const suffix = makeTestSuffix();
    const business = await createTestBusiness(prisma, `next-cycle-${suffix}`);
    const customer = await prisma.customer.create({
      data: {
        id: randomUUID(),
        businessId: business.id,
        name: `Cliente ${suffix}`,
        phoneE164: `+59890${suffix.slice(0, 6)}`,
      },
    });
    await prisma.retentionIncentiveDefinition.create({
      data: {
        businessId: business.id,
        name: 'Porción de muzza',
        type: BenefitType.gift,
        active: true,
        rewardGoalEligible: true,
      },
    });
    await prisma.retentionSettings.create({
      data: {
        businessId: business.id,
        rewardGoalsEnabled,
        rewardGoalCooldownDays: 3,
        rewardGoalMinVisits: target,
        rewardGoalMaxVisits: target,
      },
    });
    return { business, customer };
  }

  async function cleanup(businessId: string) {
    await prisma.rewardGoalBonusStamp
      .deleteMany({ where: { businessId } })
      .catch(() => undefined);
    await prisma.benefitParticipation.deleteMany({ where: { businessId } });
    await prisma.customerRewardGoal.deleteMany({ where: { businessId } });
    await prisma.retentionDecisionLog
      .deleteMany({ where: { businessId } })
      .catch(() => undefined);
    await prisma.visit.deleteMany({ where: { businessId } });
    await prisma.benefit.deleteMany({ where: { businessId } });
    await prisma.retentionIncentiveDefinition.deleteMany({
      where: { businessId },
    });
    await prisma.retentionSettings.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
  }

  /** Una visita real + el mismo `afterVisit` que corre el check-in. */
  async function visitOn(businessId: string, customerId: string, at: Date) {
    await prisma.visit.create({
      data: {
        businessId,
        customerId,
        occurredAt: at,
        visitDayKey: at.toISOString().slice(0, 10),
        verificationType: 'manual',
      },
    });
    const view = await orchestrator.afterVisit(
      businessId,
      customerId,
      'America/Montevideo',
      at,
    );
    return view;
  }

  const goalsOf = (businessId: string, customerId: string) =>
    prisma.customerRewardGoal.findMany({
      where: { businessId, customerId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        status: true,
        activatedAt: true,
        targetAdditionalVisits: true,
      },
    });

  it('caso principal: al completar A, B existe ACTIVE en 0/N — y esa visita NO cuenta para B', async () => {
    const { business, customer } = await setup(2);
    try {
      const v1 = new Date('2026-09-01T10:00:00.000Z');
      // Primera visita: crea el ciclo A y cuenta como su primer sello (1/2).
      const first = await visitOn(business.id, customer.id, v1);
      expect(first.goal).toMatchObject({
        progressVisits: 1,
        targetAdditionalVisits: 2,
      });

      // Segunda visita: completa A (2/2) → UNLOCKED + premio emitido.
      const v2 = new Date('2026-09-03T10:00:00.000Z');
      const unlock = await visitOn(business.id, customer.id, v2);
      expect(unlock.unlockedNow).toBe(true);
      expect(unlock.benefit?.name).toBe('Porción de muzza');

      // A quedó UNLOCKED y B nació ACTIVE, en el mismo flujo.
      const goals = await goalsOf(business.id, customer.id);
      expect(goals).toHaveLength(2);
      expect(goals[0].status).toBe(RewardGoalStatus.UNLOCKED);
      expect(goals[1].status).toBe(RewardGoalStatus.ACTIVE);

      // LA CLAVE: la frontera de B es exactamente el instante de la visita
      // que completó A, así que esa visita no es "estrictamente posterior" y
      // queda afuera.
      expect(goals[1].activatedAt).toEqual(v2);

      // Y se ve como 0/2, no 1/2.
      const view = await orchestrator.currentView(business.id, customer.id);
      expect(view.goal).toMatchObject({
        progressVisits: 0,
        visitProgress: 0,
        targetAdditionalVisits: 2,
        remainingVisits: 2,
      });

      // El premio de A existe y es independiente del ciclo B.
      const participations = await prisma.benefitParticipation.findMany({
        where: { businessId: business.id, customerId: customer.id },
      });
      expect(participations).toHaveLength(1);
    } finally {
      await cleanup(business.id);
    }
  });

  it('la próxima visita válida lleva B de 0/N a 1/N', async () => {
    const { business, customer } = await setup(2);
    try {
      await visitOn(
        business.id,
        customer.id,
        new Date('2026-09-01T10:00:00.000Z'),
      );
      await visitOn(
        business.id,
        customer.id,
        new Date('2026-09-03T10:00:00.000Z'),
      );

      const next = await visitOn(
        business.id,
        customer.id,
        new Date('2026-09-05T10:00:00.000Z'),
      );

      expect(next.unlockedNow).toBe(false);
      expect(next.goal).toMatchObject({
        progressVisits: 1,
        visitProgress: 1,
        targetAdditionalVisits: 2,
      });
    } finally {
      await cleanup(business.id);
    }
  });

  it('releer no crea un tercer ciclo — `currentView` es de solo lectura', async () => {
    const { business, customer } = await setup(2);
    try {
      await visitOn(
        business.id,
        customer.id,
        new Date('2026-09-01T10:00:00.000Z'),
      );
      await visitOn(
        business.id,
        customer.id,
        new Date('2026-09-03T10:00:00.000Z'),
      );

      await orchestrator.currentView(business.id, customer.id);
      await orchestrator.currentView(business.id, customer.id);
      await orchestrator.currentView(business.id, customer.id);

      expect(await goalsOf(business.id, customer.id)).toHaveLength(2);
    } finally {
      await cleanup(business.id);
    }
  });

  it('el ciclo B sigue igual con el premio de A sin canjear, canjeado o vencido', async () => {
    const { business, customer } = await setup(2);
    try {
      await visitOn(
        business.id,
        customer.id,
        new Date('2026-09-01T10:00:00.000Z'),
      );
      await visitOn(
        business.id,
        customer.id,
        new Date('2026-09-03T10:00:00.000Z'),
      );

      const before = await orchestrator.currentView(business.id, customer.id);
      expect(before.goal?.progressVisits).toBe(0);

      // Canjeado.
      const participation = await prisma.benefitParticipation.findFirstOrThrow({
        where: { businessId: business.id, customerId: customer.id },
      });
      await prisma.benefitParticipation.update({
        where: { id: participation.id },
        data: { redeemedAt: new Date('2026-09-04T10:00:00.000Z') },
      });
      const afterRedeem = await orchestrator.currentView(
        business.id,
        customer.id,
      );
      expect(afterRedeem.goal).toEqual(before.goal);

      // Vencido.
      await prisma.benefitParticipation.update({
        where: { id: participation.id },
        data: {
          redeemedAt: null,
          expiresAt: new Date('2026-09-02T10:00:00.000Z'),
        },
      });
      const afterExpiry = await orchestrator.currentView(
        business.id,
        customer.id,
      );
      expect(afterExpiry.goal).toEqual(before.goal);

      // Y en ningún caso apareció un ciclo de más.
      expect(await goalsOf(business.id, customer.id)).toHaveLength(2);
    } finally {
      await cleanup(business.id);
    }
  });

  it('cambiar la config de 2 a 8 después NO mueve el target ya snapshoteado de B', async () => {
    const { business, customer } = await setup(2);
    try {
      await visitOn(
        business.id,
        customer.id,
        new Date('2026-09-01T10:00:00.000Z'),
      );
      await visitOn(
        business.id,
        customer.id,
        new Date('2026-09-03T10:00:00.000Z'),
      );

      await prisma.retentionSettings.update({
        where: { businessId: business.id },
        data: { rewardGoalMinVisits: 8, rewardGoalMaxVisits: 8 },
      });

      const goals = await goalsOf(business.id, customer.id);
      expect(goals[1].targetAdditionalVisits).toBe(2);
      const view = await orchestrator.currentView(business.id, customer.id);
      expect(view.goal?.targetAdditionalVisits).toBe(2);
    } finally {
      await cleanup(business.id);
    }
  });

  /*
    §8: si el dueño apagó los sellos, no se inventa un ciclo vacío. El
    unlock y el premio del ciclo que YA estaba prometido siguen valiendo —
    apagar la feature no le saca a nadie lo que ya ganó.
  */
  it('con los sellos apagados a mitad de camino: el unlock ocurre, pero NO nace un ciclo nuevo', async () => {
    const { business, customer } = await setup(2);
    try {
      await visitOn(
        business.id,
        customer.id,
        new Date('2026-09-01T10:00:00.000Z'),
      );

      await prisma.retentionSettings.update({
        where: { businessId: business.id },
        data: { rewardGoalsEnabled: false },
      });

      const unlock = await visitOn(
        business.id,
        customer.id,
        new Date('2026-09-03T10:00:00.000Z'),
      );

      expect(unlock.unlockedNow).toBe(true);
      const goals = await goalsOf(business.id, customer.id);
      expect(goals).toHaveLength(1);
      expect(goals[0].status).toBe(RewardGoalStatus.UNLOCKED);
    } finally {
      await cleanup(business.id);
    }
  });

  /*
    El índice único parcial `customer_reward_goals_one_active_per_customer`
    es el backstop final: aunque dos flujos intentaran crear el ciclo
    siguiente a la vez, la base solo deja uno ACTIVE.
  */
  it('dos unlocks concurrentes sobre el mismo cliente dejan UN solo ciclo ACTIVE', async () => {
    const { business, customer } = await setup(2);
    try {
      await visitOn(
        business.id,
        customer.id,
        new Date('2026-09-01T10:00:00.000Z'),
      );
      await prisma.visit.create({
        data: {
          businessId: business.id,
          customerId: customer.id,
          occurredAt: new Date('2026-09-03T10:00:00.000Z'),
          visitDayKey: '2026-09-03',
          verificationType: 'manual',
        },
      });

      const at = new Date('2026-09-03T10:00:00.000Z');
      await Promise.all([
        orchestrator.afterVisit(
          business.id,
          customer.id,
          'America/Montevideo',
          at,
        ),
        orchestrator.afterVisit(
          business.id,
          customer.id,
          'America/Montevideo',
          at,
        ),
      ]);

      const goals = await goalsOf(business.id, customer.id);
      const active = goals.filter((g) => g.status === RewardGoalStatus.ACTIVE);
      expect(active).toHaveLength(1);
      // Y un solo premio emitido por el unlock.
      const participations = await prisma.benefitParticipation.findMany({
        where: { businessId: business.id, customerId: customer.id },
      });
      expect(participations).toHaveLength(1);
    } finally {
      await cleanup(business.id);
    }
  });
});
