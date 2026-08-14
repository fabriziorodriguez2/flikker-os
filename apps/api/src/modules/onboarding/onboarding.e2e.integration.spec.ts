import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { ExperienceVersion, MembershipRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VisitSourcesRepository } from '../visit-sources/visit-sources.repository';
import { BenefitsRepository } from '../benefits/benefits.repository';
import { BenefitsService } from '../benefits/benefits.service';
import { ProgramAuditService } from '../program-audit/program-audit.service';
import { RetentionSettingsService } from '../retention-v2/retention-settings.service';
import { RetentionExperimentsAdminService } from '../retention-v2/retention-experiments-admin.service';
import { RetentionV2BootstrapService } from '../retention-v2/retention-v2-bootstrap.service';
import { OnboardingService } from './onboarding.service';
import { ONBOARDING_DEFAULTS } from './onboarding.defaults';

/**
 * End-to-end del onboarding NUEVO (2 pasos) contra DB real, sin mocks.
 *
 * La pregunta que responde no es "¿corrieron los endpoints?" sino "¿el
 * negocio quedó REALMENTE listo para recibir un cliente?" — por eso verifica
 * el estado final campo por campo para los dos caminos del paso 2
 * (Beneficios / Beneficios + sellos), y que los defaults de cierre (kill
 * switch, recordatorio de progreso) queden como pide el producto.
 *
 * `saveWelcomeGift`/`saveDesign`/`saveGoogle`/`saveNotifications` ya no
 * forman parte del recorrido self-service (se sacaron del wizard a pedido
 * explícito), pero el backend se mantiene — el bloque final de este archivo
 * los sigue ejercitando directamente, sin pasar por `getState`.
 */
