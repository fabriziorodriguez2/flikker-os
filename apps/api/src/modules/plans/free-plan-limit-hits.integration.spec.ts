import { randomUUID } from 'crypto';
import {
  BenefitType,
  ExperienceVersion,
  SubscriptionStatus,
} from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { PlansService } from './plans.service';
import { PlansRepository } from './plans.repository';
import { RetentionDecisionLogService } from '../retention-v2/retention-decision-log.service';
import { RewardGoalEngineService } from '../reward-goals/reward-goal-engine.service';

/**
 * El gap que esto cierra, contra Postgres real: el tope del plan Gratis
 * siempre bloqueó bien, pero el dueño no tenía forma de enterarse de que
 * hubo demanda perdida.
 *
 * El hallazgo de la auditoría es que el evento YA se registraba. Cuando
 * `RewardGoalEngineService` frena un alta, su `logDecision` escribe un
 * `RetentionDecisionLog` con `REWARD_GOAL_SKIPPED` y
 * `metadata.reasonCode = 'PARTICIPANT_LIMIT_REACHED'`. No hizo falta tabla
 * nueva ni tocar el check-in: hizo falta leerlo.
 *
 * Lo que se prueba acá es esa cadena completa de punta a punta — que el
 * bloqueo real deja la fila, que la fila se cuenta por PERSONA y no por
 * intento, y que no guarda ni un dato de contacto de nadie.
 */
