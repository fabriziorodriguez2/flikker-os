import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { BenefitType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RetentionDecisionLogService } from '../retention-v2/retention-decision-log.service';
import { RewardGoalEngineService } from '../reward-goals/reward-goal-engine.service';
import { RewardGoalIssuerService } from '../reward-goals/reward-goal-issuer.service';
import { RewardGoalUnlockService } from '../reward-goals/reward-goal-unlock.service';
import { RewardGoalUnlockNotificationService } from '../reward-goals/reward-goal-unlock-notification.service';
import { RewardGoalOrchestratorService } from '../reward-goals/reward-goal-orchestrator.service';
import { PlansService } from '../plans/plans.service';
import { PlansRepository } from '../plans/plans.repository';
import { RetentionSettingsService } from '../retention-v2/retention-settings.service';
import { AutomationCooldownService } from '../../jobs/automation-cooldown.service';
import { LifecycleEmailsService } from '../../jobs/lifecycle-emails.service';
import { EmailService } from '../../jobs/email.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { BenefitsService } from '../benefits/benefits.service';
import { PublicMessagingService } from '../public/public-messaging.service';
import { FlikkerAccountService } from './flikker-account.service';
import { FlikkerAccountVerificationsRepository } from './flikker-account-verifications.repository';
import { FlikkerAccountSessionsRepository } from './flikker-account-sessions.repository';
import { MyFlikkerService } from './my-flikker.service';
import {
  createTestBusiness,
  makeTestSuffix,
} from '../reviews/reviews.test-helpers';

/**
 * Auditoría de caso real (Bar Fraternidad) — el cliente tenía una
 * `CustomerRewardGoal` ACTIVE real con progreso real, pero "Mis lugares y
 * premios" la mostraba vacía. Causa raíz confirmada contra producción:
 * `Customer.flikkerAccountId` solo se completa vía OTP
 * (`FlikkerAccountService.verifyAndIssueSession` → `linkExistingCustomers`)
 * — nunca automáticamente en el check-in, a propósito (ver el comentario de
 * esa clase: linkear sin probar el teléfono sería dejar que cualquiera
 * escriba el número de otra persona y herede sus tarjetas). Este test prueba
 * la cadena completa que el usuario pidió explícitamente: check-in → goal
 * ACTIVE → OTP en /mi-flikker → `linkExistingCustomers` → tarjeta visible.
 */
