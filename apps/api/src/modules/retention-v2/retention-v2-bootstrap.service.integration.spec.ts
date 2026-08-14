import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
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
import { RetentionSettingsService } from './retention-settings.service';
import { RetentionExperimentsAdminService } from './retention-experiments-admin.service';
import { RetentionV2BootstrapService } from './retention-v2-bootstrap.service';

/**
 * The self-service bootstrap against real Postgres.
 *
 * Mocking Prisma here would mean re-implementing the transaction/advisory
 * lock plumbing in the mock, which is exactly the part most worth testing
 * for real — this is the one place idempotency and concurrency actually
 * have to hold.
 */
describe('RetentionV2BootstrapService (integration)', () => {
  let prisma: PrismaService;
  let bootstrap: RetentionV2BootstrapService;
  let admin: RetentionExperimentsAdminService;

  const businesses: string[] = [];

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        RetentionSettingsService,
        RetentionExperimentsAdminService,
        RetentionV2BootstrapService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    bootstrap = moduleRef.get(RetentionV2BootstrapService);
    admin = moduleRef.get(RetentionExperimentsAdminService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    for (const id of businesses.splice(0)) {
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
      await prisma.benefit.deleteMany({ where: { businessId: id } });
      await prisma.retentionSettings.deleteMany({ where: { businessId: id } });
      await prisma.business.delete({ where: { id } }).catch(() => undefined);
    }
  });

  async function makeBusiness(
    options: {
      automaticCampaignsEnabled?: boolean;
      progressReminderEnabled?: boolean;
      rewardGoalsEnabled?: boolean;
      engineEnabled?: boolean;
      legacy?: boolean;
    } = {},
  ) {
    const business = await prisma.business.create({
      data: {
        id: randomUUID(),
        name: 'Café Bootstrap',
        slug: `boot-${randomUUID().slice(0, 8)}`,
        status: BusinessStatus.ACTIVE,
        country: 'UY',
        currency: 'UYU',
        timezone: 'America/Montevideo',
        experienceVersion: options.legacy
          ? ExperienceVersion.LEGACY
          : ExperienceVersion.CHECKIN_V2,
        retentionEngineV2Enabled: options.engineEnabled ?? true,
      },
    });
    businesses.push(business.id);
    await prisma.retentionSettings.create({
      data: {
        businessId: business.id,
        automaticCampaignsEnabled: options.automaticCampaignsEnabled ?? true,
        progressReminderEnabled: options.progressReminderEnabled ?? false,
        rewardGoalsEnabled: options.rewardGoalsEnabled ?? false,
      },
    });
    return business.id;
  }

  async function makeAuthorizedBenefit(businessId: string, name: string) {
    const benefit = await prisma.benefit.create({
      data: { businessId, title: name, type: BenefitType.gift, active: false },
    });
    return prisma.retentionIncentiveDefinition.create({
      data: {
        businessId,
        benefitId: benefit.id,
        name,
        type: BenefitType.gift,
        active: true,
        automationEligible: true,
      },
    });
  }

  const runningExperiments = (
    businessId: string,
    objective?: RetentionObjective,
  ) =>
    prisma.retentionExperiment.findMany({
      where: {
        businessId,
        status: RetentionExperimentStatus.RUNNING,
        ...(objective ? { objective } : {}),
      },
      include: { variants: true },
    });

  // ── §3/§4 — bootstrap crea la infraestructura mínima ──────────────────

  describe('Te extrañamos — recovery', () => {
    it('crea CONTROL + REMINDER para los tres objetivos de recuperación', async () => {
      const businessId = await makeBusiness();

      const results = await bootstrap.ensureDefaultRetentionSetup(businessId);

      expect(results.map((r) => r.objective).sort()).toEqual(
        [
          RetentionObjective.SECOND_VISIT,
          RetentionObjective.AT_RISK_RECOVERY,
          RetentionObjective.INACTIVE_RECOVERY,
        ].sort(),
      );
      expect(results.every((r) => r.action === 'created')).toBe(true);

      for (const objective of [
        RetentionObjective.SECOND_VISIT,
        RetentionObjective.AT_RISK_RECOVERY,
        RetentionObjective.INACTIVE_RECOVERY,
      ]) {
        const running = await runningExperiments(businessId, objective);
        expect(running).toHaveLength(1);
        expect(running[0].variants.map((v) => v.strategyType).sort()).toEqual(
          [
            RetentionStrategyType.CONTROL,
            RetentionStrategyType.REMINDER,
          ].sort(),
        );
        expect(running[0].managedBySelfService).toBe(true);
      }
    });

    it('no crea NADA si "Te extrañamos" está apagado', async () => {
      const businessId = await makeBusiness({
        automaticCampaignsEnabled: false,
      });

      await bootstrap.ensureDefaultRetentionSetup(businessId);

      expect(
        await prisma.retentionExperiment.count({ where: { businessId } }),
      ).toBe(0);
    });

    it('LEGACY nunca recibe infraestructura V2', async () => {
      const businessId = await makeBusiness({ legacy: true });

      await bootstrap.ensureDefaultRetentionSetup(businessId);

      expect(
        await prisma.retentionExperiment.count({ where: { businessId } }),
      ).toBe(0);
    });
  });

  // ── §8 — Cerca del premio ──────────────────────────────────────────────

  describe('Cerca del premio — progress', () => {
    it('sin sellos activos, NO crea infraestructura de progreso aunque el toggle esté ON', async () => {
      const businessId = await makeBusiness({
        automaticCampaignsEnabled: false,
        progressReminderEnabled: true,
        rewardGoalsEnabled: false, // sellos OFF
      });

      await bootstrap.ensureDefaultRetentionSetup(businessId);

      expect(
        await prisma.retentionExperiment.count({
          where: {
            businessId,
            objective: RetentionObjective.REWARD_GOAL_PROGRESS,
          },
        }),
      ).toBe(0);
    });

    it('con sellos activos y el toggle ON, crea CONTROL + PROGRESS_REMINDER', async () => {
      const businessId = await makeBusiness({
        automaticCampaignsEnabled: false,
        progressReminderEnabled: true,
        rewardGoalsEnabled: true,
      });

      await bootstrap.ensureDefaultRetentionSetup(businessId);

      const running = await runningExperiments(
        businessId,
        RetentionObjective.REWARD_GOAL_PROGRESS,
      );
      expect(running).toHaveLength(1);
      expect(running[0].variants.map((v) => v.strategyType).sort()).toEqual(
        [
          RetentionStrategyType.CONTROL,
          RetentionStrategyType.PROGRESS_REMINDER,
        ].sort(),
      );
    });
  });

  // ── §22 — idempotencia ──────────────────────────────────────────────────

  describe('idempotencia', () => {
    it('llamar 10 veces seguidas deja exactamente la misma cantidad de experiments/variants', async () => {
      const businessId = await makeBusiness();

      for (let i = 0; i < 10; i++) {
        await bootstrap.ensureDefaultRetentionSetup(businessId);
      }

      expect(
        await prisma.retentionExperiment.count({ where: { businessId } }),
      ).toBe(
        3, // uno por objetivo de recuperación
      );
      expect(
        await prisma.retentionVariant.count({ where: { businessId } }),
      ).toBe(
        6, // CONTROL + REMINDER por cada uno de los 3
      );
    });

    it('la segunda llamada reporta "already_correct", no crea de nuevo', async () => {
      const businessId = await makeBusiness({
        automaticCampaignsEnabled: false,
        progressReminderEnabled: true,
        rewardGoalsEnabled: true,
      });

      await bootstrap.ensureDefaultRetentionSetup(businessId);
      const second = await bootstrap.ensureDefaultRetentionSetup(businessId);

      expect(second).toEqual([
        expect.objectContaining({
          objective: RetentionObjective.REWARD_GOAL_PROGRESS,
          action: 'already_correct',
        }),
      ]);
    });

    it('concurrencia: 5 llamadas en paralelo dejan un solo experiment RUNNING por objetivo', async () => {
      const businessId = await makeBusiness();

      await Promise.all(
        Array.from({ length: 5 }, () =>
          bootstrap.ensureDefaultRetentionSetup(businessId),
        ),
      );

      for (const objective of [
        RetentionObjective.SECOND_VISIT,
        RetentionObjective.AT_RISK_RECOVERY,
        RetentionObjective.INACTIVE_RECOVERY,
      ]) {
        const running = await runningExperiments(businessId, objective);
        expect(running).toHaveLength(1);
      }
    });
  });

  // ── §6/§7 — beneficios agregados/quitados después ────────────────────────

  describe('generaciones — beneficios cambian después de day 1', () => {
    /**
     * §14 (fase de presupuesto) — el límite mensual no es parte de la forma
     * del experiment (`computeDesiredVariants` ni siquiera lo recibe), así
     * que cambiarlo solo no puede disparar una generación nueva.
     */
    it('cambiar SOLO el límite mensual de beneficios no recrea la generación', async () => {
      const businessId = await makeBusiness();
      await bootstrap.ensureDefaultRetentionSetup(businessId);
      const [before] = await runningExperiments(
        businessId,
        RetentionObjective.AT_RISK_RECOVERY,
      );

      await prisma.retentionSettings.update({
        where: { businessId },
        data: { maxAutomatedIncentivesPerMonth: 10 },
      });
      const results = await bootstrap.ensureDefaultRetentionSetup(businessId);

      const atRisk = results.find(
        (r) => r.objective === RetentionObjective.AT_RISK_RECOVERY,
      );
      expect(atRisk?.action).toBe('already_correct');

      const [after] = await runningExperiments(
        businessId,
        RetentionObjective.AT_RISK_RECOVERY,
      );
      expect(after.id).toBe(before.id); // el MISMO experiment, no uno nuevo
    });

    it('autorizar un beneficio reemplaza la generación sin borrar la anterior', async () => {
      const businessId = await makeBusiness();
      await bootstrap.ensureDefaultRetentionSetup(businessId);
      const [before] = await runningExperiments(
        businessId,
        RetentionObjective.AT_RISK_RECOVERY,
      );

      const benefit = await makeAuthorizedBenefit(businessId, '10% descuento');
      const results = await bootstrap.ensureDefaultRetentionSetup(businessId);

      const atRisk = results.find(
        (r) => r.objective === RetentionObjective.AT_RISK_RECOVERY,
      );
      expect(atRisk?.action).toBe('replaced_generation');

      // La vieja generación sigue existiendo, ahora COMPLETED — no se borró.
      const oldExperiment = await prisma.retentionExperiment.findUniqueOrThrow({
        where: { id: before.id },
      });
      expect(oldExperiment.status).toBe(RetentionExperimentStatus.COMPLETED);

      // La nueva generación tiene el beneficio.
      const [after] = await runningExperiments(
        businessId,
        RetentionObjective.AT_RISK_RECOVERY,
      );
      expect(
        after.variants.some(
          (v) =>
            v.strategyType === RetentionStrategyType.SOFT_BENEFIT &&
            v.incentiveDefinitionId === benefit.id,
        ),
      ).toBe(true);
      // El recordatorio sin beneficio sigue siendo una opción real.
      expect(
        after.variants.some(
          (v) => v.strategyType === RetentionStrategyType.REMINDER,
        ),
      ).toBe(true);
    });

    it('un assignment histórico de la generación vieja no se toca ni se borra', async () => {
      const businessId = await makeBusiness();
      await bootstrap.ensureDefaultRetentionSetup(businessId);
      const [oldExperiment] = await runningExperiments(
        businessId,
        RetentionObjective.AT_RISK_RECOVERY,
      );
      const control = oldExperiment.variants.find(
        (v) => v.strategyType === RetentionStrategyType.CONTROL,
      )!;
      const customer = await prisma.customer.create({
        data: {
          businessId,
          name: 'Cliente Viejo',
          phoneE164: `+5989${String(Date.now()).slice(-7)}`,
        },
      });
      const assignment = await prisma.retentionAssignment.create({
        data: {
          experimentId: oldExperiment.id,
          variantId: control.id,
          businessId,
          customerId: customer.id,
          segmentAtAssignment: CustomerSegment.AT_RISK,
          visitCountAtAssignment: 1,
          daysSinceLastVisit: 20,
        },
      });

      await makeAuthorizedBenefit(businessId, 'Café gratis');
      await bootstrap.ensureDefaultRetentionSetup(businessId);

      const stillThere = await prisma.retentionAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
      });
      expect(stillThere.experimentId).toBe(oldExperiment.id); // intacto
    });

    it('desautorizar un beneficio también dispara una nueva generación (sin el arm)', async () => {
      const businessId = await makeBusiness();
      const benefit = await makeAuthorizedBenefit(
        businessId,
        'Cappuccino gratis',
      );
      await bootstrap.ensureDefaultRetentionSetup(businessId);

      await prisma.retentionIncentiveDefinition.update({
        where: { id: benefit.id },
        data: { automationEligible: false },
      });
      await bootstrap.ensureDefaultRetentionSetup(businessId);

      const [after] = await runningExperiments(
        businessId,
        RetentionObjective.AT_RISK_RECOVERY,
      );
      expect(
        after.variants.some(
          (v) => v.strategyType === RetentionStrategyType.SOFT_BENEFIT,
        ),
      ).toBe(false);
    });
  });

  // ── §15 — Platform Admin ────────────────────────────────────────────────

  describe('Platform Admin', () => {
    it('nunca reemplaza ni compite con un experiment administrado a mano', async () => {
      const businessId = await makeBusiness();
      const manual = await admin.create(businessId, {
        name: 'Campaña especial de Platform Admin',
        objective: RetentionObjective.AT_RISK_RECOVERY,
      });
      await admin.addVariant(businessId, manual.id, {
        name: 'Control',
        strategyType: RetentionStrategyType.CONTROL,
        allocationPercent: 20,
      });
      await admin.addVariant(businessId, manual.id, {
        name: 'Recordatorio fuerte',
        strategyType: RetentionStrategyType.REMINDER,
        allocationPercent: 80,
      });
      await admin.start(businessId, manual.id);

      const results = await bootstrap.ensureDefaultRetentionSetup(businessId);

      const atRisk = results.find(
        (r) => r.objective === RetentionObjective.AT_RISK_RECOVERY,
      );
      expect(atRisk?.action).toBe('left_platform_admin_managed');

      // Sigue siendo el ÚNICO experiment RUNNING para ese objetivo — el
      // bootstrap no creó uno propio al lado.
      const running = await runningExperiments(
        businessId,
        RetentionObjective.AT_RISK_RECOVERY,
      );
      expect(running).toHaveLength(1);
      expect(running[0].id).toBe(manual.id);
      expect(running[0].managedBySelfService).toBe(false);
    });
  });
});
