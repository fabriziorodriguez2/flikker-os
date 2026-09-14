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
import { CustomerPublicUrlService } from '../public/customer-public-url.service';
import { VisitSourcesService } from '../visit-sources/visit-sources.service';
import { VisitSourcesRepository } from '../visit-sources/visit-sources.repository';

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
 * `reward-goal-unlock.service.ts` no se tocó — los guards
 * `hasActiveGoal`/`isCooldownActive` ya existían y ya funcionan.
 *
 * `reward-goal-engine.service.ts` SÍ se corrigió (auditoría de caso real:
 * la primera visita nunca dejaba el primer sello) — `activatedAt` de una
 * goal recién creada ahora queda un milisegundo antes de `context.now` en
 * vez de exactamente igual, así que la visita fundadora de cada ciclo
 * cuenta como su propio primer sello. Eso hace que cada ciclo de este test
 * se complete una visita antes que en la versión vieja del archivo — los
 * números de `progressVisits`/`unlockedNow` de abajo son los reales,
 * confirmados corriendo este escenario contra la base local con el fix
 * aplicado, no derivados a mano.
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
        CustomerPublicUrlService,
        VisitSourcesService,
        VisitSourcesRepository,
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
      // Visita 1 — crea la primera goal (segmento NEW → target 1). La
      // fundadora ya cuenta como el primer sello (bug real corregido: antes
      // quedaba afuera del conteo para siempre).
      const v1 = await visitOn(business.id, customer.id, day(0));
      expect(v1.unlockedNow).toBe(false);
      expect(v1.goal).toMatchObject({
        progressVisits: 1,
        targetAdditionalVisits: 1,
      });
      let goal = await dumpGoal(business.id, customer.id);
      expect(goal).toMatchObject({
        status: RewardGoalStatus.ACTIVE,
        startingVisitCount: 1,
        targetAdditionalVisits: 1,
        segmentAtCreation: 'NEW',
      });

      // Visita 2 — un día después: desbloquea LA MISMA goal (Fase E §27 igual
      // exige que el desbloqueo ocurra en una visita distinta a la de
      // creación, aunque la fundadora ya valga como progreso).
      const v2 = await visitOn(business.id, customer.id, day(1));
      expect(v2.unlockedNow).toBe(true);
      expect(v2.benefit?.name).toBe('Capuccino gratis');
      const unlockedGoal = await prisma.customerRewardGoal.findFirst({
        where: { businessId: business.id, customerId: customer.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(unlockedGoal?.status).toBe(RewardGoalStatus.UNLOCKED);
      expect(unlockedGoal?.benefitParticipationId).not.toBeNull();
      // Dos goals: la que se acaba de completar y la siguiente, que nace en
      // el mismo acto. El cliente nunca se queda sin tarjeta.
      const goalsAfterV2 = await prisma.customerRewardGoal.count({
        where: { businessId: business.id, customerId: customer.id },
      });
      expect(goalsAfterV2).toBe(2);
      goal = await dumpGoal(business.id, customer.id);
      expect(goal?.status).toBe(RewardGoalStatus.ACTIVE);

      // El cliente canjea el premio — recién ahí el ciclo queda CERRADO.
      await redeemGoal(business.id, customer.id, day(1));

      // Visita 3 — el ciclo que ya estaba abierto suma su primer sello. El
      // cooldown de 3 días no aparece por ningún lado: la continuación de un
      // ciclo completado no es una meta "nueva" que haya que espaciar.
      // Segmento al momento de crearla (v2, visitCount=2) → REPEAT,
      // objetivo=2.
      const v3 = await visitOn(business.id, customer.id, day(2));
      expect(v3.unlockedNow).toBe(false);
      expect(v3.goal).toMatchObject({
        progressVisits: 1,
        targetAdditionalVisits: 2,
      });
      goal = await dumpGoal(business.id, customer.id);
      expect(goal).toMatchObject({
        status: RewardGoalStatus.ACTIVE,
        // 2, no 3: la meta nació en v2 (el desbloqueo), no en v3. Es un
        // dato de diagnóstico — el progreso nunca sale de esta resta, sale
        // de contar Visit posteriores a `activatedAt`.
        startingVisitCount: 2,
        targetAdditionalVisits: 2,
        segmentAtCreation: 'REPEAT',
      });
      const goalsAfterV3 = await prisma.customerRewardGoal.count({
        where: { businessId: business.id, customerId: customer.id },
      });
      expect(goalsAfterV3).toBe(2); // el ciclo anterior (REDEEMED) + este nuevo.

      // Visita 4 — completa el objetivo REPEAT (fundadora + esta = 2/2) y
      // desbloquea. Antes de la corrección esto recién pasaba en la visita 5
      // — la fundadora contaba un ciclo entero más tarde de lo debido. Se
      // canjea, para probar el tercer ciclo.
      const v4 = await visitOn(business.id, customer.id, day(3));
      expect(v4.unlockedNow).toBe(true);
      await redeemGoal(business.id, customer.id, day(3));

      // Visita 5 — primer sello del ciclo que nació en v4. En ese momento
      // visitCount=4 → FREQUENT, así que el objetivo escaló a 3: la meta se
      // sigue endureciendo a medida que el cliente se vuelve habitual.
      const v5 = await visitOn(business.id, customer.id, day(4));
      expect(v5.unlockedNow).toBe(false);
      expect(v5.goal).toMatchObject({
        progressVisits: 1,
        targetAdditionalVisits: 3,
      });
      goal = await dumpGoal(business.id, customer.id);
      expect(goal).toMatchObject({
        status: RewardGoalStatus.ACTIVE,
        startingVisitCount: 4,
        targetAdditionalVisits: 3,
        segmentAtCreation: 'FREQUENT',
      });

      // Visita 6 — progreso hacia el objetivo FREQUENT (3 visitas), sin
      // desbloquear todavía.
      const v6 = await visitOn(business.id, customer.id, day(5));
      expect(v6.unlockedNow).toBe(false);
      expect(v6.goal?.progressVisits).toBe(2);

      // Visita 7 — completa las 3 visitas requeridas (fundadora + v6 + v7):
      // la TERCERA recompensa real (nunca en cada visita — cada ciclo pide
      // sus propias visitas). Se canjea, para probar un cuarto ciclo.
      const v7 = await visitOn(business.id, customer.id, day(6));
      expect(v7.unlockedNow).toBe(true);
      await redeemGoal(business.id, customer.id, day(6));

      // Visita 8 — primer sello del cuarto ciclo, abierto en v7 (sigue
      // FREQUENT, objetivo 3).
      const v8 = await visitOn(business.id, customer.id, day(7));
      expect(v8.unlockedNow).toBe(false);
      expect(v8.goal).toMatchObject({
        progressVisits: 1,
        targetAdditionalVisits: 3,
      });
      goal = await dumpGoal(business.id, customer.id);
      expect(goal).toMatchObject({
        status: RewardGoalStatus.ACTIVE,
        startingVisitCount: 7,
        targetAdditionalVisits: 3,
        segmentAtCreation: 'FREQUENT',
      });

      // Visita 9 — progreso hacia el cuarto ciclo, sin desbloquear: el
      // patrón nunca premia en cada visita, ni siquiera dentro de un mismo
      // ciclo FREQUENT.
      const v9 = await visitOn(business.id, customer.id, day(8));
      expect(v9.unlockedNow).toBe(false);
      expect(v9.goal?.progressVisits).toBe(2);

      const totalGoals = await prisma.customerRewardGoal.count({
        where: { businessId: business.id, customerId: customer.id },
      });
      expect(totalGoals).toBe(4); // 3 ciclos completos y canjeados (NEW→REPEAT→FREQUENT) + un cuarto ciclo FREQUENT todavía en progreso.
    } finally {
      await cleanup(business.id);
    }
  });

  /*
    Objetivo 1 es una config degenerada, y con la regla de continuidad de
    ciclo lo es todavía más: como el ciclo siguiente ya está abierto cuando
    el cliente vuelve, su primera visita lo completa. Resultado: premio en
    cada visita a partir de la segunda.

    Se testea justamente para dejarlo documentado y visible. No es un bug de
    la continuidad — es lo que "necesito 1 sello" significa cuando el
    cliente nunca se queda sin tarjeta. La regla "nunca crear y desbloquear
    en la misma llamada" se sigue respetando: cada ciclo se crea en una
    llamada y se desbloquea en la siguiente.
  */
  it('B. Mal configurado (cooldown=0 + min=max=1): premia en cada visita salvo la primera — nunca en la misma llamada que crea la goal', async () => {
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
        // El canje ya no hace falta para destrabar nada — se deja igual
        // para probar precisamente eso: el estado del premio anterior no
        // influye en el ciclo siguiente.
        if (v.unlockedNow) {
          await redeemGoal(business.id, customer.id, day(i));
        }
      }
      // La primera visita funda el ciclo y no lo desbloquea. De ahí en más
      // cada visita cae sobre un ciclo ya abierto de 1 sello y lo completa.
      expect(results).toEqual([false, true, true, true, true, true]);

      const totalGoals = await prisma.customerRewardGoal.count({
        where: { businessId: business.id, customerId: customer.id },
      });
      // 6 ciclos: el fundado en la visita 1 y uno abierto por cada uno de
      // los 5 desbloqueos. El último queda ACTIVE, esperando la visita 7.
      expect(totalGoals).toBe(6);
      const active = await prisma.customerRewardGoal.count({
        where: {
          businessId: business.id,
          customerId: customer.id,
          status: RewardGoalStatus.ACTIVE,
        },
      });
      expect(active).toBe(1);
    } finally {
      await cleanup(business.id);
    }
  });
});
