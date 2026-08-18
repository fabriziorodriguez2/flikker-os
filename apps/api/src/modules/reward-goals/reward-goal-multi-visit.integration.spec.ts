import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { BenefitType, RewardGoalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RetentionDecisionLogService } from '../retention-v2/retention-decision-log.service';
import { RewardGoalEngineService } from './reward-goal-engine.service';
import { RewardGoalIssuerService } from './reward-goal-issuer.service';
import { RewardGoalUnlockService } from './reward-goal-unlock.service';
import { RewardGoalOrchestratorService } from './reward-goal-orchestrator.service';
import {
  createTestBusiness,
  makeTestSuffix,
} from '../reviews/reviews.test-helpers';
import { PlansService } from '../plans/plans.service';
import { PlansRepository } from '../plans/plans.repository';

/**
 * Pre-piloto #6 — "¿por qué me ofrece Capuccino en cada visita?"
 *
 * Reproduce, contra DB real (sin mocks), la secuencia completa de visitas
 * que un negocio real generaría, en dos configuraciones:
 *
 *   A. Default (sin overrides, cooldown=3 días — lo que trae Flikker de
 *      fábrica): confirma que el motor NUNCA regala en cada visita.
 *   B. Mal configurado a propósito (cooldown=0 + min=max=1): reproduce el
 *      único mecanismo por el que "parece" premiar todo el tiempo, y
 *      demuestra el límite real de esa hipótesis (nunca crea Y desbloquea
 *      en la misma visita — como mucho, una recompensa cada 2 visitas).
 *
 * Ningún código de `reward-goal-engine.service.ts` /
 * `reward-goal-unlock.service.ts` se modificó para este ajuste — esto solo
 * agrega la cobertura multi-visita que faltaba (ver informe: los guards
 * `hasActiveGoal`/`isCooldownActive` ya existían y ya funcionan).
 */
