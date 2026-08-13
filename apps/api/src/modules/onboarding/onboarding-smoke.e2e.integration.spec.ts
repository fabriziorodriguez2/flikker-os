import { randomUUID } from 'crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { MembershipRole, MembershipStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CheckinModule } from '../checkin/checkin.module';
import { CheckinService } from '../checkin/checkin.service';
import { OnboardingModule } from './onboarding.module';
import { OnboardingService } from './onboarding.service';
import { RewardGoalOrchestratorService } from '../reward-goals/reward-goal-orchestrator.service';

/**
 * Smoke end-to-end del recorrido self-service COMPLETO, contra DB real.
 *
 * La diferencia con `onboarding.e2e.integration.spec.ts` es el alcance: aquel
 * verifica que el wizard deje bien la configuración; éste sigue al cliente
 * anónimo que después escanea el QR y comprueba que lo que el dueño eligió es
 * exactamente lo que ese cliente termina viendo. Es el único test que cruza
 * los dos lados del producto.
 *
 * También cubre las dos reglas de ruteo que no se pueden testear desde el
 * frontend sin un browser: el dueño que ya terminó no vuelve al onboarding, y
 * el empleado invitado nunca entra.
 */
describe('Self-service — smoke end to end (integration)', () => {
  let prisma: PrismaService;
  let onboarding: OnboardingService;
  let checkin: CheckinService;
  let rewardGoals: RewardGoalOrchestratorService;
  let userId: string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      // `ThrottlerModule` va porque `CheckinController` usa `ThrottlerGuard`;
      // sin él el grafo de `CheckinModule` no compila (mismo motivo que en
      // `simulation-root.module.ts`).
      imports: [
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
        OnboardingModule,
        CheckinModule,
      ],
    }).compile();

    prisma = moduleRef.get(PrismaService, { strict: false });
    onboarding = moduleRef.get(OnboardingService, { strict: false });
    checkin = moduleRef.get(CheckinService, { strict: false });
    rewardGoals = moduleRef.get(RewardGoalOrchestratorService, {
      strict: false,
    });
    await prisma.$connect();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: `smoke-${randomUUID().slice(0, 8)}@test.local`,
        passwordHash: 'x',
        firstName: 'Dueño',
        lastName: 'Smoke',
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
      await prisma.customerEvent
        .deleteMany({ where: { businessId: id } })
        .catch(() => undefined);
      await prisma.customerSession
        .deleteMany({ where: { businessId: id } })
        .catch(() => undefined);
      await prisma.benefitParticipation.deleteMany({
        where: { businessId: id },
      });
      await prisma.customerRewardGoal.deleteMany({ where: { businessId: id } });
      await prisma.visit.deleteMany({ where: { businessId: id } });
      // El registro dispara el mensaje de bienvenida, que referencia al
      // Customer: sin esto el borrado de clientes choca contra la FK.
      await prisma.message
        .deleteMany({ where: { businessId: id } })
        .catch(() => undefined);
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

  /** Los 7 pasos, en el mismo orden en que los recorre el wizard. */
  async function runWizard(options: { welcome: boolean }) {
    await onboarding.saveBusiness(userId, {
      name: 'Café Smoke',
      category: 'cafeteria',
      whatsapp: '+59899000222',
    });
    await onboarding.saveProgram(userId, {
      rewardTitle: 'Café gratis',
      rewardType: 'gift',
      stampsRequired: 5,
      feedbackBonusEnabled: false,
    });
    await onboarding.saveWelcomeGift(
      userId,
      options.welcome
        ? { wantsGift: true, title: 'Medialuna de bienvenida' }
        : { wantsGift: false },
    );
    await onboarding.saveDesign(userId, {
      loyaltyCardColor: '#1A1040',
      loyaltyStampColor: '#FFAB76',
      loyaltyStampIcon: 'coffee',
    });
    // Google se salta a propósito: "configurar más tarde" es una salida válida.
    await onboarding.saveNotifications(userId, {
      remindNearReward: true,
      reactivateInactive: false,
    });
    const state = await onboarding.getState(userId);
    await onboarding.complete(userId);
    return state;
  }

  it('el cliente que escanea el QR ve EXACTAMENTE el programa que configuró el dueño', async () => {
    const state = await runWizard({ welcome: true });
    const token = state.checkinToken;
    expect(token).toBeTruthy();

    // ── El cliente anónimo abre el QR ──────────────────────────────────────
    const landing = await checkin.resolveLanding(token!);
    expect(landing.business.businessName).toBe('Café Smoke');
    // La tarjeta que diseñó en el paso 4 llega tal cual al cliente.
    expect(landing.business.loyaltyCardColor).toBe('#1A1040');
    expect(landing.business.loyaltyStampColor).toBe('#FFAB76');
    expect(landing.business.loyaltyStampIcon).toBe('coffee');
    // Saltó Google, así que no hay ficha que ofrecer.
    expect(landing.business.googleBusinessProfileUrl).toBeNull();
    // Y la vista pública no filtra el id interno del tenant.
    expect(JSON.stringify(landing)).not.toContain(state.businessId!);

    // ── Se registra ───────────────────────────────────────────────────────
    const phone = `+59891${String(Date.now()).slice(-6)}`;
    const registered = await checkin.register(token!, {
      name: 'Cliente Smoke',
      phone,
    });
    expect(registered).toBeTruthy();

    const customer = await prisma.customer.findFirstOrThrow({
      where: { businessId: state.businessId!, phoneE164: phone },
    });

    // ── Quedó la visita ───────────────────────────────────────────────────
    const visits = await prisma.visit.count({
      where: { businessId: state.businessId!, customerId: customer.id },
    });
    expect(visits).toBe(1);

    // ── Y la tarjeta de sellos dice lo que el dueño configuró ─────────────
    // `currentView` es lectura pura del goal ya persistido: es literalmente
    // lo que el cliente ve al refrescar su tarjeta.
    const view = await rewardGoals.currentView(state.businessId!, customer.id);
    expect(view.goal).not.toBeNull();
    // 5 sellos, como se eligió en el paso 2 — el override del negocio le gana
    // al rango por segmento.
    expect(view.goal!.targetAdditionalVisits).toBe(5);
    expect(view.goal!.incentiveName).toBe('Café gratis');
    // La visita de arranque no cuenta como sello: el contador arranca en 0.
    expect(view.goal!.progressVisits).toBe(0);
    expect(view.goal!.remainingVisits).toBe(5);

    // ── El regalo de bienvenida se entregó ────────────────────────────────
    const welcome = await prisma.benefitParticipation.findFirst({
      where: { businessId: state.businessId!, customerId: customer.id },
      include: { benefit: { select: { title: true } } },
    });
    expect(welcome?.benefit.title).toBe('Medialuna de bienvenida');
  });

  it('sin regalo de bienvenida, el cliente se registra igual y no recibe nada de más', async () => {
    const state = await runWizard({ welcome: false });

    const phone = `+59892${String(Date.now()).slice(-6)}`;
    await checkin.register(state.checkinToken!, {
      name: 'Cliente Sin Regalo',
      phone,
    });

    const customer = await prisma.customer.findFirstOrThrow({
      where: { businessId: state.businessId!, phoneE164: phone },
    });

    const view = await rewardGoals.currentView(state.businessId!, customer.id);
    expect(view.goal).not.toBeNull();
    expect(view.goal!.targetAdditionalVisits).toBe(5);

    expect(
      await prisma.benefitParticipation.count({
        where: { businessId: state.businessId!, customerId: customer.id },
      }),
    ).toBe(0);
  });

  it('GUARD: el dueño que ya terminó no tiene borrador — /comenzar lo manda al panel', async () => {
    await runWizard({ welcome: false });

    // Es lo que consulta `(onboarding)/comenzar/page.tsx` para decidir.
    const state = await onboarding.getState(userId);
    expect(state.businessId).toBeNull();

    // Y volver a entrar no puede crear un segundo negocio a sus espaldas.
    expect(
      await prisma.business.count({
        where: { memberships: { some: { userId } } },
      }),
    ).toBe(1);
  });

  it('GUARD: el empleado invitado NUNCA entra al onboarding', async () => {
    const state = await runWizard({ welcome: false });

    const employee = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: `emp-${randomUUID().slice(0, 8)}@test.local`,
        passwordHash: 'x',
        firstName: 'Empleado',
        lastName: 'Smoke',
      },
    });
    await prisma.membership.create({
      data: {
        userId: employee.id,
        businessId: state.businessId!,
        role: MembershipRole.OPERATOR,
        status: MembershipStatus.ACTIVE,
      },
    });

    try {
      // Sin borrador propio: el guard de `/comenzar` lo manda al panel...
      expect((await onboarding.getState(employee.id)).businessId).toBeNull();

      // ...y aunque llegara a la API a mano, no puede tocar el negocio ajeno.
      await expect(
        onboarding.saveProgram(employee.id, {
          rewardTitle: 'Hackeo',
          stampsRequired: 1,
        }),
      ).rejects.toThrow();

      // El programa del dueño quedó intacto.
      const settings = await prisma.retentionSettings.findUniqueOrThrow({
        where: { businessId: state.businessId! },
      });
      expect(settings.rewardGoalMinVisits).toBe(5);
    } finally {
      await prisma.membership.deleteMany({ where: { userId: employee.id } });
      await prisma.user.delete({ where: { id: employee.id } });
    }
  });

  it('COMPLETE idempotente: reintentar después de terminar no rompe ni duplica', async () => {
    await runWizard({ welcome: false });

    const first = await onboarding.complete(userId);
    const second = await onboarding.complete(userId);
    expect(second.businessId).toBe(first.businessId);
    expect(second.completed).toBe(true);

    expect(
      await prisma.business.count({
        where: { memberships: { some: { userId } } },
      }),
    ).toBe(1);
  });
});
