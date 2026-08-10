import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { BenefitType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RetentionDecisionLogService } from '../retention-v2/retention-decision-log.service';
import { RewardGoalEngineService } from './reward-goal-engine.service';
import { RewardGoalIssuerService } from './reward-goal-issuer.service';
import { RewardGoalUnlockService } from './reward-goal-unlock.service';
import { RewardGoalOrchestratorService } from './reward-goal-orchestrator.service';
import { RewardGoalFeedbackService } from './reward-goal-feedback.service';
import {
  createTestBusiness,
  makeTestSuffix,
} from '../reviews/reviews.test-helpers';

/**
 * §9 pilot ask — contra DB real, sin mocks: prueba que el sello de feedback
 * es una fuente de progreso genuinamente aditiva (nunca una Visit falsa) y
 * que la combinación visita+bonus llega a unlock igual que dos visitas
 * reales lo harían.
 */
describe('Reward Goals — feedback bonus (integration)', () => {
  let prisma: PrismaService;
  let orchestrator: RewardGoalOrchestratorService;
  let feedback: RewardGoalFeedbackService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        RetentionDecisionLogService,
        RewardGoalEngineService,
        RewardGoalIssuerService,
        RewardGoalUnlockService,
        RewardGoalOrchestratorService,
        RewardGoalFeedbackService,
      ],
    }).compile();

    prisma = module.get(PrismaService);
    orchestrator = module.get(RewardGoalOrchestratorService);
    feedback = module.get(RewardGoalFeedbackService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function setupBusiness(
    overrides: { targetVisits?: number; bonusEnabled?: boolean } = {},
  ) {
    const suffix = makeTestSuffix();
    const business = await createTestBusiness(prisma, `rg-feedback-${suffix}`);
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
        rewardGoalCooldownDays: 3,
        // min=max=N: mismo target para cualquier segmento — el "sellos
        // necesarios" simple que la UI de Retención V2 pide.
        rewardGoalMinVisits: overrides.targetVisits ?? 2,
        rewardGoalMaxVisits: overrides.targetVisits ?? 2,
        rewardGoalFeedbackBonusEnabled: overrides.bonusEnabled ?? true,
      },
    });
    return { business, customer };
  }

  async function cleanup(businessId: string) {
    await prisma.rewardGoalBonusStamp
      .deleteMany({ where: { businessId } })
      .catch(() => undefined);
    await prisma.checkinFeedback
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

  async function visitOn(businessId: string, customerId: string, at: Date) {
    // A diferencia de reward-goal-multi-visit.integration.spec.ts (que solo
    // encadena 1-2 visitas), acá el mismo goal ACTIVE recibe varias visitas
    // seguidas — pinnear activatedAt en CADA llamada corrompería el progreso
    // ya calculado (activatedAt se movería hacia adelante en cada visita).
    // Solo se pinnea la primera vez, justo cuando el goal recién se crea —
    // igual que en producción, donde activatedAt se escribe una sola vez.
    const hadActiveGoalBefore = await prisma.customerRewardGoal.findFirst({
      where: { businessId, customerId, status: 'ACTIVE' },
      select: { id: true },
    });

    const visit = await prisma.visit.create({
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
    if (!hadActiveGoalBefore) {
      await prisma.customerRewardGoal.updateMany({
        where: { businessId, customerId, status: 'ACTIVE' },
        data: { activatedAt: at, updatedAt: at },
      });
    }
    return { visit, result };
  }

  it('un feedback negativo otorga el mismo bonus que uno positivo, y la combinación visita+bonus desbloquea', async () => {
    const { business, customer } = await setupBusiness();
    try {
      const day1 = new Date('2026-09-01T10:00:00.000Z');
      const { visit: firstVisit, result: firstResult } = await visitOn(
        business.id,
        customer.id,
        day1,
      );

      // Primera visita real -> crea la meta (target=2 por el override), sin
      // desbloquear todavía.
      expect(firstResult.goal).toMatchObject({
        targetAdditionalVisits: 2,
        progressVisits: 0,
      });

      // Feedback NEGATIVO sobre esa misma visita -> +1 bonus igual.
      const feedbackResult = await feedback.submit(
        business.id,
        customer.id,
        firstVisit.id,
        2,
        'no me gustó la espera',
        new Date('2026-09-01T10:05:00.000Z'),
      );
      expect(feedbackResult.bonusGranted).toBe(true);
      expect(feedbackResult.offerGoogle).toBe(false); // score < 4
      expect(feedbackResult.rewardGoal.goal).toMatchObject({
        progressVisits: 1,
        bonusStamps: 1,
        visitProgress: 0,
        targetAdditionalVisits: 2,
      });
      expect(feedbackResult.rewardGoal.unlockedNow).toBe(false);

      // Reabrir/repetir el mismo feedback -> nunca un segundo bonus.
      const repeated = await feedback.submit(
        business.id,
        customer.id,
        firstVisit.id,
        5,
        undefined,
        new Date('2026-09-01T10:10:00.000Z'),
      );
      expect(repeated.alreadySubmitted).toBe(true);
      expect(repeated.bonusGranted).toBe(false);

      const bonusCount = await prisma.rewardGoalBonusStamp.count({
        where: { businessId: business.id, customerId: customer.id },
      });
      expect(bonusCount).toBe(1); // sigue siendo 1, no 2

      // Segunda visita REAL -> 1 visita + 1 bonus = 2 = target -> unlock.
      const day2 = new Date('2026-09-03T10:00:00.000Z');
      const { result: secondResult } = await visitOn(
        business.id,
        customer.id,
        day2,
      );
      expect(secondResult.unlockedNow).toBe(true);
      expect(secondResult.benefit?.name).toBe('Capuccino gratis');

      // El bonus nunca creó una Visit falsa: solo hay 2 Visit reales, las
      // que efectivamente pasaron por `visitOn`.
      const visitCount = await prisma.visit.count({
        where: { businessId: business.id, customerId: customer.id },
      });
      expect(visitCount).toBe(2);
    } finally {
      await cleanup(business.id);
    }
  });

  it('una meta de 5 sellos desbloquea con una combinación real de Visit + FeedbackBonus', async () => {
    const { business, customer } = await setupBusiness({ targetVisits: 5 });
    try {
      const day1 = new Date('2026-09-01T10:00:00.000Z');
      const { visit: firstVisit } = await visitOn(
        business.id,
        customer.id,
        day1,
      );

      // 1 visita (la que crea la meta no cuenta como progreso) + 3 más + 1
      // bonus de feedback = 5 = target.
      await visitOn(
        business.id,
        customer.id,
        new Date('2026-09-02T10:00:00.000Z'),
      );
      await visitOn(
        business.id,
        customer.id,
        new Date('2026-09-03T10:00:00.000Z'),
      );
      const feedbackResult = await feedback.submit(
        business.id,
        customer.id,
        firstVisit.id,
        5,
        undefined,
        new Date('2026-09-03T10:05:00.000Z'),
      );
      expect(feedbackResult.rewardGoal.goal).toMatchObject({
        progressVisits: 3,
        visitProgress: 2,
        bonusStamps: 1,
        targetAdditionalVisits: 5,
      });

      const { result: lastResult } = await visitOn(
        business.id,
        customer.id,
        new Date('2026-09-04T10:00:00.000Z'),
      );
      // Todavía falta 1 (2 visitas + 1 bonus + esta = 4, no 5 todavía).
      expect(lastResult.unlockedNow).toBe(false);

      const { result: finalResult } = await visitOn(
        business.id,
        customer.id,
        new Date('2026-09-05T10:00:00.000Z'),
      );
      expect(finalResult.unlockedNow).toBe(true);
    } finally {
      await cleanup(business.id);
    }
  });

  it('con el bonus desactivado, ningún feedback suma progreso — solo Visit reales avanzan la meta', async () => {
    const { business, customer } = await setupBusiness({
      bonusEnabled: false,
      targetVisits: 1,
    });
    try {
      const day1 = new Date('2026-09-01T10:00:00.000Z');
      const { visit: firstVisit } = await visitOn(
        business.id,
        customer.id,
        day1,
      );

      const feedbackResult = await feedback.submit(
        business.id,
        customer.id,
        firstVisit.id,
        1, // score bajo — igual no importa, el toggle está OFF
        'pésimo',
        new Date('2026-09-01T10:05:00.000Z'),
      );
      expect(feedbackResult.bonusGranted).toBe(false);
      expect(feedbackResult.rewardGoal.goal).toMatchObject({
        progressVisits: 0,
        bonusStamps: 0,
      });

      const bonusCount = await prisma.rewardGoalBonusStamp.count({
        where: { businessId: business.id, customerId: customer.id },
      });
      expect(bonusCount).toBe(0);

      // Con target=1, esta segunda visita REAL alcanza sola — el feedback
      // (bonus desactivado) nunca contó como si fuera una.
      const { result: secondResult } = await visitOn(
        business.id,
        customer.id,
        new Date('2026-09-03T10:00:00.000Z'),
      );
      expect(secondResult.unlockedNow).toBe(true);
    } finally {
      await cleanup(business.id);
    }
  });

  it('negocio sin RetentionSettings (nunca abrió Retención V2): sin meta activa, el feedback se guarda pero nunca otorga un bonus', async () => {
    // Sin una fila de RetentionSettings con rewardGoalsEnabled=true, jamás
    // existe una meta ACTIVE que otorgar un bonus (RewardGoalEngineService
    // ya lo exige para crear cualquier meta) — este es el caso real de
    // "settings inexistentes => bonus OFF", no uno artificial.
    const suffix = makeTestSuffix();
    const business = await createTestBusiness(
      prisma,
      `rg-feedback-off-${suffix}`,
    );
    const customer = await prisma.customer.create({
      data: {
        id: randomUUID(),
        businessId: business.id,
        name: `Cliente ${suffix}`,
        phoneE164: `+59891${suffix.slice(0, 6)}`,
      },
    });
    const visit = await prisma.visit.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        occurredAt: new Date(),
        visitDayKey: new Date().toISOString().slice(0, 10),
        verificationType: 'manual',
      },
    });

    try {
      const result = await feedback.submit(
        business.id,
        customer.id,
        visit.id,
        5,
        undefined,
      );

      expect(result.bonusGranted).toBe(false);
      expect(result.rewardGoal).toEqual({
        goal: null,
        unlockedNow: false,
        benefit: null,
      });

      const saved = await prisma.checkinFeedback.findUnique({
        where: { visitId: visit.id },
      });
      expect(saved?.score).toBe(5);

      const bonusCount = await prisma.rewardGoalBonusStamp.count({
        where: { businessId: business.id },
      });
      expect(bonusCount).toBe(0);
    } finally {
      await prisma.checkinFeedback
        .deleteMany({ where: { businessId: business.id } })
        .catch(() => undefined);
      await prisma.visit.deleteMany({ where: { businessId: business.id } });
      await prisma.customer.deleteMany({ where: { businessId: business.id } });
      await prisma.business.delete({ where: { id: business.id } });
    }
  });
});
