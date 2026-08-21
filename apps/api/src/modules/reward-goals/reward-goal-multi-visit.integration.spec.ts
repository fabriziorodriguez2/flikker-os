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
import {
  createTestBusiness,
  makeTestSuffix,
} from '../reviews/reviews.test-helpers';
import { PlansService } from '../plans/plans.service';
import { PlansRepository } from '../plans/plans.repository';
import { RetentionSettingsService } from '../retention-v2/retention-settings.service';
import { AutomationCooldownService } from '../../jobs/automation-cooldown.service';
import { LifecycleEmailsService } from '../../jobs/lifecycle-emails.service';
import { EmailService } from '../../jobs/email.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';

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
        RewardGoalUnlockNotificationService,
        RewardGoalOrchestratorService,
        PlansService,
        PlansRepository,
        RetentionSettingsService,
        AutomationCooldownService,
        LifecycleEmailsService,
        EmailService,
        WhatsAppBspService,
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

  /**
   * Cierra a REDEEMED la goal UNLOCKED de este cliente — mismo efecto final
   * que `RedemptionService.redeem`/`closeRewardGoalIfRedeemed`, sin montar
   * el flujo HTTP+sesión de staff completo (fuera de foco para este test,
   * que es sobre el motor de ciclos, no sobre canje). Necesario desde que
   * `hasActiveGoal` empezó a bloquear un ciclo nuevo mientras el anterior
   * sigue UNLOCKED sin canjear — antes de eso, este test nunca redimía y
   * el motor igual dejaba pasar el ciclo siguiente, que era justamente el
   * bug real que esa regla vino a cerrar.
   */
  async function redeemGoal(businessId: string, customerId: string, at: Date) {
    const goal = await prisma.customerRewardGoal.findFirst({
      where: { businessId, customerId, status: RewardGoalStatus.UNLOCKED },
      select: { id: true, benefitParticipationId: true },
    });
    if (!goal) return;
    if (goal.benefitParticipationId) {
      await prisma.benefitParticipation.update({
        where: { id: goal.benefitParticipationId },
        data: { redeemedAt: at },
      });
    }
    await prisma.customerRewardGoal.updateMany({
      where: { id: goal.id, status: RewardGoalStatus.UNLOCKED },
      data: {
        status: RewardGoalStatus.REDEEMED,
        redeemedAt: at,
        updatedAt: at,
      },
    });
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

      // El cliente canjea el premio — recién ahí el ciclo queda CERRADO.
      await redeemGoal(business.id, customer.id, day(1));

      // Visita 3 — al día siguiente: el ciclo anterior YA está REDEEMED
      // (no UNLOCKED sin canjear), así que el cooldown de 3 días NO aplica
      // — auditoría de caso real: "si está REDEEMED, la próxima Visit
      // válida debe crear inmediatamente un nuevo goal ACTIVE, sin esperar
      // ningún cooldown adicional". visitCount=3 en este punto → REPEAT
      // (entre NEW y FREQUENT), objetivo=2.
      const v3 = await visitOn(business.id, customer.id, day(2));
      expect(v3.unlockedNow).toBe(false);
      expect(v3.goal).toMatchObject({
        progressVisits: 0,
        targetAdditionalVisits: 2,
      });
      goal = await dumpGoal(business.id, customer.id);
      expect(goal).toMatchObject({
        status: RewardGoalStatus.ACTIVE,
        startingVisitCount: 3,
        targetAdditionalVisits: 2,
        segmentAtCreation: 'REPEAT',
      });
      const goalsAfterV3 = await prisma.customerRewardGoal.count({
        where: { businessId: business.id, customerId: customer.id },
      });
      expect(goalsAfterV3).toBe(2); // el ciclo anterior (REDEEMED) + este nuevo.

      // Visita 4 — progreso hacia el objetivo REPEAT (todavía no desbloquea).
      const v4 = await visitOn(business.id, customer.id, day(3));
      expect(v4.unlockedNow).toBe(false);
      expect(v4.goal?.progressVisits).toBe(1);

      // Visita 5 — completa el objetivo REPEAT (2/2) y desbloquea. Se canjea
      // de nuevo, para probar el tercer ciclo.
      const v5 = await visitOn(business.id, customer.id, day(4));
      expect(v5.unlockedNow).toBe(true);
      await redeemGoal(business.id, customer.id, day(4));

      // Visita 6 — de nuevo sin esperar cooldown (REDEEMED). visitCount=6 en
      // este punto → FREQUENT, así que el objetivo escala a 3.
      const v6 = await visitOn(business.id, customer.id, day(5));
      expect(v6.unlockedNow).toBe(false);
      expect(v6.goal).toMatchObject({
        progressVisits: 0,
        targetAdditionalVisits: 3,
      });
      goal = await dumpGoal(business.id, customer.id);
      expect(goal).toMatchObject({
        status: RewardGoalStatus.ACTIVE,
        startingVisitCount: 6,
        targetAdditionalVisits: 3,
        segmentAtCreation: 'FREQUENT',
      });

      // Visitas 7 y 8 — progreso hacia el objetivo FREQUENT (3 visitas), sin
      // desbloquear nada todavía.
      const v7 = await visitOn(business.id, customer.id, day(6));
      expect(v7.unlockedNow).toBe(false);
      expect(v7.goal?.progressVisits).toBe(1);
      const v8 = await visitOn(business.id, customer.id, day(7));
      expect(v8.unlockedNow).toBe(false);
      expect(v8.goal?.progressVisits).toBe(2);

      // Visita 9 — completa las 3 visitas requeridas: la TERCERA recompensa
      // real (nunca en cada visita — cada ciclo pide sus propias visitas).
      const v9 = await visitOn(business.id, customer.id, day(8));
      expect(v9.unlockedNow).toBe(true);
      const totalGoals = await prisma.customerRewardGoal.count({
        where: { businessId: business.id, customerId: customer.id },
      });
      expect(totalGoals).toBe(3); // 3 ciclos completos (NEW→REPEAT→FREQUENT), cada uno con su propia recompensa.
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
        // Canjea apenas desbloquea — con cooldown=0, nada más lo frena
        // salvo la regla nueva de "no un ciclo nuevo mientras el anterior
        // siga UNLOCKED sin canjear"; sin este canje, el patrón se
        // trunca en un solo ciclo para siempre.
        if (v.unlockedNow) {
          await redeemGoal(business.id, customer.id, day(i));
        }
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
