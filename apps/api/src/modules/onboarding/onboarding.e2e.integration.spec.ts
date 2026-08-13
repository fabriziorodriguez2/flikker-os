import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { ExperienceVersion, MembershipRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { VisitSourcesRepository } from '../visit-sources/visit-sources.repository';
import { BenefitsRepository } from '../benefits/benefits.repository';
import { BenefitsService } from '../benefits/benefits.service';
import { OnboardingService } from './onboarding.service';
import { ONBOARDING_DEFAULTS } from './onboarding.defaults';

/**
 * End-to-end del onboarding contra DB real, sin mocks.
 *
 * La pregunta que responde no es "¿corrieron los seis endpoints?" sino
 * "¿el negocio quedó REALMENTE listo para recibir un cliente?" — por eso
 * verifica el estado final campo por campo, y además resuelve el token del
 * QR como lo haría el check-in público.
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

  /** Corre el wizard completo, con las opciones que varían por test. */
  async function runWizard(
    options: {
      feedbackBonus?: boolean;
      withWelcome?: boolean;
      google?: boolean;
      reactivate?: boolean;
    } = {},
  ) {
    await onboarding.saveBusiness(userId, {
      name: 'Panadería E2E',
      category: 'panaderia',
      whatsapp: '+59899000111',
    });

    await onboarding.saveProgram(userId, {
      rewardTitle: '3 medialunas gratis',
      rewardType: 'gift',
      stampsRequired: 5,
      feedbackBonusEnabled: options.feedbackBonus ?? true,
    });

    // Paso propio: "sin regalo" también se decide y se guarda.
    await onboarding.saveWelcomeGift(
      userId,
      options.withWelcome
        ? { wantsGift: true, title: 'Café de bienvenida' }
        : { wantsGift: false },
    );

    await onboarding.saveDesign(userId, {
      loyaltyCardColor: '#1A1040',
      loyaltyStampColor: '#FFAB76',
      loyaltyStampIcon: 'coffee',
    });

    if (options.google) {
      await onboarding.saveGoogle(userId, {
        googleBusinessProfileUrl: 'https://g.page/panaderia-e2e',
      });
    }

    const state = await onboarding.saveNotifications(userId, {
      remindNearReward: true,
      reactivateInactive: options.reactivate ?? false,
      reactivationBenefitIds: [],
    });

    await onboarding.complete(userId);
    return state;
  }

  it('deja el negocio REALMENTE listo para recibir un cliente', async () => {
    await runWizard({ feedbackBonus: true, google: true });

    const business = await prisma.business.findFirst({
      where: { memberships: { some: { userId } } },
      include: {
        memberships: true,
        visitSources: true,
        retentionSettings: true,
      },
    });
    if (!business) throw new Error('no business');

    // ── Experiencia y tenancy ───────────────────────────────────────────
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

    // ── QR: existe, es la fuente principal y RESUELVE como en el check-in ─
    const principal = business.visitSources.find((s) => s.isDefault);
    expect(principal).toBeDefined();
    expect(principal!.name).toBe('Principal');
    expect(principal!.isActive).toBe(true);

    const resolved = await prisma.visitSource.findUnique({
      where: { token: principal!.token },
      include: { business: true },
    });
    expect(resolved?.business.id).toBe(business.id);
    expect(resolved?.business.experienceVersion).toBe(
      ExperienceVersion.CHECKIN_V2,
    );

    // ── Programa ────────────────────────────────────────────────────────
    expect(business.retentionSettings?.rewardGoalsEnabled).toBe(true);
    expect(business.retentionSettings?.rewardGoalMinVisits).toBe(5);
    expect(business.retentionSettings?.rewardGoalMaxVisits).toBe(5);
    expect(business.retentionSettings?.rewardGoalFeedbackBonusEnabled).toBe(
      true,
    );

    const reward = await prisma.retentionIncentiveDefinition.findFirst({
      where: { businessId: business.id, rewardGoalEligible: true },
    });
    expect(reward).toBeTruthy();
    expect(reward!.name).toBe('3 medialunas gratis');
    expect(reward!.active).toBe(true);

    // ── Apariencia ──────────────────────────────────────────────────────
    expect(business.loyaltyCardColor).toBe('#1A1040');
    expect(business.loyaltyStampColor).toBe('#FFAB76');
    expect(business.loyaltyStampIcon).toBe('coffee');

    // ── Google conectado ────────────────────────────────────────────────
    expect(business.googleBusinessProfileUrl).toBe(
      'https://g.page/panaderia-e2e',
    );

    // ── Cierre ──────────────────────────────────────────────────────────
    expect(business.onboardingCompletedAt).toBeInstanceOf(Date);
  });

  it('sin Google, el negocio queda igual de funcional y Google queda PENDIENTE', async () => {
    await runWizard({ google: false });

    const business = await prisma.business.findFirst({
      where: { memberships: { some: { userId } } },
      include: { retentionSettings: true, visitSources: true },
    });

    expect(business!.googleBusinessProfileUrl).toBeNull();
    // Lo que importa: el programa y el QR funcionan igual.
    expect(business!.retentionSettings?.rewardGoalsEnabled).toBe(true);
    expect(business!.visitSources.some((s) => s.isDefault)).toBe(true);
    expect(business!.onboardingCompletedAt).toBeInstanceOf(Date);
  });

  it('feedback bonus OFF queda OFF — se respeta la elección', async () => {
    await runWizard({ feedbackBonus: false });

    const settings = await prisma.retentionSettings.findFirst({
      where: { business: { memberships: { some: { userId } } } },
    });
    expect(settings?.rewardGoalFeedbackBonusEnabled).toBe(false);
  });

  it('sin regalo de bienvenida, welcomeBenefitId queda null pero la DECISIÓN queda guardada', async () => {
    await runWizard({ withWelcome: false });

    const business = await prisma.business.findFirst({
      where: { memberships: { some: { userId } } },
    });
    expect(business!.welcomeBenefitId).toBeNull();
    // La diferencia entre "dijo que no" y "todavía no le preguntamos".
    expect(business!.welcomeGiftDecided).toBe(true);
  });

  /**
   * Reanudación entre los pasos 2 y 3, que es donde el wizard puede quedar
   * preguntando en loop: si "no quiero regalo" no se persistiera, cada refresh
   * volvería a mandar al dueño a la misma pantalla.
   */
  it('REANUDACIÓN 2→3: el refresh cae en el paso 3 hasta que la bienvenida se decide', async () => {
    await onboarding.saveBusiness(userId, {
      name: 'Panadería E2E',
      category: 'panaderia',
    });
    await onboarding.saveProgram(userId, {
      rewardTitle: '3 medialunas gratis',
      stampsRequired: 5,
    });

    // Refresh justo después del paso 2: programa listo, bienvenida pendiente.
    let state = await onboarding.getState(userId);
    expect(state.steps.program).toBe(true);
    expect(state.steps.welcomeGift).toBe(false);

    // El dueño dice que NO. Es una respuesta, no una omisión.
    await onboarding.saveWelcomeGift(userId, { wantsGift: false });

    // Refresh de nuevo: ya no vuelve a preguntar.
    state = await onboarding.getState(userId);
    expect(state.steps.welcomeGift).toBe(true);
    expect(state.program?.welcomeGiftDecided).toBe(true);
    expect(state.program?.welcomeBenefitId).toBeNull();

    // Y repetir el paso 2 no borra la decisión del paso 3.
    await onboarding.saveProgram(userId, {
      rewardTitle: '3 medialunas gratis',
      stampsRequired: 6,
    });
    state = await onboarding.getState(userId);
    expect(state.steps.welcomeGift).toBe(true);
  });

  it('REANUDACIÓN 2→3: cambiar de idea sobrescribe la decisión sin duplicar beneficios', async () => {
    await onboarding.saveBusiness(userId, {
      name: 'Panadería E2E',
      category: 'panaderia',
    });
    await onboarding.saveProgram(userId, {
      rewardTitle: 'Recompensa',
      stampsRequired: 5,
    });

    await onboarding.saveWelcomeGift(userId, { wantsGift: false });
    await onboarding.saveWelcomeGift(userId, {
      wantsGift: true,
      title: 'Café de bienvenida',
    });
    await onboarding.saveWelcomeGift(userId, {
      wantsGift: true,
      title: 'Café de bienvenida',
    });

    const business = await prisma.business.findFirstOrThrow({
      where: { memberships: { some: { userId } } },
    });
    expect(business.welcomeBenefitId).toBeTruthy();
    expect(business.welcomeGiftDecided).toBe(true);

    // Recompensa + bienvenida = 2. El reenvío reusa por título, no duplica.
    expect(
      await prisma.benefit.count({ where: { businessId: business.id } }),
    ).toBe(2);
  });

  it('con regalo de bienvenida: se configura y se entrega MÁXIMO UNA VEZ', async () => {
    await runWizard({ withWelcome: true });

    const business = await prisma.business.findFirst({
      where: { memberships: { some: { userId } } },
    });
    expect(business!.welcomeBenefitId).toBeTruthy();

    const customer = await prisma.customer.create({
      data: {
        id: randomUUID(),
        businessId: business!.id,
        name: 'Cliente E2E',
        phoneE164: `+59891${randomUUID().slice(0, 6)}`,
      },
    });

    // Dos entregas seguidas (registro + reintento) → un solo código.
    const first = await benefits.grantWelcomeGift(business!.id, customer.id);
    const second = await benefits.grantWelcomeGift(business!.id, customer.id);
    expect(first?.code).toBeTruthy();
    expect(second?.code).toBe(first?.code);

    const participations = await prisma.benefitParticipation.count({
      where: { businessId: business!.id, customerId: customer.id },
    });
    expect(participations).toBe(1);

    // Y deja de ofrecerse una vez canjeado.
    expect(
      await benefits.getWelcomeGiftState(business!.id, customer.id),
    ).toBeTruthy();
    await prisma.benefitParticipation.updateMany({
      where: { businessId: business!.id, customerId: customer.id },
      data: { redeemedAt: new Date() },
    });
    expect(
      await benefits.getWelcomeGiftState(business!.id, customer.id),
    ).toBeNull();
  });

  it('reactivación ON autoriza SOLO los beneficios elegidos', async () => {
    await onboarding.saveBusiness(userId, {
      name: 'Panadería E2E',
      category: 'panaderia',
    });
    await onboarding.saveProgram(userId, {
      rewardTitle: '3 medialunas gratis',
      stampsRequired: 5,
    });
    const extra = await prisma.benefit.create({
      data: {
        businessId: (
          await prisma.business.findFirstOrThrow({
            where: { memberships: { some: { userId } } },
          })
        ).id,
        title: '10% de descuento',
        type: 'discount',
        active: false,
      },
    });

    await onboarding.saveNotifications(userId, {
      reactivateInactive: true,
      reactivationBenefitIds: [extra.id],
    });

    const business = await prisma.business.findFirstOrThrow({
      where: { memberships: { some: { userId } } },
    });
    expect(business.retentionEngineV2Enabled).toBe(true);

    const authorized = await prisma.retentionIncentiveDefinition.findMany({
      where: { businessId: business.id, automationEligible: true },
      select: { benefitId: true },
    });
    expect(authorized).toHaveLength(1);
    expect(authorized[0].benefitId).toBe(extra.id);
  });

  /**
   * Los dos toggles son independientes de verdad: acá "reactivar" está OFF
   * pero "recordar cerca del premio" está ON, así que el motor tiene que
   * seguir corriendo — y aun así no puede salir a recuperar a nadie ni usar
   * ningún beneficio. Antes ambos colgaban de `automaticCampaignsEnabled` y
   * este escenario era imposible de expresar.
   */
  it('reactivación OFF no autoriza ningún beneficio, aunque el motor siga andando por el otro recordatorio', async () => {
    await runWizard({ reactivate: false }); // remindNearReward: true

    const business = await prisma.business.findFirstOrThrow({
      where: { memberships: { some: { userId } } },
      include: { retentionSettings: true },
    });
    expect(business.retentionSettings?.automaticCampaignsEnabled).toBe(false);
    expect(business.retentionSettings?.progressReminderEnabled).toBe(true);
    // El kill switch está prendido por el recordatorio de progreso, no por la
    // reactivación.
    expect(business.retentionEngineV2Enabled).toBe(true);

    const authorized = await prisma.retentionIncentiveDefinition.count({
      where: { businessId: business.id, automationEligible: true },
    });
    expect(authorized).toBe(0);
  });

  it('REANUDACIÓN paso 6: apagar todo se guarda como decisión y no se vuelve a preguntar', async () => {
    await onboarding.saveBusiness(userId, {
      name: 'Panadería E2E',
      category: 'panaderia',
    });
    await onboarding.saveProgram(userId, {
      rewardTitle: 'Recompensa',
      stampsRequired: 5,
    });

    // Antes de llegar al paso: pendiente.
    expect((await onboarding.getState(userId)).steps.notifications).toBe(false);

    // El dueño dice que no quiere NINGUNA automatización.
    await onboarding.saveNotifications(userId, {
      remindNearReward: false,
      reactivateInactive: false,
    });

    // Refresh: el paso está completo, aunque todo haya quedado apagado.
    const state = await onboarding.getState(userId);
    expect(state.steps.notifications).toBe(true);
    expect(state.automations).toEqual({
      remindNearReward: false,
      reactivateInactive: false,
    });
  });

  it('los dos recordatorios apagados dejan el motor apagado', async () => {
    await onboarding.saveBusiness(userId, {
      name: 'Panadería E2E',
      category: 'panaderia',
    });
    await onboarding.saveProgram(userId, {
      rewardTitle: 'Recompensa',
      stampsRequired: 5,
    });
    await onboarding.saveNotifications(userId, {
      remindNearReward: false,
      reactivateInactive: false,
    });

    const business = await prisma.business.findFirstOrThrow({
      where: { memberships: { some: { userId } } },
      include: { retentionSettings: true },
    });
    expect(business.retentionEngineV2Enabled).toBe(false);
    expect(business.retentionSettings?.progressReminderEnabled).toBe(false);
    expect(business.retentionSettings?.automaticCampaignsEnabled).toBe(false);
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
});