describe('Tope del plan Gratis — rechazos visibles para el dueño (integration)', () => {
  let prisma: PrismaService;
  let plans: PlansService;
  let engine: RewardGoalEngineService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        PlansService,
        PlansRepository,
        RetentionDecisionLogService,
        RewardGoalEngineService,
      ],
    }).compile();

    prisma = module.get(PrismaService);
    plans = module.get(PlansService);
    engine = module.get(RewardGoalEngineService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  /** Negocio Free con tope chico, sellos prendidos y un premio elegible. */
  async function setup(maxCustomers: number | null) {
    const business = await prisma.business.create({
      data: {
        name: 'Café Tope',
        slug: `free-limit-${randomUUID()}`,
        country: 'UY',
        timezone: 'America/Montevideo',
        currency: 'UYU',
        experienceVersion: ExperienceVersion.CHECKIN_V2,
      },
      select: { id: true },
    });

    const plan = await prisma.plan.create({
      data: {
        slug: `free-test-${randomUUID()}`,
        name: 'Free de prueba',
        maxBranches: 1,
        maxMembers: 2,
        maxCampaigns: 1,
        maxReviewsPerMonth: 20,
        messageQuotaMonthly: 0,
        maxCustomers,
        isActive: true,
      },
      select: { id: true },
    });
    await prisma.subscription.create({
      data: {
        businessId: business.id,
        planId: plan.id,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: new Date('2026-01-01T00:00:00.000Z'),
        currentPeriodEnd: new Date('2030-01-01T00:00:00.000Z'),
      },
    });

    const incentive = await prisma.retentionIncentiveDefinition.create({
      data: {
        businessId: business.id,
        name: 'Café gratis',
        type: BenefitType.gift,
        active: true,
        rewardGoalEligible: true,
      },
      select: { id: true },
    });
    await prisma.retentionSettings.create({
      data: {
        businessId: business.id,
        rewardGoalsEnabled: true,
        rewardGoalCooldownDays: 0,
        rewardGoalMinVisits: 2,
        rewardGoalMaxVisits: 2,
      },
    });

    return { businessId: business.id, planId: plan.id, incentive };
  }

  async function cleanup(businessId: string, planId: string) {
    await prisma.retentionDecisionLog.deleteMany({ where: { businessId } });
    await prisma.customerRewardGoal.deleteMany({ where: { businessId } });
    await prisma.visit.deleteMany({ where: { businessId } });
    await prisma.retentionIncentiveDefinition.deleteMany({
      where: { businessId },
    });
    await prisma.retentionSettings.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.subscription.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.plan.delete({ where: { id: planId } });
  }

  async function makeCustomer(businessId: string, label: string) {
    return prisma.customer.create({
      data: {
        businessId,
        name: `Cliente ${label}`,
        phoneE164: `+5989${Math.floor(1_000_000 + Math.random() * 8_999_999)}`,
      },
      select: { id: true },
    });
  }

  /** El alta que el check-in intenta: `evaluate` con un cliente nuevo. */
  function attemptJoin(businessId: string, customerId: string, now: Date) {
    return engine.evaluate(
      {
        businessId,
        customerId,
        segment: 'NEW',
        visitCount: 1,
        timezone: 'America/Montevideo',
        now,
      },
      { dryRun: false },
    );
  }

  const blockedRows = (businessId: string) =>
    prisma.retentionDecisionLog.findMany({
      where: { businessId, decisionCode: 'REWARD_GOAL_SKIPPED' },
    });

  it('bajo el tope: el alta pasa y no se registra ningún rechazo', async () => {
    const { businessId, planId } = await setup(2);
    try {
      const customer = await makeCustomer(businessId, 'A');
      const decision = await attemptJoin(
        businessId,
        customer.id,
        new Date('2026-09-15T12:00:00.000Z'),
      );

      expect(decision.action).toBe('CREATE_GOAL');
      const rows = await blockedRows(businessId);
      expect(
        rows.filter(
          (r) =>
            (r.metadata as { reasonCode?: string } | null)?.reasonCode ===
            'PARTICIPANT_LIMIT_REACHED',
        ),
      ).toHaveLength(0);

      const usage = await plans.getFreePlanUsage(businessId);
      expect(usage).toMatchObject({
        current: 1,
        limit: 2,
        blockedCustomersLast7Days: 0,
      });
    } finally {
      await cleanup(businessId, planId);
    }
  });

  it('en el tope: el alta nueva se rechaza Y queda registrada', async () => {
    const { businessId, planId } = await setup(1);
    try {
      const first = await makeCustomer(businessId, 'A');
      await attemptJoin(
        businessId,
        first.id,
        new Date('2026-09-15T12:00:00.000Z'),
      );

      const second = await makeCustomer(businessId, 'B');
      const decision = await attemptJoin(
        businessId,
        second.id,
        new Date('2026-09-16T12:00:00.000Z'),
      );

      expect(decision).toMatchObject({
        action: 'NO_GOAL',
        reasonCode: 'PARTICIPANT_LIMIT_REACHED',
      });

      const usage = await plans.getFreePlanUsage(businessId);
      expect(usage).toMatchObject({
        current: 1,
        limit: 1,
        blockedCustomersLast7Days: 1,
        blockedCustomersThisMonth: 1,
      });
    } finally {
      await cleanup(businessId, planId);
    }
  });

  /*
    La razón por la que la UI puede decir "personas" y no el vago
    "intentos": la fila ya trae el `customerId` real, así que la misma
    persona rebotando muchas veces cuenta una sola.
  */
  it('cuenta PERSONAS, no intentos: el mismo cliente bloqueado 3 veces cuenta 1', async () => {
    const { businessId, planId } = await setup(1);
    try {
      const first = await makeCustomer(businessId, 'A');
      await attemptJoin(
        businessId,
        first.id,
        new Date('2026-09-15T12:00:00.000Z'),
      );

      const insistent = await makeCustomer(businessId, 'B');
      for (const day of ['15', '16', '17']) {
        await attemptJoin(
          businessId,
          insistent.id,
          new Date(`2026-09-${day}T18:00:00.000Z`),
        );
      }
      const other = await makeCustomer(businessId, 'C');
      await attemptJoin(
        businessId,
        other.id,
        new Date('2026-09-17T19:00:00.000Z'),
      );

      // 4 filas de rechazo, 2 personas.
      const rows = (await blockedRows(businessId)).filter(
        (r) =>
          (r.metadata as { reasonCode?: string } | null)?.reasonCode ===
          'PARTICIPANT_LIMIT_REACHED',
      );
      expect(rows).toHaveLength(4);

      const usage = await plans.getFreePlanUsage(businessId);
      expect(usage?.blockedCustomersThisMonth).toBe(2);
    } finally {
      await cleanup(businessId, planId);
    }
  });

  it('un participante que YA estaba nunca produce un rechazo falso', async () => {
    const { businessId, planId } = await setup(1);
    try {
      const customer = await makeCustomer(businessId, 'A');
      await attemptJoin(
        businessId,
        customer.id,
        new Date('2026-09-15T12:00:00.000Z'),
      );

      // Mismo cliente, negocio ya en el tope: sigue siendo participante, así
      // que el tope no le aplica. Su goal ACTIVE es lo que lo frena, y ese
      // caso a propósito no se registra.
      const again = await attemptJoin(
        businessId,
        customer.id,
        new Date('2026-09-16T12:00:00.000Z'),
      );
      expect(again.reasonCode).not.toBe('PARTICIPANT_LIMIT_REACHED');

      const usage = await plans.getFreePlanUsage(businessId);
      expect(usage?.blockedCustomersThisMonth).toBe(0);
    } finally {
      await cleanup(businessId, planId);
    }
  });

  it('Pro (sin tope): nunca rechaza ni registra, y no hay uso que mostrar', async () => {
    const { businessId, planId } = await setup(null);
    try {
      for (const label of ['A', 'B', 'C']) {
        const customer = await makeCustomer(businessId, label);
        const decision = await attemptJoin(
          businessId,
          customer.id,
          new Date('2026-09-15T12:00:00.000Z'),
        );
        expect(decision.action).toBe('CREATE_GOAL');
      }

      expect(await plans.getFreePlanUsage(businessId)).toBeNull();
    } finally {
      await cleanup(businessId, planId);
    }
  });

  /*
    §8: actualizar el plan apaga el aviso, pero NO borra el historial. El
    read-model devuelve `null` porque ya no aplica; las filas de rechazo
    siguen en la base.
  */
  it('al pasar a Pro el aviso desaparece, pero el historial de rechazos queda', async () => {
    const { businessId, planId } = await setup(1);
    try {
      const first = await makeCustomer(businessId, 'A');
      await attemptJoin(
        businessId,
        first.id,
        new Date('2026-09-15T12:00:00.000Z'),
      );
      const blocked = await makeCustomer(businessId, 'B');
      await attemptJoin(
        businessId,
        blocked.id,
        new Date('2026-09-16T12:00:00.000Z'),
      );
      expect(
        (await plans.getFreePlanUsage(businessId))?.blockedCustomersThisMonth,
      ).toBe(1);

      const pro = await plans.ensureProSelfServicePlan();
      await prisma.subscription.update({
        where: { businessId },
        data: { planId: pro.id, status: SubscriptionStatus.ACTIVE },
      });

      expect(await plans.getFreePlanUsage(businessId)).toBeNull();
      // Las filas siguen ahí — nada se borra por actualizar el plan.
      const rows = (await blockedRows(businessId)).filter(
        (r) =>
          (r.metadata as { reasonCode?: string } | null)?.reasonCode ===
          'PARTICIPANT_LIMIT_REACHED',
      );
      expect(rows).toHaveLength(1);

      await prisma.subscription.update({
        where: { businessId },
        data: { planId },
      });
    } finally {
      await cleanup(businessId, planId);
    }
  });

  /*
    El registro no puede convertirse en un side-channel de datos de
    contacto. La fila guarda businessId, customerId, código y timestamp —
    y nada más.
  */
  it('el registro no guarda PII: ni teléfono, ni nombre, ni IP', async () => {
    const { businessId, planId } = await setup(1);
    try {
      const first = await makeCustomer(businessId, 'A');
      await attemptJoin(
        businessId,
        first.id,
        new Date('2026-09-15T12:00:00.000Z'),
      );
      const blocked = await prisma.customer.create({
        data: {
          businessId,
          name: 'Ramona Iglesias',
          phoneE164: '+59899123456',
        },
        select: { id: true },
      });
      await attemptJoin(
        businessId,
        blocked.id,
        new Date('2026-09-16T12:00:00.000Z'),
      );

      const row = (await blockedRows(businessId)).find(
        (r) =>
          (r.metadata as { reasonCode?: string } | null)?.reasonCode ===
          'PARTICIPANT_LIMIT_REACHED',
      );
      expect(row).toBeDefined();

      const serialized = JSON.stringify(row);
      expect(serialized).not.toContain('Ramona');
      expect(serialized).not.toContain('99123456');
      // El metadata solo lleva el motivo y el segmento — nada identificante.
      expect(Object.keys(row!.metadata as object).sort()).toEqual([
        'reasonCode',
        'segment',
      ]);
    } finally {
      await cleanup(businessId, planId);
    }
  });
});
