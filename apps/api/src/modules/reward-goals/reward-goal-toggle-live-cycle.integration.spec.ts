import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { BenefitType, RewardGoalStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RetentionDecisionLogService } from '../retention-v2/retention-decision-log.service';
import { RewardGoalEngineService } from './reward-goal-engine.service';
import { RewardGoalIssuerService } from './reward-goal-issuer.service';
import { RewardGoalUnlockService } from './reward-goal-unlock.service';
import { RewardGoalOrchestratorService } from './reward-goal-orchestrator.service';
import { CustomerLoyaltyRepository } from '../customers/loyalty/customer-loyalty.repository';
import { CustomerOverviewService } from '../customers/loyalty/customer-overview.service';
import { PlansService } from '../plans/plans.service';
import { PlansRepository } from '../plans/plans.repository';
import {
  createTestBusiness,
  makeTestSuffix,
} from '../reviews/reviews.test-helpers';

/**
 * Auditoría end-to-end previa a deploy (§0) — el caso puntual que la política
 * aprobada tiene que sostener en código real, no solo en un mock:
 *
 *   negocio con tarjeta activa → cliente con CustomerRewardGoal ACTIVE en
 *   curso (4/5) → el dueño apaga sellos → ¿qué pasa con ESE ciclo?
 *
 * La política: no crear ciclos nuevos, apagar el recordatorio de progreso,
 * pero HONRAR el ciclo que ya estaba en curso hasta que se cierre solo.
 *
 * Las piezas sueltas ya estaban cada una probada por separado (el kill
 * switch del engine, la traducción a "Programa: desactivado", el gate de
 * progressReminderEnabled en Retention V2 recruitment/send/dispatch). Lo que
 * faltaba — y es lo que este archivo agrega — es la cadena real conectada:
 * el mismo ciclo, visto desde el cliente público (`currentView`, lo que pega
 * `GET /me`) y desde el dashboard (`CustomerOverviewService`, lo que pega el
 * modal de Clientes), sobreviviendo al apagado y terminando bien, sin que
 * nazca un ciclo nuevo después.
 *
 * Retention V2 (recluta/envía recordatorios de progreso) no se reconstruye
 * acá con su propio grafo de dependencias — ya tiene cobertura unitaria
 * directa y suficiente para esta misma pregunta:
 *   - retention-v2-evaluate.service.spec.ts → "no recluta progreso si el
 *     dueño apagó ESE recordatorio, aunque la reactivación siga prendida"
 *   - retention-v2-message-dispatch.service.spec.ts → dispatch rechaza un
 *     mensaje de progreso con `progressReminderEnabled: false`
 * Los dos leen el mismo campo (`RetentionSettings.progressReminderEnabled`)
 * que este archivo apaga más abajo.
 */