describe('Onboarding self-service — end to end (integration)', () => {
  let prisma: PrismaService;
  let onboarding: OnboardingService;
  let benefits: BenefitsService;
  let userId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        VisitSourcesRepository,
        BenefitsRepository,
        BenefitsService,
        ProgramAuditService,
        RetentionSettingsService,
        RetentionExperimentsAdminService,
        RetentionV2BootstrapService,
        OnboardingService,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService);
    onboarding = moduleRef.get(OnboardingService);
    benefits = moduleRef.get(BenefitsService);
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: `onb-${randomUUID().slice(0, 8)}@test.local`,
        passwordHash: 'x',
        firstName: 'Dueño',
        lastName: 'Test',
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
      await prisma.rewardGoalBonusStamp
        .deleteMany({ where: { businessId: id } })
        .catch(() => undefined);
      await prisma.checkinFeedback
        .deleteMany({ where: { businessId: id } })
        .catch(() => undefined);
      await prisma.benefitParticipation.deleteMany({
        where: { businessId: id },
      });
      await prisma.customerRewardGoal.deleteMany({ where: { businessId: id } });
      await prisma.visit.deleteMany({ where: { businessId: id } });
      await prisma.customer.deleteMany({ where: { businessId: id } });
      await prisma.visitSource.deleteMany({ where: { businessId: id } });
      await prisma.retentionIncentiveDefinition.deleteMany({
        where: { businessId: id },
      });
      await prisma.retentionSettings.deleteMany({ where: { businessId: id } });
      await prisma.business.update({
        where: { id },
        data: { welcomeBenefitId: null },
      });
      await prisma.benefit.deleteMany({ where: { businessId: id } });
      await prisma.membership.deleteMany({ where: { businessId: id } });
      await prisma.business.delete({ where: { id } });
    }
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  });

  describe('Camino "Beneficios + sellos"', () => {
    async function runWizard(options: { feedbackBonus?: boolean } = {}) {
      await onboarding.saveBusiness(userId, {
        name: 'Panadería E2E',
        category: 'panaderia',
      });
      await onboarding.saveProgram(userId, {
        rewardTitle: '3 medialunas gratis',
        rewardType: 'gift',
        stampsRequired: 5,
        feedbackBonusEnabled: options.feedbackBonus ?? true,
      });
      return onboarding.complete(userId);
    }

    it('deja el negocio REALMENTE listo para recibir un cliente', async () => {
      await runWizard({ feedbackBonus: true });

      const business = await prisma.business.findFirst({
        where: { memberships: { some: { userId } } },
        include: {
          memberships: true,
          visitSources: true,
          retentionSettings: true,
        },
      });
      if (!business) throw new Error('no business');

      // ── Experiencia y tenancy ─────────────────────────────────────────
      expect(business.experienceVersion).toBe(ExperienceVersion.CHECKIN_V2);
      expect(business.country).toBe(ONBOARDING_DEFAULTS.country);
      expect(business.currency).toBe(ONBOARDING_DEFAULTS.currency);
      expect(business.timezone).toBe(ONBOARDING_DEFAULTS.timezone);
      expect(business.memberships).toHaveLength(1);
      expect(business.memberships[0]).toMatchObject({
        userId,
        role: MembershipRole.OWNER,
        status: 'ACTIVE',
      });

      // ── QR: existe y es la fuente principal, silenciosamente ───────────
      const principal = business.visitSources.find((s) => s.isDefault);
      expect(principal).toBeDefined();
      expect(principal!.name).toBe('Principal');
      expect(principal!.isActive).toBe(true);

      // ── Programa ────────────────────────────────────────────────────
      expect(business.retentionSettings?.rewardGoalsEnabled).toBe(true);
      expect(business.retentionSettings?.rewardGoalMinVisits).toBe(5);
      expect(business.retentionSettings?.rewardGoalFeedbackBonusEnabled).toBe(
        true,
      );

      const reward = await prisma.retentionIncentiveDefinition.findFirst({
        where: { businessId: business.id, rewardGoalEligible: true },
      });
      expect(reward).toBeTruthy();
      expect(reward!.name).toBe('3 medialunas gratis');
      expect(reward!.active).toBe(true);

      // ── Defaults de cierre ──────────────────────────────────────────
      // Reactivación ON por defecto, y el recordatorio de progreso también
      // porque este negocio SÍ tiene tarjeta de sellos.
      expect(business.retentionEngineV2Enabled).toBe(true);
      expect(business.retentionSettings?.automaticCampaignsEnabled).toBe(true);
      expect(business.retentionSettings?.progressReminderEnabled).toBe(true);

      // Ningún beneficio autorizado para reactivación por defecto — es
      // válido: la retención puede mandar recordatorios sin beneficio.
      expect(
        await prisma.retentionIncentiveDefinition.count({
          where: { businessId: business.id, automationEligible: true },
        }),
      ).toBe(0);

      expect(business.onboardingCompletedAt).toBeInstanceOf(Date);
    });

    it('feedback bonus OFF queda OFF — se respeta la elección', async () => {
      await runWizard({ feedbackBonus: false });

      const settings = await prisma.retentionSettings.findFirst({
        where: { business: { memberships: { some: { userId } } } },
      });
      expect(settings?.rewardGoalFeedbackBonusEnabled).toBe(false);
    });

    it('REANUDACIÓN: paso 1 listo y paso 2 pendiente hasta elegir un camino', async () => {
      await onboarding.saveBusiness(userId, {
        name: 'Panadería E2E',
        category: 'panaderia',
      });

      let state = await onboarding.getState(userId);
      expect(state.steps.business).toBe(true);
      expect(state.steps.program).toBe(false);
      expect(state.program?.mode).toBeNull();

      await onboarding.saveProgram(userId, {
        rewardTitle: '3 medialunas gratis',
        stampsRequired: 5,
      });

      state = await onboarding.getState(userId);
      expect(state.steps.program).toBe(true);
      expect(state.program?.mode).toBe('benefits_stamps');
    });
  });

  describe('Camino "Beneficios" (sin tarjeta de sellos)', () => {
    it('0 beneficios es válido: el negocio queda listo igual, sin tarjeta', async () => {
      await onboarding.saveBusiness(userId, {
        name: 'Barbería E2E',
        category: 'barberia',
      });
      await onboarding.saveBenefitsOnlyProgram(userId, {});
      await onboarding.complete(userId);

      const business = await prisma.business.findFirstOrThrow({
        where: { memberships: { some: { userId } } },
        include: { retentionSettings: true, visitSources: true },
      });

      expect(business.experienceVersion).toBe(ExperienceVersion.CHECKIN_V2);
      expect(business.visitSources.some((s) => s.isDefault)).toBe(true);
      expect(business.retentionSettings?.rewardGoalsEnabled).toBe(false);
      // Reactivación sigue ON por defecto aunque no haya tarjeta de sellos...
      expect(business.retentionEngineV2Enabled).toBe(true);
      // ...pero el recordatorio de progreso NO, porque no hay tarjeta.
      expect(business.retentionSettings?.progressReminderEnabled).toBe(false);
      expect(business.onboardingCompletedAt).toBeInstanceOf(Date);
    });

    it('crea los beneficios elegidos, sin duplicar por título si se reenvía', async () => {
      await onboarding.saveBusiness(userId, {
        name: 'Barbería E2E',
        category: 'barberia',
      });
      await onboarding.saveBenefitsOnlyProgram(userId, {
        benefits: [
          { title: '2x1 en corte', type: 'promotion' },
          { title: '10% de descuento', type: 'discount' },
        ],
      });
      await onboarding.saveBenefitsOnlyProgram(userId, {
        benefits: [{ title: '2x1 en corte', type: 'promotion' }],
      });

      const business = await prisma.business.findFirstOrThrow({
        where: { memberships: { some: { userId } } },
      });
      const titles = (
        await prisma.benefit.findMany({
          where: { businessId: business.id },
          select: { title: true },
        })
      ).map((b) => b.title);
      expect(titles.sort()).toEqual(['10% de descuento', '2x1 en corte']);
    });

    it('REANUDACIÓN: getState refleja el camino "Beneficios" elegido', async () => {
      await onboarding.saveBusiness(userId, {
        name: 'Barbería E2E',
        category: 'barberia',
      });
      await onboarding.saveBenefitsOnlyProgram(userId, {
        benefits: [{ title: 'Café de cortesía', type: 'gift' }],
      });

      const state = await onboarding.getState(userId);
      expect(state.steps.program).toBe(true);
      expect(state.program?.mode).toBe('benefits');
      expect(state.benefitCount).toBe(1);
    });
  });

  it('IDEMPOTENTE: repetir el wizard entero no duplica negocio, QR ni beneficio', async () => {
    await onboarding.saveBusiness(userId, {
      name: 'Panadería E2E',
      category: 'panaderia',
    });
    await onboarding.saveBusiness(userId, {
      name: 'Panadería E2E',
      category: 'panaderia',
    });
    await onboarding.saveProgram(userId, {
      rewardTitle: '3 medialunas gratis',
      stampsRequired: 5,
    });
    await onboarding.saveProgram(userId, {
      rewardTitle: '3 medialunas gratis',
      stampsRequired: 5,
    });

    const businesses = await prisma.business.findMany({
      where: { memberships: { some: { userId } } },
    });
    expect(businesses).toHaveLength(1);

    const sources = await prisma.visitSource.count({
      where: { businessId: businesses[0].id },
    });
    expect(sources).toBe(1);

    const benefitRows = await prisma.benefit.count({
      where: { businessId: businesses[0].id },
    });
    expect(benefitRows).toBe(1);
  });

  it('onboardingCompletedAt se setea SOLO al finalizar, nunca antes', async () => {
    await onboarding.saveBusiness(userId, {
      name: 'Panadería E2E',
      category: 'panaderia',
    });

    let business = await prisma.business.findFirstOrThrow({
      where: { memberships: { some: { userId } } },
    });
    expect(business.onboardingCompletedAt).toBeNull();

    await onboarding.saveProgram(userId, {
      rewardTitle: 'Recompensa',
      stampsRequired: 3,
    });
    business = await prisma.business.findFirstOrThrow({
      where: { memberships: { some: { userId } } },
    });
    expect(business.onboardingCompletedAt).toBeNull();

    await onboarding.complete(userId);
    business = await prisma.business.findFirstOrThrow({
      where: { memberships: { some: { userId } } },
    });
    expect(business.onboardingCompletedAt).toBeInstanceOf(Date);
  });

  /**
   * Los pasos viejos ya no forman parte del recorrido self-service, pero el
   * backend se mantiene funcional — lo ejercita directamente, sin pasar por
   * `getState` (que ya no expone estos campos).
   */
  describe('Backend legado que se mantiene (fuera del wizard nuevo)', () => {
    it('saveWelcomeGift, saveDesign y saveGoogle siguen escribiendo lo que reciben', async () => {
      await onboarding.saveBusiness(userId, {
        name: 'Panadería E2E',
        category: 'panaderia',
      });
      await onboarding.saveWelcomeGift(userId, {
        wantsGift: true,
        title: 'Café de bienvenida',
      });
      await onboarding.saveDesign(userId, {
        loyaltyCardColor: '#1A1040',
        loyaltyStampColor: '#FFAB76',
        loyaltyStampIcon: 'coffee',
      });
      await onboarding.saveGoogle(userId, {
        googleBusinessProfileUrl: 'https://g.page/panaderia-e2e',
      });

      const business = await prisma.business.findFirstOrThrow({
        where: { memberships: { some: { userId } } },
      });
      expect(business.welcomeBenefitId).toBeTruthy();
      expect(business.welcomeGiftDecided).toBe(true);
      expect(business.loyaltyCardColor).toBe('#1A1040');
      expect(business.googleBusinessProfileUrl).toBe(
        'https://g.page/panaderia-e2e',
      );
    });

    it('con regalo de bienvenida configurado a mano: se entrega MÁXIMO UNA VEZ', async () => {
      await onboarding.saveBusiness(userId, {
        name: 'Panadería E2E',
        category: 'panaderia',
      });
      await onboarding.saveWelcomeGift(userId, {
        wantsGift: true,
        title: 'Café de bienvenida',
      });

      const business = await prisma.business.findFirstOrThrow({
        where: { memberships: { some: { userId } } },
      });

      const customer = await prisma.customer.create({
        data: {
          id: randomUUID(),
          businessId: business.id,
          name: 'Cliente E2E',
          phoneE164: `+59891${randomUUID().slice(0, 6)}`,
        },
      });

      const first = await benefits.grantWelcomeGift(business.id, customer.id);
      const second = await benefits.grantWelcomeGift(business.id, customer.id);
      expect(first?.code).toBeTruthy();
      expect(second?.code).toBe(first?.code);

      expect(
        await prisma.benefitParticipation.count({
          where: { businessId: business.id, customerId: customer.id },
        }),
      ).toBe(1);
    });

    it('saveNotifications sigue autorizando SOLO los beneficios elegidos', async () => {
      await onboarding.saveBusiness(userId, {
        name: 'Panadería E2E',
        category: 'panaderia',
      });
      const business = await prisma.business.findFirstOrThrow({
        where: { memberships: { some: { userId } } },
      });
      const extra = await prisma.benefit.create({
        data: {
          businessId: business.id,
          title: '10% de descuento',
          type: 'discount',
          active: false,
        },
      });

      await onboarding.saveNotifications(userId, {
        reactivateInactive: true,
        reactivationBenefitIds: [extra.id],
      });

      const authorized = await prisma.retentionIncentiveDefinition.findMany({
        where: { businessId: business.id, automationEligible: true },
        select: { benefitId: true },
      });
      expect(authorized).toHaveLength(1);
      expect(authorized[0].benefitId).toBe(extra.id);
    });
  });
});