describe('Reward Goals — múltiples visitas consecutivas (integration)', () => {
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
        RewardGoalOrchestratorService,
        PlansService,
        PlansRepository,
      ],
    }).compile();

    prisma = module.get(PrismaService);
    orchestrator = module.get(RewardGoalOrchestratorService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function setupBusiness(settingsOverrides: {
    rewardGoalCooldownDays?: number;
    rewardGoalMinVisits?: number | null;
    rewardGoalMaxVisits?: number | null;
  }) {
    const suffix = makeTestSuffix();
    const business = await createTestBusiness(
      prisma,
      `rg-multivisit-${suffix}`,
    );
    const customer = await prisma.customer.create({
      data: {
        id: randomUUID(),
        businessId: business.id,
        name: `Cliente ${suffix}`,
        phoneE164: `+59890${suffix.slice(0, 6)}`,
      },
    });
    const incentive = await prisma.retentionIncentiveDefinition.create({
      data: {
        businessId: business.id,
        name: 'Capuccino gratis',
        type: BenefitType.gift,
        active: true,
        rewardGoalEligible: true,
      },
    });
    await prisma.retentionSettings.create({
      data: {
        businessId: business.id,
        rewardGoalsEnabled: true,
        rewardGoalCooldownDays: settingsOverrides.rewardGoalCooldownDays ?? 3,
        rewardGoalMinVisits: settingsOverrides.rewardGoalMinVisits ?? null,
        rewardGoalMaxVisits: settingsOverrides.rewardGoalMaxVisits ?? null,
      },
    });
    return { business, customer, incentive };
  }

  async function cleanup(businessId: string) {
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

  /**
   * Creates the Visit row exactly like checkin.service.ts does, then calls
   * afterVisit — plus a fixup real integration tests need and mocked unit
   * tests never hit: `CustomerRewardGoal.activatedAt`/`updatedAt` are
   * `@default(now())`/`@updatedAt`, so Prisma stamps them with the ACTUAL
   * wall clock at write time, not the simulated `at`. Without pinning them
   * to `at`, `isCooldownActive`'s comparison (`domain now` vs. real
   * `updatedAt`) and progress counting (`occurredAt` vs. real `activatedAt`)
   * would compare two different clocks and produce nonsense — a test
   * artifact, not anything `reward-goal-engine.service.ts` itself does
   * wrong (it only ever sees one consistent clock in production, where
   * `now` always IS wall-clock time).
   */
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
    const result = await orchestrator.afterVisit(
      businessId,
      customerId,
      'America/Montevideo',
      at,
    );
    if (result.goal && result.goal.progressVisits === 0) {
      await prisma.customerRewardGoal.updateMany({
        where: { businessId, customerId, status: RewardGoalStatus.ACTIVE },
        data: { activatedAt: at },
      });
    }
    if (result.unlockedNow) {
      await prisma.customerRewardGoal.updateMany({
        where: { businessId, customerId, status: RewardGoalStatus.UNLOCKED },
        data: { updatedAt: at },
      });
    }
    return result;
  }

  async function dumpGoal(businessId: string, customerId: string) {
    return prisma.customerRewardGoal.findFirst({
      where: { businessId, customerId },
      orderBy: { createdAt: 'desc' },
      select: {
        status: true,
        startingVisitCount: true,
        targetAdditionalVisits: true,
        segmentAtCreation: true,
        benefitParticipationId: true,
      },
    });
  }

  // Piloto V2 (#6) — relativas al momento real en que corre el test, no a
  // una fecha fija: `updatedAt` de una CustomerRewardGoal se auto-setea al
  // reloj real de la escritura (Prisma `@updatedAt`), y `isCooldownActive`
  // compara ESE timestamp real contra el `now` de dominio de la próxima
  // visita. Con fechas fijas en el pasado, `elapsedDays` sale negativo y el
  // cooldown queda "activo" para siempre — un artefacto del test, no del
  // producto. Anclar a `Date.now()` es lo que hace la comparación real.
  const baseNow = Date.now();
  const daysFrom = (n: number) => new Date(baseNow + n * 86_400_000);

  it('A. Default (sin overrides, cooldown=3): nunca premia en cada visita, escala el objetivo', async () => {
    const day = daysFrom;
    const { business, customer } = await setupBusiness({});
    try {
      // Visita 1 — crea la primera goal (segmento NEW → target 1).
      const v1 = await visitOn(business.id, customer.id, day(0));
      expect(v1.unlockedNow).toBe(false);
      expect(v1.goal).toMatchObject({
        progressVisits: 0,
        targetAdditionalVisits: 1,
      });
      let goal = await dumpGoal(business.id, customer.id);
      expect(goal).toMatchObject({
        status: RewardGoalStatus.ACTIVE,
        startingVisitCount: 1,
        targetAdditionalVisits: 1,
        segmentAtCreation: 'NEW',
      });

      // Visita 2 — un día después: desbloquea LA MISMA goal (progreso 1/1).
      const v2 = await visitOn(business.id, customer.id, day(1));
      expect(v2.unlockedNow).toBe(true);
      expect(v2.benefit?.name).toBe('Capuccino gratis');
      goal = await dumpGoal(business.id, customer.id);
      expect(goal?.status).toBe(RewardGoalStatus.UNLOCKED);
      expect(goal?.benefitParticipationId).not.toBeNull();
      const goalsAfterV2 = await prisma.customerRewardGoal.count({
        where: { businessId: business.id, customerId: customer.id },
      });
      expect(goalsAfterV2).toBe(1); // todavía solo una goal — nada nuevo se creó al desbloquear.

      // Visita 3 — al día siguiente (dentro del cooldown de 3 días): NO
      // premia otra vez, NO crea una goal nueva. Esto es exactamente lo que
      // el pedido dice que NO debe pasar ("visita 4 → otra recompensa").
      const v3 = await visitOn(business.id, customer.id, day(2));
      expect(v3).toEqual({ goal: null, unlockedNow: false, benefit: null });
      const goalsAfterV3 = await prisma.customerRewardGoal.count({
        where: { businessId: business.id, customerId: customer.id },
      });
      expect(goalsAfterV3).toBe(1); // sigue siendo una sola — cooldown activo.

      // Visita 4 — 13 días después (bien pasado el cooldown): el motor
      // recién ahí crea una NUEVA goal — y con visitCount=4 el segmento ya
      // es FREQUENT, así que el objetivo escala a 3, no se queda en 1.
      const v4 = await visitOn(business.id, customer.id, day(15));
      expect(v4.unlockedNow).toBe(false);
      expect(v4.goal).toMatchObject({
        progressVisits: 0,
        targetAdditionalVisits: 3,
      });
      goal = await dumpGoal(business.id, customer.id);
      expect(goal).toMatchObject({
        status: RewardGoalStatus.ACTIVE,
        startingVisitCount: 4,
        targetAdditionalVisits: 3,
        segmentAtCreation: 'FREQUENT',
      });

      // Visitas 5 y 6 — progreso hacia el nuevo objetivo (3 visitas), sin
      // desbloquear nada todavía.
      const v5 = await visitOn(business.id, customer.id, day(16));
      expect(v5.unlockedNow).toBe(false);
      expect(v5.goal?.progressVisits).toBe(1);
      const v6 = await visitOn(business.id, customer.id, day(17));
      expect(v6.unlockedNow).toBe(false);
      expect(v6.goal?.progressVisits).toBe(2);

      // Visita 7 — completa las 3 visitas requeridas: recién ahí, la
      // SEGUNDA recompensa real (no en cada visita, sino tras 3 más).
      const v7 = await visitOn(business.id, customer.id, day(18));
      expect(v7.unlockedNow).toBe(true);
      const totalGoals = await prisma.customerRewardGoal.count({
        where: { businessId: business.id, customerId: customer.id },
      });
      expect(totalGoals).toBe(2); // exactamente 2 recompensas en 7 visitas, no 6 o 7.
    } finally {
      await cleanup(business.id);
    }
  });

  it('B. Mal configurado (cooldown=0 + min=max=1): premia cada 2 visitas — nunca en la misma visita que crea la goal', async () => {
    const day = (n: number) => new Date(Date.UTC(2026, 1, 1 + n, 12, 0, 0));
    const { business, customer } = await setupBusiness({
      rewardGoalCooldownDays: 0,
      rewardGoalMinVisits: 1,
      rewardGoalMaxVisits: 1,
    });
    try {
      const results: boolean[] = [];
      for (let i = 0; i < 6; i++) {
        const v = await visitOn(business.id, customer.id, day(i));
        results.push(v.unlockedNow);
      }
      // Patrón exacto con esta config: crea, desbloquea, crea, desbloquea...
      // — nunca "cada visita" literal (eso violaría "never create and
      // unlock in the same call"), sino cada 2 visitas, indefinidamente.
      expect(results).toEqual([false, true, false, true, false, true]);

      const totalGoals = await prisma.customerRewardGoal.count({
        where: { businessId: business.id, customerId: customer.id },
      });
      expect(totalGoals).toBe(3); // una goal creada por cada ciclo de 2 visitas.
    } finally {
      await cleanup(business.id);
    }
  });
});