describe('Reward Goals — sellos OFF con un ciclo vivo (integration)', () => {
  let prisma: PrismaService;
  let orchestrator: RewardGoalOrchestratorService;
  let overviewService: CustomerOverviewService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        RetentionDecisionLogService,
        RewardGoalEngineService,
        RewardGoalIssuerService,
        RewardGoalUnlockService,
        RewardGoalOrchestratorService,
        CustomerLoyaltyRepository,
        CustomerOverviewService,
        PlansService,
        PlansRepository,
      ],
    }).compile();

    prisma = module.get(PrismaService);
    orchestrator = module.get(RewardGoalOrchestratorService);
    overviewService = module.get(CustomerOverviewService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function setupBusiness() {
    const suffix = makeTestSuffix();
    const business = await createTestBusiness(prisma, `rg-toggle-${suffix}`);
    const customer = await prisma.customer.create({
      data: {
        id: randomUUID(),
        businessId: business.id,
        name: `Cliente ${suffix}`,
        phoneE164: `+59891${suffix.slice(0, 6)}`,
      },
    });
    await prisma.retentionIncentiveDefinition.create({
      data: {
        businessId: business.id,
        name: 'Café gratis',
        type: BenefitType.gift,
        active: true,
        rewardGoalEligible: true,
      },
    });
    await prisma.retentionSettings.create({
      data: {
        businessId: business.id,
        rewardGoalsEnabled: true,
        progressReminderEnabled: true,
        // Fijo en 5, sin importar el segmento — para que el test controle
        // exactamente cuántas visitas hacen falta.
        rewardGoalMinVisits: 5,
        rewardGoalMaxVisits: 5,
      },
    });
    return { business, customer };
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

  const baseNow = Date.now();
  const daysFrom = (n: number) => new Date(baseNow + n * 86_400_000);

  /** Igual patrón que reward-goal-multi-visit.integration.spec.ts. */
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
    return result;
  }

  it('un ciclo ACTIVE en 4/5 sobrevive a que el dueño apague sellos: cliente, dashboard, engine y cierre', async () => {
    const { business, customer } = await setupBusiness();
    try {
      // Cuatro visitas: la primera crea el ciclo (0/5), las tres siguientes
      // lo llevan a 3/5. Cooldown por defecto no importa acá (nunca se cierra).
      await visitOn(business.id, customer.id, daysFrom(0));
      await visitOn(business.id, customer.id, daysFrom(1));
      await visitOn(business.id, customer.id, daysFrom(2));
      const v4 = await visitOn(business.id, customer.id, daysFrom(3));
      expect(v4.goal).toMatchObject({
        progressVisits: 3,
        targetAdditionalVisits: 5,
      });

      // El dueño apaga sellos — exactamente lo que
      // LoyaltyProgramService.setStampsCardEnabled(false) hace (ya probado
      // ahí a nivel unitario: apaga los dos flags, nunca toca la recompensa
      // ni el ciclo). Se replica acá el efecto, no el wrapper.
      await prisma.retentionSettings.update({
        where: { businessId: business.id },
        data: { rewardGoalsEnabled: false, progressReminderEnabled: false },
      });

      // ── CUSTOMER PUBLIC: el cliente sigue viendo su progreso/promesa ──
      const publicView = await orchestrator.currentView(
        business.id,
        customer.id,
      );
      expect(publicView.goal).toMatchObject({
        incentiveName: 'Café gratis',
        progressVisits: 3,
        targetAdditionalVisits: 5,
        remainingVisits: 2,
      });

      // ── DASHBOARD CLIENTES: el modal sigue mostrando la tarjeta viva ──
      const dashboardOverview = await overviewService.overview(
        business.id,
        customer.id,
        undefined,
        daysFrom(3),
      );
      expect(dashboardOverview.currentCard).toMatchObject({
        state: 'en_progreso',
        rewardName: 'Café gratis',
        progressVisits: 3,
        targetAdditionalVisits: 5,
      });

      // ── PROGRAMA: la fuente de verdad que lee `getOverview` ya está en
      // `false` (la traducción a "Programa: desactivado" está probada aparte
      // en loyalty-program.service.spec.ts — acá se confirma el dato real
      // que esa traducción consume). ──
      const settingsNow = await prisma.retentionSettings.findUniqueOrThrow({
        where: { businessId: business.id },
      });
      expect(settingsNow.rewardGoalsEnabled).toBe(false);
      expect(settingsNow.progressReminderEnabled).toBe(false);

      // Una visita más NO crea sello donde no correspondería, sigue sumando
      // progreso normal al ciclo YA vivo — dos visitas más completan 5/5.
      await visitOn(business.id, customer.id, daysFrom(4));
      const v6 = await visitOn(business.id, customer.id, daysFrom(5));

      // El ciclo se HONRA hasta el final — un cliente a mitad de tarjeta no
      // pierde su promesa solo porque el dueño apagó sellos para los que
      // vengan después.
      expect(v6.unlockedNow).toBe(true);
      expect(v6.benefit?.name).toBe('Café gratis');

      const closedGoal = await prisma.customerRewardGoal.findFirst({
        where: { businessId: business.id, customerId: customer.id },
        orderBy: { createdAt: 'desc' },
      });
      expect(closedGoal?.status).toBe(RewardGoalStatus.UNLOCKED);
      expect(closedGoal?.benefitParticipationId).not.toBeNull();

      // ── Después de completar el ciclo: NO nace uno nuevo mientras sellos
      // siga OFF, sin importar cuántas visitas más haga. ──
      const v7 = await visitOn(business.id, customer.id, daysFrom(20));
      expect(v7).toEqual({ goal: null, unlockedNow: false, benefit: null });

      const totalGoals = await prisma.customerRewardGoal.count({
        where: { businessId: business.id, customerId: customer.id },
      });
      expect(totalGoals).toBe(1); // el mismo de siempre — ninguno nuevo.

      // Y el dashboard/cliente público ya no tienen nada "en curso" que
      // mostrar (la tarjeta pasó a historial, no queda un hueco vivo).
      const publicViewAfter = await orchestrator.currentView(
        business.id,
        customer.id,
      );
      expect(publicViewAfter.goal).toBeNull();
    } finally {
      await cleanup(business.id);
    }
  });

  it('un cliente que NUNCA tuvo un ciclo no ve ninguna tarjeta mientras sellos está OFF', async () => {
    const { business, customer } = await setupBusiness();
    try {
      await prisma.retentionSettings.update({
        where: { businessId: business.id },
        data: { rewardGoalsEnabled: false, progressReminderEnabled: false },
      });

      // Visita real, pero sellos ya estaba OFF desde antes de la primera vez
      // que este cliente pisó el negocio — nunca tuvo ni tendrá un ciclo.
      const result = await visitOn(business.id, customer.id, daysFrom(0));
      expect(result).toEqual({ goal: null, unlockedNow: false, benefit: null });

      const publicView = await orchestrator.currentView(
        business.id,
        customer.id,
      );
      expect(publicView.goal).toBeNull();

      const dashboardOverview = await overviewService.overview(
        business.id,
        customer.id,
        undefined,
        daysFrom(0),
      );
      expect(dashboardOverview.currentCard).toBeNull();
      expect(dashboardOverview.history).toEqual([]);

      const totalGoals = await prisma.customerRewardGoal.count({
        where: { businessId: business.id, customerId: customer.id },
      });
      expect(totalGoals).toBe(0);
    } finally {
      await cleanup(business.id);
    }
  });
});
