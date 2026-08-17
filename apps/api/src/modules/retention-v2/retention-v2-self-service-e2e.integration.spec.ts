import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BenefitType,
  CustomerSegment,
  RetentionStrategyType,
  RewardGoalStatus,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { OnboardingService } from '../onboarding/onboarding.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { RetentionV2EvaluateService } from './retention-v2-evaluate.service';
import { RetentionV2SendService } from './retention-v2-send.service';
import { RetentionV2MessageDispatchService } from './retention-v2-message-dispatch.service';
import { RetentionV2BootstrapService } from './retention-v2-bootstrap.service';
import { pickVariant, type AllocatableVariant } from './allocation';

// Wednesday, 14:00 in America/Montevideo (UTC-3 year-round, no DST) — well
// inside the default sending window (10:00-20:00, Mon-Sat) regardless of
// when this suite actually runs. Every step below is passed this same `now`
// explicitly, so the whole chain is deterministic instead of depending on
// the wall clock at test time.
const NOW = new Date('2026-06-10T14:00:00-03:00');
const daysBefore = (days: number) =>
  new Date(NOW.getTime() - days * 86_400_000);
const dayKey = (date: Date) => date.toISOString().slice(0, 10);

/**
 * The chain this whole phase exists to prove: a self-service business, set
 * up through nothing but the real onboarding flow, ends up with a WhatsApp
 * message genuinely leaving the building — with no `RetentionExperiment`
 * ever created by hand in this file. If that line changes, self-service is
 * broken again no matter what any unit test says.
 *
 * Only `WhatsAppBspService` is mocked. Everything else — onboarding,
 * bootstrap, evaluate, send, dispatch, Prisma — is the real thing, against
 * real Postgres.
 */
