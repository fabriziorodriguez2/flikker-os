import { randomUUID } from 'crypto';
import { ExperienceVersion, SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PlansService } from './plans.service';
import { PlansRepository } from './plans.repository';

/**
 * Prueba real (Postgres, no mocks) de los escenarios explícitamente pedidos:
 * onboarding Beneficios+sellos arranca el trial, trial vencido bloquea
 * acciones Pro sin borrar nada, upgrade a Pro desbloquea sin perder nada,
 * límite de 50, y que el plan Pro self-service (Mercado Pago) es UYU 1.000
 * y una fila SEPARADA del 'pro' histórico en USD. No repite lo que
 * `plans.service.spec.ts` ya prueba con mocks — exclusivamente el camino
 * contra la base real. Se salta con gracia si no hay base disponible, misma
 * convención que el resto de `*.integration.spec.ts`.
 */
describe('Subscription — capacidades independientes de sellos/Beneficios (integration)', () => {
  let prisma: PrismaService;
  let plans: PlansService;
  let available = false;
  let businessId = '';

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) return;
    prisma = new PrismaService();
    try {
      await prisma.$connect();
      plans = new PlansService(new PlansRepository(prisma));

      const business = await prisma.business.create({
        data: {
          name: 'Café Capacidades',
          slug: `subscription-capabilities-${randomUUID()}`,
          country: 'UY',
          timezone: 'America/Montevideo',
          currency: 'UYU',
          experienceVersion: ExperienceVersion.CHECKIN_V2,
        },
        select: { id: true },
      });
      businessId = business.id;

      available = true;
    } catch {
      available = false;
    }
  });

  afterAll(async () => {
    if (!available) {
      await prisma?.$disconnect().catch(() => undefined);
      return;
    }
    await prisma.customerRewardGoal.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.subscription.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('onboarding "Beneficios + sellos": arranca el trial de 30 días — nunca queda Beneficios Pro gratis para siempre', async () => {
    if (!available) return;

    // Exactamente lo que hace `OnboardingService#saveProgram` hoy: las dos
    // llamadas juntas, no solo la del plan.
    await plans.ensureFreeSubscriptionIfMissing(businessId);
    await plans.startBenefitsTrialIfNeeded(businessId);

    const sub = await prisma.subscription.findUnique({
      where: { businessId },
      include: { plan: true },
    });
    expect(sub?.plan.slug).toBe('free');
    expect(sub?.plan.maxCustomers).toBe(50);
    expect(sub?.status).toBe(SubscriptionStatus.ACTIVE);

    const business = await prisma.business.findUnique({
      where: { id: businessId },
      select: { benefitsTrialStartedAt: true, benefitsTrialEndsAt: true },
    });
    expect(business?.benefitsTrialStartedAt).not.toBeNull();
    expect(business?.benefitsTrialEndsAt).not.toBeNull();
    expect(await plans.isBenefitsBlocked(businessId)).toBe(false);
  });

  it('reactivar Beneficios (apagar/prender) NUNCA reinicia el trial ya corriendo', async () => {
    if (!available) return;

    const before = await prisma.business.findUnique({
      where: { id: businessId },
      select: { benefitsTrialStartedAt: true },
    });

    await plans.startBenefitsTrialIfNeeded(businessId);

    const after = await prisma.business.findUnique({
      where: { id: businessId },
      select: { benefitsTrialStartedAt: true },
    });
    expect(after?.benefitsTrialStartedAt?.getTime()).toBe(
      before?.benefitsTrialStartedAt?.getTime(),
    );
  });

  it('Beneficios + sellos simultáneos: ambas capacidades conviven sin pisarse', async () => {
    if (!available) return;

    await prisma.retentionSettings.upsert({
      where: { businessId },
      update: { rewardGoalsEnabled: true, benefitsEnabled: true },
      create: {
        businessId,
        rewardGoalsEnabled: true,
        benefitsEnabled: true,
      },
    });

    const settings = await prisma.retentionSettings.findUnique({
      where: { businessId },
      select: { rewardGoalsEnabled: true, benefitsEnabled: true },
    });
    expect(settings).toEqual({
      rewardGoalsEnabled: true,
      benefitsEnabled: true,
    });
  });

  it('límite de 50 clientes participantes: bloquea altas nuevas, nunca a los que ya estaban', async () => {
    if (!available) return;

    const customers = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        prisma.customer.create({
          data: {
            businessId,
            name: `Cliente ${i}`,
            phoneE164: `+5989${String(1000000 + i)}`,
            origin: 'qr',
          },
          select: { id: true },
        }),
      ),
    );
    const incentive = await prisma.retentionIncentiveDefinition.create({
      data: { businessId, name: 'Recompensa de prueba', type: 'gift' },
      select: { id: true },
    });
    await prisma.customerRewardGoal.createMany({
      data: customers.map((c) => ({
        businessId,
        customerId: c.id,
        incentiveDefinitionId: incentive.id,
        startingVisitCount: 0,
        targetAdditionalVisits: 5,
        reasonCode: 'TEST_SEED',
        segmentAtCreation: 'NEW',
      })),
    });

    // Cliente nuevo #51: bloqueado.
    const newCustomer = await prisma.customer.create({
      data: {
        businessId,
        name: 'Cliente 51',
        phoneE164: '+59891119999',
        origin: 'qr',
      },
      select: { id: true },
    });
    expect(await plans.canAddParticipant(businessId, newCustomer.id)).toBe(
      false,
    );

    // Uno que YA participaba: nunca se bloquea, aunque esté en el tope.
    expect(await plans.canAddParticipant(businessId, customers[0].id)).toBe(
      true,
    );

    await prisma.customerRewardGoal.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({
      where: { id: { in: [...customers.map((c) => c.id), newCustomer.id] } },
    });
  });

  it('trial vencido con Beneficios existentes: datos visibles, pero acciones Pro bloqueadas — nada se borra', async () => {
    if (!available) return;

    // Catálogo real, creado ANTES de que el trial venza.
    const benefit = await prisma.benefit.create({
      data: { businessId, title: 'Café gratis', type: 'gift', active: true },
      select: { id: true },
    });

    // Backdatea el trial para simular que ya venció.
    await prisma.business.update({
      where: { id: businessId },
      data: {
        benefitsTrialStartedAt: new Date('2020-01-01T00:00:00.000Z'),
        benefitsTrialEndsAt: new Date('2020-01-31T00:00:00.000Z'),
      },
    });

    expect(await plans.isBenefitsBlocked(businessId)).toBe(true);
    await expect(
      plans.assertBenefitsProActionAllowed(businessId),
    ).rejects.toThrow(/prueba de 30 días/);

    // Los datos siguen ahí, sin ningún cambio — bloquear una acción Pro
    // nunca borra ni oculta lo que ya existía.
    const stillThere = await prisma.benefit.findUnique({
      where: { id: benefit.id },
    });
    expect(stillThere?.active).toBe(true);
    expect(stillThere?.title).toBe('Café gratis');

    // El plan y la Subscription de sellos también siguen intactos.
    const sub = await prisma.subscription.findUnique({
      where: { businessId },
      include: { plan: true },
    });
    expect(sub?.plan.slug).toBe('free');
    expect(sub?.status).toBe(SubscriptionStatus.ACTIVE);

    await prisma.benefit.delete({ where: { id: benefit.id } });
  });

  it('upgrade a Pro self-service: desbloquea todo, sin perder nada de lo anterior', async () => {
    if (!available) return;

    // Mismo efecto que `PlatformService#confirmProSubscription` — se prueba
    // el resultado que PlansService lee, no la escritura en sí (un upsert
    // simple, sin lógica de negocio propia).
    const proSelfService = await plans.ensureProSelfServicePlan();
    expect(proSelfService.currency).toBe('UYU');
    expect(proSelfService.priceAmount).toBe(1000);
    expect(proSelfService.maxCustomers).toBeNull();

    await prisma.subscription.update({
      where: { businessId },
      data: { planId: proSelfService.id, status: SubscriptionStatus.ACTIVE },
    });

    expect(await plans.isOnProPlan(businessId)).toBe(true);
    expect(await plans.isBenefitsBlocked(businessId)).toBe(false);
    await expect(
      plans.assertBenefitsProActionAllowed(businessId),
    ).resolves.toBeUndefined();

    // Sin tope de clientes — el que estaba bloqueado antes ahora entra.
    const newCustomer = await prisma.customer.create({
      data: {
        businessId,
        name: 'Cliente Pro',
        phoneE164: '+59891110000',
        origin: 'qr',
      },
      select: { id: true },
    });
    expect(await plans.canAddParticipant(businessId, newCustomer.id)).toBe(
      true,
    );

    // Nada de la Subscription/RetentionSettings anteriores se perdió — solo
    // cambió el plan.
    const settings = await prisma.retentionSettings.findUnique({
      where: { businessId },
      select: { rewardGoalsEnabled: true, benefitsEnabled: true },
    });
    expect(settings).toEqual({
      rewardGoalsEnabled: true,
      benefitsEnabled: true,
    });

    await prisma.customer.delete({ where: { id: newCustomer.id } });
  });

  it('Pro histórico (asignado a mano, USD) también desbloquea todo — Pro es Pro sin importar la puerta', async () => {
    if (!available) return;

    const proPlan = await prisma.plan.findUnique({ where: { slug: 'pro' } });
    expect(proPlan).not.toBeNull();

    await prisma.subscription.update({
      where: { businessId },
      data: { planId: proPlan!.id, status: SubscriptionStatus.ACTIVE },
    });

    expect(await plans.isOnProPlan(businessId)).toBe(true);
    expect(await plans.isBenefitsBlocked(businessId)).toBe(false);
  });

  it("'pro' (histórico, USD 129) y 'pro-selfservice' (Mercado Pago, UYU 1.000) son filas SEPARADAS — nunca se pisan", async () => {
    if (!available) return;

    const legacyPro = await prisma.plan.findUnique({ where: { slug: 'pro' } });
    const selfServicePro = await plans.ensureProSelfServicePlan();

    expect(legacyPro?.id).not.toBe(selfServicePro.id);
    expect(legacyPro?.currency).toBe('USD');
    expect(legacyPro?.priceAmount).toBe(129);
    expect(selfServicePro.currency).toBe('UYU');
    expect(selfServicePro.priceAmount).toBe(1000);

    // Confirmar Pro self-service para ESTE negocio no le cambia nada al
    // plan histórico ni a ninguna Subscription que apunte a él.
    const legacyProSubscribers = await prisma.subscription.count({
      where: { planId: legacyPro!.id },
    });
    await plans.ensureProSelfServicePlan();
    const legacyProSubscribersAfter = await prisma.subscription.count({
      where: { planId: legacyPro!.id },
    });
    expect(legacyProSubscribersAfter).toBe(legacyProSubscribers);
  });
});
