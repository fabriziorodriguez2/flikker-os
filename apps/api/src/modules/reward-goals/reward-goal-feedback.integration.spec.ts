import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { BenefitType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RetentionDecisionLogService } from '../retention-v2/retention-decision-log.service';
import { RewardGoalEngineService } from './reward-goal-engine.service';
import { RewardGoalIssuerService } from './reward-goal-issuer.service';
import { RewardGoalUnlockService } from './reward-goal-unlock.service';
import { RewardGoalUnlockNotificationService } from './reward-goal-unlock-notification.service';
import { RewardGoalOrchestratorService } from './reward-goal-orchestrator.service';
import { RewardGoalFeedbackService } from './reward-goal-feedback.service';
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
        RewardGoalUnlockNotificationService,
        RewardGoalOrchestratorService,
        RewardGoalFeedbackService,
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

  /**
   * A diferencia de otros specs de este módulo, acá NO se pinnea
   * `activatedAt` a mano: `RewardGoalEngineService.createGoal` ya lo fija
   * él mismo, de forma explícita y permanente, un milisegundo antes de
   * `context.now` (bug real corregido — antes la visita fundadora de una
   * tarjeta quedaba afuera de su propio conteo para siempre). Pinnearlo acá
   * de nuevo a `at` (igual al `occurredAt` de esa misma visita) volvería a
   * excluirla, deshaciendo la corrección solo dentro de este test.
   */
  async function visitOn(businessId: string, customerId: string, at: Date) {
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

      // Primera visita real -> crea la meta (target=2 por el override). La
      // fundadora ya cuenta como progreso (bug real corregido: antes
      // quedaba afuera del conteo para siempre) -> 1/2, sin desbloquear
      // todavía (Fase E §27: nunca crea y desbloquea en la misma visita).
      expect(firstResult.goal).toMatchObject({
        targetAdditionalVisits: 2,
        progressVisits: 1,
      });
      expect(firstResult.unlockedNow).toBe(false);

      // Feedback NEGATIVO sobre esa misma visita -> +1 bonus igual. Con la
      // fundadora ya contando 1/2, este bonus completa 2/2 y desbloquea DE
      // UNA — antes de la corrección esto recién pasaba en la segunda
      // visita real, porque la fundadora no aportaba nada.
      const feedbackResult = await feedback.submit(
        business.id,
        customer.id,
        firstVisit.id,
        2,
        'no me gustó la espera',
        new Date('2026-09-01T10:05:00.000Z'),
      );
      expect(feedbackResult.bonusGranted).toBe(true);
      // La oferta de Google ya no depende del puntaje: un 2 recibe la misma
      // invitación que un 5, y el cliente decide.
      expect(feedbackResult.offerGoogle).toBe(true);
      expect(feedbackResult.rewardGoal.unlockedNow).toBe(true);
      expect(feedbackResult.rewardGoal.benefit?.name).toBe('Capuccino gratis');

      // Reabrir/repetir el mismo feedback -> nunca un segundo bonus. La
      // meta ya está UNLOCKED (no ACTIVE), así que la vista actual ya no
      // tiene una tarjeta en curso que mostrar.
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
      expect(repeated.rewardGoal).toEqual({
        goal: null,
        unlockedNow: false,
        benefit: null,
      });

      const bonusCount = await prisma.rewardGoalBonusStamp.count({
        where: { businessId: business.id, customerId: customer.id },
      });
      expect(bonusCount).toBe(1); // sigue siendo 1, no 2

      // Segunda visita REAL -> la meta ya está UNLOCKED sin canjear, así que
      // esta visita no otorga ni desbloquea nada nuevo (un ciclo UNLOCKED
      // sin canjear bloquea cualquier ciclo nuevo).
      const day2 = new Date('2026-09-03T10:00:00.000Z');
      const { result: secondResult } = await visitOn(
        business.id,
        customer.id,
        day2,
      );
      expect(secondResult).toEqual({
        goal: null,
        unlockedNow: false,
        benefit: null,
      });

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

      // La fundadora ya cuenta como progreso (1/5) + 2 visitas más + 1 bonus
      // de feedback = 4/5 — todavía no alcanza el target.
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
        progressVisits: 4,
        visitProgress: 3,
        bonusStamps: 1,
        targetAdditionalVisits: 5,
      });
      expect(feedbackResult.rewardGoal.unlockedNow).toBe(false);

      // Esta visita completa 3 visitas + 1 bonus + esta = 5 = target ->
      // desbloquea DE UNA. Antes de la corrección esto recién pasaba una
      // visita después, porque la fundadora no aportaba nada.
      const { result: lastResult } = await visitOn(
        business.id,
        customer.id,
        new Date('2026-09-04T10:00:00.000Z'),
      );
      expect(lastResult.unlockedNow).toBe(true);
      expect(lastResult.benefit?.name).toBe('Capuccino gratis');

      // La meta ya está UNLOCKED sin canjear: una visita más no otorga nada
      // nuevo.
      const { result: finalResult } = await visitOn(
        business.id,
        customer.id,
        new Date('2026-09-05T10:00:00.000Z'),
      );
      expect(finalResult).toEqual({
        goal: null,
        unlockedNow: false,
        benefit: null,
      });
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

      // Con target=1, la fundadora sola ya cumple el objetivo (1/1) — el
      // feedback en sí no suma nada (bonus OFF), pero SU LLAMADO a
      // `evaluateUnlock` (que corre siempre que hay una meta ACTIVE, gane o
      // no bonus) encuentra progreso ya completo y desbloquea DE UNA. No es
      // el feedback el que otorga el sello — es la visita fundadora, recién
      // reconocida por la corrección.
      const feedbackResult = await feedback.submit(
        business.id,
        customer.id,
        firstVisit.id,
        1, // score bajo — igual no importa, el toggle está OFF
        'pésimo',
        new Date('2026-09-01T10:05:00.000Z'),
      );
      expect(feedbackResult.bonusGranted).toBe(false);
      expect(feedbackResult.rewardGoal.unlockedNow).toBe(true);
      expect(feedbackResult.rewardGoal.benefit?.name).toBe('Capuccino gratis');

      const bonusCount = await prisma.rewardGoalBonusStamp.count({
        where: { businessId: business.id, customerId: customer.id },
      });
      expect(bonusCount).toBe(0);

      // La meta ya está UNLOCKED sin canjear: esta segunda visita REAL no
      // otorga ni desbloquea nada nuevo.
      const { result: secondResult } = await visitOn(
        business.id,
        customer.id,
        new Date('2026-09-03T10:00:00.000Z'),
      );
      expect(secondResult).toEqual({
        goal: null,
        unlockedNow: false,
        benefit: null,
      });
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