describe('Retention V2 self-service — onboarding to WhatsApp (e2e)', () => {
  let prisma: PrismaService;
  let onboarding: OnboardingService;
  let evaluateService: RetentionV2EvaluateService;
  let sendService: RetentionV2SendService;
  let dispatchService: RetentionV2MessageDispatchService;
  let bootstrap: RetentionV2BootstrapService;
  let whatsApp: { sendText: jest.Mock; isChannelAvailable: jest.Mock };
  let userId: string;
  const ORIGINAL_WHAPI_TOKEN = process.env.WHAPI_TOKEN;

  beforeAll(async () => {
    process.env.WHAPI_TOKEN = 'test-token'; // channel must read as available
    whatsApp = {
      sendText: jest.fn().mockResolvedValue({ whatsappMessageId: 'wa-e2e-1' }),
      isChannelAvailable: jest.fn().mockResolvedValue(true),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [OnboardingModule],
    })
      .overrideProvider(WhatsAppBspService)
      .useValue(whatsApp)
      .compile();

    prisma = moduleRef.get(PrismaService);
    onboarding = moduleRef.get(OnboardingService);
    evaluateService = moduleRef.get(RetentionV2EvaluateService);
    sendService = moduleRef.get(RetentionV2SendService);
    dispatchService = moduleRef.get(RetentionV2MessageDispatchService);
    bootstrap = moduleRef.get(RetentionV2BootstrapService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    process.env.WHAPI_TOKEN = ORIGINAL_WHAPI_TOKEN;
  });

  beforeEach(async () => {
    whatsApp.sendText.mockClear();
    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: `e2e-${randomUUID().slice(0, 8)}@test.local`,
        passwordHash: 'x',
        firstName: 'Dueño',
        lastName: 'E2E',
      },
    });
    userId = user.id;
  });

  afterEach(async () => {
    const businesses = await prisma.business.findMany({
      where: { memberships: { some: { userId } } },
      select: { id: true },
    });
    for (const { id } of businesses) {
      await prisma.message.deleteMany({ where: { businessId: id } });
      await prisma.retentionAssignment.deleteMany({
        where: { businessId: id },
      });
      await prisma.customerRewardGoal.deleteMany({ where: { businessId: id } });
      await prisma.benefitParticipation.deleteMany({
        where: { businessId: id },
      });
      await prisma.retentionVariant.deleteMany({ where: { businessId: id } });
      await prisma.retentionExperiment.deleteMany({
        where: { businessId: id },
      });
      await prisma.retentionIncentiveDefinition.deleteMany({
        where: { businessId: id },
      });
      await prisma.visit.deleteMany({ where: { businessId: id } });
      await prisma.customer.deleteMany({ where: { businessId: id } });
      await prisma.visitSource.deleteMany({ where: { businessId: id } });
      await prisma.benefit.deleteMany({ where: { businessId: id } });
      await prisma.retentionSettings.deleteMany({ where: { businessId: id } });
      await prisma.membership.deleteMany({ where: { businessId: id } });
      await prisma.business.delete({ where: { id } }).catch(() => undefined);
    }
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  });

  /** §18/§19 — beneficios-only onboarding, exactly the self-service path. */
  async function onboardSelfServiceBusiness(): Promise<string> {
    await onboarding.saveBusiness(userId, {
      name: 'Café Self-Service',
      category: 'cafeteria',
    });
    await onboarding.saveBenefitsOnlyProgram(userId, { benefits: [] });
    const { businessId } = await onboarding.complete(userId);
    return businessId;
  }

  /** A customer whose one visit is old enough to read as INACTIVE. */
  async function makeInactiveCustomer(businessId: string, id: string) {
    await prisma.customer.create({
      data: {
        id,
        businessId,
        name: 'Cliente Viejo',
        phoneE164: `+5989${String(Date.now() + Math.random())
          .replace('.', '')
          .slice(-7)}`,
      },
    });
    await prisma.visit.create({
      data: {
        businessId,
        customerId: id,
        occurredAt: daysBefore(90),
        visitDayKey: dayKey(daysBefore(90)),
        verificationType: 'persistent_session',
      },
    });
  }

  /**
   * The allocation is a stable hash of (experimentId, customerId) — see
   * `allocation.ts`. Rather than asserting on a coin flip, this finds a real
   * customer id that lands in the exact arm the test needs, using the same
   * pure function the engine itself uses. Nothing about the allocation
   * logic is touched or special-cased for tests.
   */
  function findCustomerIdForStrategy(
    experimentId: string,
    variants: AllocatableVariant[],
    strategyType: RetentionStrategyType,
    exclude: string[] = [],
  ): string {
    const excluded = new Set(exclude);
    for (let i = 0; i < 2000; i++) {
      const candidate = randomUUID();
      if (excluded.has(candidate)) continue;
      const picked = pickVariant(experimentId, candidate, variants);
      if (picked?.strategyType === strategyType) return candidate;
    }
    throw new Error(
      `Could not find a customer id landing in ${strategyType} after 2000 tries`,
    );
  }

  async function runningExperiment(businessId: string, objective: string) {
    return prisma.retentionExperiment.findFirstOrThrow({
      where: { businessId, objective: objective as never, status: 'RUNNING' },
      include: { variants: true },
    });
  }

  // ── §18/§19 — reminder-only, zero benefits ─────────────────────────────

  describe('reminder-only (0 beneficios)', () => {
    it('el onboarding deja "Te extrañamos" ON y la infraestructura ya existe — sin crear ningún RetentionExperiment a mano', async () => {
      const businessId = await onboardSelfServiceBusiness();

      const settings = await prisma.retentionSettings.findUniqueOrThrow({
        where: { businessId },
      });
      expect(settings.automaticCampaignsEnabled).toBe(true); // default self-service

      const experiments = await prisma.retentionExperiment.findMany({
        where: { businessId, status: 'RUNNING' },
      });
      expect(experiments).toHaveLength(3); // SECOND_VISIT, AT_RISK_RECOVERY, INACTIVE_RECOVERY
      expect(experiments.every((e) => e.managedBySelfService)).toBe(true);
    });

    it('lleva a un cliente elegible hasta un único envío real de WhatsApp', async () => {
      const businessId = await onboardSelfServiceBusiness();
      const experiment = await runningExperiment(
        businessId,
        'INACTIVE_RECOVERY',
      );
      const customerId = findCustomerIdForStrategy(
        experiment.id,
        experiment.variants,
        RetentionStrategyType.REMINDER,
      );
      await makeInactiveCustomer(businessId, customerId);

      await evaluateService.runDaily(NOW);

      const assignment = await prisma.retentionAssignment.findFirstOrThrow({
        where: { businessId, customerId },
      });
      expect(assignment.status).toBe('PENDING');

      const sendResult = await sendService.processAssignment(
        assignment.id,
        NOW,
      );
      expect(sendResult.status).toBe('sent');
      if (sendResult.status !== 'sent') throw new Error('unreachable');

      const queuedMessage = await prisma.message.findUniqueOrThrow({
        where: { id: sendResult.messageId },
      });
      expect(queuedMessage.status).toBe('queued');
      expect(queuedMessage.body).toBeTruthy(); // §18 — body must be persisted

      const dispatchResult = await dispatchService.dispatch(
        sendResult.messageId,
        NOW,
      );
      expect(dispatchResult).toEqual({
        status: 'sent',
        whatsappMessageId: 'wa-e2e-1',
      });

      expect(whatsApp.sendText).toHaveBeenCalledTimes(1);
      expect(whatsApp.sendText).toHaveBeenCalledWith({
        phone: expect.stringMatching(/^\+/) as unknown as string,
        text: queuedMessage.body,
      });

      const sentMessage = await prisma.message.findUniqueOrThrow({
        where: { id: sendResult.messageId },
      });
      expect(sentMessage.status).toBe('sent');
    });
  });

  // ── §20 — con beneficio autorizado ──────────────────────────────────────

  describe('con beneficio autorizado', () => {
    it('el mensaje usa SOLO el beneficio autorizado, emite un BenefitParticipation real y no duplica el envío', async () => {
      const businessId = await onboardSelfServiceBusiness();
      // A real gap this E2E surfaced (see `## Riesgos`): a benefit-carrying
      // variant issues NOTHING — the whole send just skips, silently — until
      // a monthly budget cap is configured. That is a pre-existing,
      // deliberate safety rule in IncentiveIssuerService/RetentionBudgetService
      // (both caps null reads as "not configured", not "unlimited"), separate
      // from authorizing the benefit itself. Bootstrap does not — and should
      // not — set a financial cap on the owner's behalf, so this fixture sets
      // the cap explicitly, exactly like a real owner would have to.
      await prisma.retentionSettings.update({
        where: { businessId },
        data: { maxAutomatedIncentivesPerMonth: 100 },
      });

      const benefit = await prisma.benefit.create({
        data: {
          businessId,
          title: '10% de descuento',
          type: BenefitType.discount,
          active: false,
        },
      });
      const incentive = await prisma.retentionIncentiveDefinition.create({
        data: {
          businessId,
          benefitId: benefit.id,
          name: '10% de descuento',
          type: BenefitType.discount,
          percentageValue: 10,
          active: true,
          automationEligible: true,
        },
      });

      // Same trigger point NotificationsService.updateAutomations uses —
      // no manual experiment editing.
      await bootstrap.ensureDefaultRetentionSetup(businessId);

      const experiment = await runningExperiment(
        businessId,
        'AT_RISK_RECOVERY',
      );
      expect(
        experiment.variants.some(
          (v) =>
            v.strategyType === RetentionStrategyType.SOFT_BENEFIT &&
            v.incentiveDefinitionId === incentive.id,
        ),
      ).toBe(true);

      const customerId = findCustomerIdForStrategy(
        experiment.id,
        experiment.variants,
        RetentionStrategyType.SOFT_BENEFIT,
      );
      await prisma.customer.create({
        data: {
          id: customerId,
          businessId,
          name: 'Cliente Con Beneficio',
          phoneE164: `+5989${String(Date.now() + Math.random())
            .replace('.', '')
            .slice(-7)}`,
        },
      });
      // AT_RISK: one visit, absence within the fallback AT_RISK window.
      await prisma.visit.create({
        data: {
          businessId,
          customerId,
          occurredAt: daysBefore(25),
          visitDayKey: dayKey(daysBefore(25)),
          verificationType: 'persistent_session',
        },
      });

      await evaluateService.runDaily(NOW);
      const assignment = await prisma.retentionAssignment.findFirstOrThrow({
        where: { businessId, customerId },
      });

      const sendResult = await sendService.processAssignment(
        assignment.id,
        NOW,
      );
      expect(sendResult.status).toBe('sent');
      if (sendResult.status !== 'sent') throw new Error('unreachable');
      expect(sendResult.benefitIssued).toBe(true);

      const participation = await prisma.benefitParticipation.findFirstOrThrow({
        where: { businessId, customerId },
      });
      expect(participation.benefitTitleSnapshot).toBe('10% de descuento');

      await dispatchService.dispatch(sendResult.messageId, NOW);
      expect(whatsApp.sendText).toHaveBeenCalledTimes(1);

      // Idempotency — a retried dispatch call must never send twice.
      const retried = await dispatchService.dispatch(sendResult.messageId, NOW);
      expect(retried).toEqual({ status: 'already_processed' });
      expect(whatsApp.sendText).toHaveBeenCalledTimes(1);
    });

    /**
     * §8/§9/§16 — cap alcanzado: la integridad experimental exige un SKIP
     * real, nunca degradar SOFT_BENEFIT a un REMINDER silencioso. Y el
     * brazo REMINDER de ese MISMO experiment sigue mandando sin problema —
     * solo lo que efectivamente necesita presupuesto pasa por el guard.
     */
    it('cap alcanzado: el segundo beneficio se SALTEA (nunca degrada a reminder), y REMINDER sigue funcionando', async () => {
      const businessId = await onboardSelfServiceBusiness();
      await prisma.retentionSettings.update({
        where: { businessId },
        data: { maxAutomatedIncentivesPerMonth: 1 }, // exactamente uno
      });

      const benefit = await prisma.benefit.create({
        data: {
          businessId,
          title: 'Café gratis',
          type: BenefitType.gift,
          active: false,
        },
      });
      await prisma.retentionIncentiveDefinition.create({
        data: {
          businessId,
          benefitId: benefit.id,
          name: 'Café gratis',
          type: BenefitType.gift,
          active: true,
          automationEligible: true,
        },
      });
      await bootstrap.ensureDefaultRetentionSetup(businessId);
      const experiment = await runningExperiment(
        businessId,
        'AT_RISK_RECOVERY',
      );

      const winnerId = findCustomerIdForStrategy(
        experiment.id,
        experiment.variants,
        RetentionStrategyType.SOFT_BENEFIT,
      );
      const loserId = findCustomerIdForStrategy(
        experiment.id,
        experiment.variants,
        RetentionStrategyType.SOFT_BENEFIT,
        [winnerId],
      );
      const reminderId = findCustomerIdForStrategy(
        experiment.id,
        experiment.variants,
        RetentionStrategyType.REMINDER,
      );

      for (const [id, name] of [
        [winnerId, 'Cliente Uno'],
        [loserId, 'Cliente Dos'],
        [reminderId, 'Cliente Tres'],
      ] as const) {
        await prisma.customer.create({
          data: {
            id,
            businessId,
            name,
            phoneE164: `+5989${String(Date.now() + Math.random())
              .replace('.', '')
              .slice(-7)}`,
          },
        });
        await prisma.visit.create({
          data: {
            businessId,
            customerId: id,
            occurredAt: daysBefore(25),
            visitDayKey: dayKey(daysBefore(25)),
            verificationType: 'persistent_session',
          },
        });
      }

      await evaluateService.runDaily(NOW);

      const winnerAssignment =
        await prisma.retentionAssignment.findFirstOrThrow({
          where: { businessId, customerId: winnerId },
        });
      const loserAssignment = await prisma.retentionAssignment.findFirstOrThrow(
        {
          where: { businessId, customerId: loserId },
        },
      );
      const reminderAssignment =
        await prisma.retentionAssignment.findFirstOrThrow({
          where: { businessId, customerId: reminderId },
        });

      const winnerResult = await sendService.processAssignment(
        winnerAssignment.id,
        NOW,
      );
      expect(winnerResult.status).toBe('sent');
      if (winnerResult.status !== 'sent') throw new Error('unreachable');

      // `BenefitParticipation.createdAt` defaults to the DB's real wall
      // clock, not the fixed `NOW` this test passes around — realign it so
      // the cap's month-window math (`RetentionBudgetService.issuedThisMonth`)
      // actually sees this issuance as "this month" relative to `NOW`.
      await prisma.benefitParticipation.updateMany({
        where: { businessId, customerId: winnerId },
        data: { createdAt: NOW },
      });

      const loserResult = await sendService.processAssignment(
        loserAssignment.id,
        NOW,
      );
      // Nunca "sent" con un REMINDER disfrazado — un SKIP real, con el
      // motivo de presupuesto, nunca "MESSAGE_QUEUED" con otro contenido.
      expect(loserResult).toEqual({
        status: 'skipped',
        reasonCode: 'INCENTIVE_MONTHLY_INCENTIVE_LIMIT',
      });
      const loserAfter = await prisma.retentionAssignment.findUniqueOrThrow({
        where: { id: loserAssignment.id },
      });
      expect(loserAfter.status).toBe('SKIPPED');
      expect(loserAfter.messageId).toBeNull(); // nunca se creó un Message

      const reminderResult = await sendService.processAssignment(
        reminderAssignment.id,
        NOW,
      );
      expect(reminderResult.status).toBe('sent');
      if (reminderResult.status !== 'sent') throw new Error('unreachable');

      await dispatchService.dispatch(winnerResult.messageId, NOW);
      await dispatchService.dispatch(reminderResult.messageId, NOW);
      expect(whatsApp.sendText).toHaveBeenCalledTimes(2); // winner + reminder, nunca el loser

      // El uso del cap quedó exactamente en 1, nunca 2.
      const issued = await prisma.benefitParticipation.count({
        where: { businessId },
      });
      expect(issued).toBe(1);
    });
  });

  // ── §21 — progress reminder, self-service con sellos ────────────────────

  describe('progress reminder — self-service con sellos', () => {
    it('onboarding con tarjeta activa deja la infraestructura de progreso lista, y un cliente cerca del premio recibe un único WhatsApp', async () => {
      await onboarding.saveBusiness(userId, {
        name: 'Café Con Sellos',
        category: 'cafeteria',
      });
      await onboarding.saveProgram(userId, {
        rewardTitle: 'Café gratis',
        rewardType: 'gift',
        stampsRequired: 5,
      });
      const { businessId } = await onboarding.complete(userId);

      const settings = await prisma.retentionSettings.findUniqueOrThrow({
        where: { businessId },
      });
      expect(settings.rewardGoalsEnabled).toBe(true);
      expect(settings.progressReminderEnabled).toBe(true);

      const experiment = await runningExperiment(
        businessId,
        'REWARD_GOAL_PROGRESS',
      );
      expect(experiment.variants.map((v) => v.strategyType).sort()).toEqual(
        [
          RetentionStrategyType.CONTROL,
          RetentionStrategyType.PROGRESS_REMINDER,
        ].sort(),
      );

      const customerId = findCustomerIdForStrategy(
        experiment.id,
        experiment.variants,
        RetentionStrategyType.PROGRESS_REMINDER,
      );
      await prisma.customer.create({
        data: {
          id: customerId,
          businessId,
          name: 'Cliente Cerca Del Premio',
          phoneE164: `+5989${String(Date.now() + Math.random())
            .replace('.', '')
            .slice(-7)}`,
        },
      });

      const incentive =
        await prisma.retentionIncentiveDefinition.findFirstOrThrow({
          where: { businessId, rewardGoalEligible: true },
        });
      await prisma.customerRewardGoal.create({
        data: {
          businessId,
          customerId,
          incentiveDefinitionId: incentive.id,
          status: RewardGoalStatus.ACTIVE,
          startingVisitCount: 0,
          targetAdditionalVisits: 5,
          activatedAt: daysBefore(5),
          reasonCode: 'TEST',
          segmentAtCreation: CustomerSegment.NEW,
        },
      });
      // 4 of 5 stamps in — genuinely "close to the reward".
      for (let i = 0; i < 4; i++) {
        const at = daysBefore(4 - i);
        await prisma.visit.create({
          data: {
            businessId,
            customerId,
            occurredAt: at,
            visitDayKey: dayKey(at),
            verificationType: 'persistent_session',
          },
        });
      }

      await evaluateService.runDaily(NOW);
      const assignment = await prisma.retentionAssignment.findFirstOrThrow({
        where: { businessId, customerId, experimentId: experiment.id },
      });

      const sendResult = await sendService.processAssignment(
        assignment.id,
        NOW,
      );
      expect(sendResult.status).toBe('sent');
      if (sendResult.status !== 'sent') throw new Error('unreachable');
      expect(sendResult.benefitIssued).toBe(false); // progress never carries one

      await dispatchService.dispatch(sendResult.messageId, NOW);
      expect(whatsApp.sendText).toHaveBeenCalledTimes(1);

      const sentMessage = await prisma.message.findUniqueOrThrow({
        where: { id: sendResult.messageId },
      });
      expect(sentMessage.status).toBe('sent');
    });
  });
});