describe('FlikkerAccount — check-in con goal ACTIVE, luego OTP en Mi Flikker (integration)', () => {
  let prisma: PrismaService;
  let orchestrator: RewardGoalOrchestratorService;
  let flikkerAccount: FlikkerAccountService;
  let myFlikker: MyFlikkerService;
  let verifications: FlikkerAccountVerificationsRepository;

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
        FlikkerAccountVerificationsRepository,
        FlikkerAccountSessionsRepository,
        FlikkerAccountService,
        MyFlikkerService,
        // Tangenciales a lo que prueba este archivo (progreso de sellos +
        // linkeo de cuenta) — se fakean para no arrastrar todo su propio
        // árbol de dependencias.
        {
          provide: BenefitsService,
          useValue: {
            getOtherAvailableBenefits: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: PublicMessagingService,
          useValue: {
            sendVerificationCode: jest.fn().mockResolvedValue(undefined),
            sendMiFlikkerWelcome: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    prisma = module.get(PrismaService);
    orchestrator = module.get(RewardGoalOrchestratorService);
    flikkerAccount = module.get(FlikkerAccountService);
    myFlikker = module.get(MyFlikkerService);
    verifications = module.get(FlikkerAccountVerificationsRepository);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function cleanup(businessId: string, phoneE164: string) {
    await prisma.rewardGoalBonusStamp
      .deleteMany({ where: { businessId } })
      .catch(() => undefined);
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
    await prisma.flikkerAccountVerification
      .deleteMany({ where: { phoneE164 } })
      .catch(() => undefined);
    await prisma.flikkerAccountSession
      .deleteMany({ where: { flikkerAccount: { phoneE164 } } })
      .catch(() => undefined);
    await prisma.flikkerAccount
      .deleteMany({ where: { phoneE164 } })
      .catch(() => undefined);
  }

  it('check-in con goal ACTIVE 2/3 → /mi antes de OTP no la ve → verifica el mismo teléfono → la tarjeta aparece', async () => {
    const suffix = makeTestSuffix();
    const business = await createTestBusiness(
      prisma,
      `flikker-account-${suffix}`,
    );
    // Numérico puro a propósito: `normalizeToE164` (el mismo camino real de
    // OTP) exige 8-15 dígitos — `makeTestSuffix()` es hex (puede traer
    // letras a-f), que acá rompería la validación real que se está probando.
    const phoneE164 = `+598${Math.floor(10_000_000 + Math.random() * 89_999_999)}`;
    const customer = await prisma.customer.create({
      data: {
        id: randomUUID(),
        businessId: business.id,
        name: `Cliente ${suffix}`,
        phoneE164,
      },
    });
    await prisma.retentionIncentiveDefinition.create({
      data: {
        businessId: business.id,
        name: '1 porcion de muzza',
        type: BenefitType.gift,
        active: true,
        rewardGoalEligible: true,
      },
    });
    await prisma.retentionSettings.create({
      data: {
        businessId: business.id,
        rewardGoalsEnabled: true,
        rewardGoalMinVisits: 3,
        rewardGoalMaxVisits: 3,
      },
    });

    try {
      // ── 1. Check-in: dos visitas reales dejan la goal ACTIVE en 2/3 ──
      const day = (n: number) => new Date(Date.now() + n * 86_400_000);

      async function visitOn(at: Date) {
        await prisma.visit.create({
          data: {
            businessId: business.id,
            customerId: customer.id,
            occurredAt: at,
            visitDayKey: at.toISOString().slice(0, 10),
            verificationType: 'manual',
          },
        });
        return orchestrator.afterVisit(
          business.id,
          customer.id,
          'America/Montevideo',
          at,
        );
      }

      await visitOn(day(0));
      const v2 = await visitOn(day(1));
      expect(v2.unlockedNow).toBe(false);
      expect(v2.goal).toMatchObject({
        progressVisits: 2,
        targetAdditionalVisits: 3,
      });

      // ── 2. Antes de cualquier OTP: el Customer no está linkeado, y "Mis
      //      lugares y premios" para OTRA cuenta jamás la ve ──
      const customerBeforeLink = await prisma.customer.findUniqueOrThrow({
        where: { id: customer.id },
        select: { flikkerAccountId: true },
      });
      expect(customerBeforeLink.flikkerAccountId).toBeNull();

      // ── 3. OTP real en /mi-flikker con el MISMO teléfono del check-in ──
      const { code } = await verifications.start(phoneE164);
      expect(code).not.toBeNull();
      const session = await flikkerAccount.verifyAndIssueSession(
        phoneE164,
        code as string,
      );
      expect(session.flikkerAccountId).toBeTruthy();

      // ── 4. linkExistingCustomers corrió: el Customer del check-in queda
      //      linkeado a ESTA cuenta ──
      const customerAfterLink = await prisma.customer.findUniqueOrThrow({
        where: { id: customer.id },
        select: { flikkerAccountId: true },
      });
      expect(customerAfterLink.flikkerAccountId).toBe(session.flikkerAccountId);

      // ── 5. La tarjeta ACTIVE 2/3 ahora es visible en Mi Flikker ──
      const places = await myFlikker.listPlaces(session.flikkerAccountId);
      expect(places).toHaveLength(1);
      expect(places[0]).toMatchObject({
        businessId: business.id,
        rewardGoal: {
          incentiveName: '1 porcion de muzza',
          progressVisits: 2,
          targetAdditionalVisits: 3,
          remainingVisits: 1,
        },
      });
    } finally {
      await cleanup(business.id, phoneE164);
    }
  });
});
