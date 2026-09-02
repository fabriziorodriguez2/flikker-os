import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { VisitAttributionType } from '@prisma/client';
import { CheckinService } from './checkin.service';
import { PresenceChallengeService } from './presence-challenge.service';

function makeDeps() {
  const prisma = {
    customer: { findFirst: jest.fn(), create: jest.fn() },
    business: { findFirst: jest.fn() },
    googleReview: { findFirst: jest.fn().mockResolvedValue(null) },
    customerEvent: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const sources = { findByToken: jest.fn(), bumpScan: jest.fn() };
  const visits = {
    registerVisit: jest.fn(),
    countByCustomer: jest.fn().mockResolvedValue(1),
    findLastByCustomer: jest
      .fn()
      .mockResolvedValue({ occurredAt: new Date('2026-08-01T18:00:00Z') }),
  };
  const sessions = {
    issue: jest.fn(),
    resolveLive: jest.fn(),
    revoke: jest.fn(),
  };
  const verifications = { start: jest.fn(), verify: jest.fn() };
  const events = { emit: jest.fn().mockResolvedValue(undefined) };
  const benefits = {
    resolveActiveBenefit: jest.fn().mockResolvedValue(null),
    grantWelcomeGift: jest.fn().mockResolvedValue(null),
    getWelcomeGiftState: jest.fn().mockResolvedValue(null),
    getOtherAvailableBenefits: jest.fn().mockResolvedValue([]),
    registerParticipation: jest.fn().mockResolvedValue(undefined),
  };
  const messaging = {
    sendWelcome: jest.fn(),
    sendOwnerNotification: jest.fn(),
    enqueueReviewRequest: jest.fn(),
    sendVerificationCode: jest.fn(),
  };
  const missions = {
    afterVisit: jest.fn().mockResolvedValue([]),
    currentView: jest.fn().mockResolvedValue([]),
  };
  const rewardGoals = {
    afterVisit: jest
      .fn()
      .mockResolvedValue({ goal: null, unlockedNow: false, benefit: null }),
    currentView: jest
      .fn()
      .mockResolvedValue({ goal: null, unlockedNow: false, benefit: null }),
  };
  const rewardGoalFeedback = {
    submit: jest.fn().mockResolvedValue({
      alreadySubmitted: false,
      bonusGranted: false,
      offerGoogle: false,
      rewardGoal: { goal: null, unlockedNow: false, benefit: null },
    }),
  };
  const flikkerAccount = {
    claimWelcomeLink: jest.fn().mockResolvedValue(null),
    releaseWelcomeLink: jest.fn().mockResolvedValue(undefined),
  };
  return {
    prisma,
    sources,
    visits,
    sessions,
    verifications,
    events,
    benefits,
    messaging,
    rewardGoals,
    missions,
    rewardGoalFeedback,
    flikkerAccount,
  };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new CheckinService(
    deps.prisma as never,
    deps.sources as never,
    deps.visits as never,
    deps.sessions as never,
    deps.verifications as never,
    deps.events as never,
    deps.benefits as never,
    deps.messaging as never,
    deps.rewardGoals as never,
    deps.missions as never,
    deps.rewardGoalFeedback as never,
    deps.flikkerAccount as never,
    // Servicio real, no un mock: estos negocios estan en
    // checkinPresenceMode off, asi que la puerta de presencia es
    // transparente — que es exactamente lo que estos tests deben seguir
    // demostrando.
    new PresenceChallengeService(deps.prisma as never),
  );
}

const activeSource = {
  id: 'src-1',
  name: 'Principal',
  type: 'qr',
  isActive: true,
  businessId: 'biz-1',
  business: { id: 'biz-1', isActive: true, experienceVersion: 'CHECKIN_V2' },
};

const fullBusiness = {
  id: 'biz-1',
  name: 'Café Uno',
  logoUrl: null,
  primaryColor: null,
  googleBusinessProfileUrl: 'https://g.page/cafe',
  phone: '+59899000000',
  timezone: 'America/Montevideo',
  checkinMinHoursBetweenVisits: 8,
  checkinMaxVisitsPerDay: 1,
  checkinReviewPromptEveryDays: 30,
  experienceVersion: 'CHECKIN_V2',
};

describe('CheckinService', () => {
  it('register: an existing phone does NOT create a session — routes to verification', async () => {
    const deps = makeDeps();
    deps.sources.findByToken.mockResolvedValue(activeSource);
    deps.prisma.business.findFirst.mockResolvedValue(fullBusiness);
    deps.prisma.customer.findFirst.mockResolvedValue({ id: 'existing' });
    const service = makeService(deps);

    const result = await service.register(
      'tok',
      { name: 'Ana', phone: '099111222' },
      'ua',
    );

    expect(result).toEqual({ status: 'exists', requiresVerification: true });
    expect(deps.prisma.customer.create).not.toHaveBeenCalled();
    expect(deps.sessions.issue).not.toHaveBeenCalled();
    expect(deps.visits.registerVisit).not.toHaveBeenCalled();
  });

  it('register: a new phone creates the customer, first visit, and a session', async () => {
    const deps = makeDeps();
    deps.sources.findByToken.mockResolvedValue(activeSource);
    deps.prisma.business.findFirst.mockResolvedValue(fullBusiness);
    // 1st findFirst (new-phone check) → null; later (buildPersonalSpace) → customer
    deps.prisma.customer.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 'cust-1', name: 'Ana' });
    deps.prisma.customer.create.mockResolvedValue({
      id: 'cust-1',
      name: 'Ana',
    });
    deps.visits.registerVisit.mockResolvedValue({
      created: true,
      isReturn: false,
      visit: { id: 'v-1', attributionType: VisitAttributionType.organic },
    });
    deps.sessions.issue.mockResolvedValue({
      rawToken: 'raw-token',
      expiresAt: new Date('2027-01-01T00:00:00Z'),
    });
    const service = makeService(deps);

    const result = await service.register(
      'tok',
      { name: 'Ana', phone: '099111222' },
      'ua',
    );

    expect(deps.prisma.customer.create).toHaveBeenCalledTimes(1);
    expect(deps.visits.registerVisit).toHaveBeenCalledTimes(1);
    // First visit must not run campaign attribution.
    expect(deps.visits.registerVisit.mock.calls[0][0]).toMatchObject({
      attribute: false,
    });
    expect(deps.messaging.enqueueReviewRequest).toHaveBeenCalledWith(
      'biz-1',
      'cust-1',
      null,
      // El recordatorio queda atado a ESTA visita, no al cliente: dentro de
      // una hora se pregunta por `v-1`, aunque el cliente haya vuelto.
      'v-1',
    );
    expect(result).toMatchObject({
      status: 'registered',
      sessionToken: 'raw-token',
    });
    if (result.status !== 'registered') throw new Error('expected registered');
    expect(result.personal.reviewPrompt.show).toBe(true);
  });

  it('register: evaluates reward goals after a real first visit, and the review prompt is unaffected (Fase E §16)', async () => {
    const deps = makeDeps();
    deps.sources.findByToken.mockResolvedValue(activeSource);
    deps.prisma.business.findFirst.mockResolvedValue(fullBusiness);
    deps.prisma.customer.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 'cust-1', name: 'Ana' });
    deps.prisma.customer.create.mockResolvedValue({
      id: 'cust-1',
      name: 'Ana',
    });
    const firstVisitOccurredAt = new Date('2026-09-01T10:00:00.000Z');
    deps.visits.registerVisit.mockResolvedValue({
      created: true,
      isReturn: false,
      visit: {
        id: 'v-1',
        attributionType: VisitAttributionType.organic,
        occurredAt: firstVisitOccurredAt,
      },
    });
    deps.sessions.issue.mockResolvedValue({
      rawToken: 'raw-token',
      expiresAt: new Date('2027-01-01T00:00:00Z'),
    });
    deps.rewardGoals.afterVisit.mockResolvedValue({
      goal: {
        incentiveName: 'Upgrade gratis',
        progressVisits: 0,
        targetAdditionalVisits: 1,
        remainingVisits: 1,
      },
      unlockedNow: false,
      benefit: null,
    });
    const service = makeService(deps);

    const result = await service.register(
      'tok',
      { name: 'Ana', phone: '099111222' },
      'ua',
    );

    // El 4to argumento es el `occurredAt` REAL de la visita fundadora — nunca
    // un `new Date()` tomado después de los `await` de mensajería/sesión/
    // regalo de bienvenida (bug real corregido: eso hacía que la fundadora
    // siempre quedara excluida de su propio conteo de progreso).
    expect(deps.rewardGoals.afterVisit).toHaveBeenCalledWith(
      'biz-1',
      'cust-1',
      'America/Montevideo',
      firstVisitOccurredAt,
    );
    expect(deps.rewardGoals.currentView).not.toHaveBeenCalled();
    if (result.status !== 'registered') throw new Error('expected registered');
    expect(result.personal.rewardGoal.goal?.remainingVisits).toBe(1);
    // The review request is untouched by the presence of a reward goal.
    expect(result.personal.reviewPrompt.show).toBe(true);
    expect(deps.messaging.enqueueReviewRequest).toHaveBeenCalledWith(
      'biz-1',
      'cust-1',
      null,
      // El recordatorio queda atado a ESTA visita, no al cliente: dentro de
      // una hora se pregunta por `v-1`, aunque el cliente haya vuelto.
      'v-1',
    );
  });

  it('checkin: a dedup-prevented duplicate reads current reward progress, never re-evaluates unlock/creation', async () => {
    const deps = makeDeps();
    deps.sources.findByToken.mockResolvedValue(activeSource);
    deps.prisma.business.findFirst.mockResolvedValue(fullBusiness);
    deps.sessions.resolveLive.mockResolvedValue({
      businessId: 'biz-1',
      customerId: 'cust-1',
    });
    deps.prisma.customer.findFirst.mockResolvedValue({
      id: 'cust-1',
      name: 'Ana',
    });
    deps.visits.registerVisit.mockResolvedValue({
      created: false,
      reason: 'min_hours',
      lastVisitAt: new Date('2026-08-01T12:00:00Z'),
    });
    const service = makeService(deps);

    await service.checkin('tok', 'session-token');

    expect(deps.rewardGoals.currentView).toHaveBeenCalledWith(
      'biz-1',
      'cust-1',
    );
    expect(deps.rewardGoals.afterVisit).not.toHaveBeenCalled();
  });

  it('checkin: without a valid session throws Unauthorized (web shows the form)', async () => {
    const deps = makeDeps();
    deps.sources.findByToken.mockResolvedValue(activeSource);
    deps.prisma.business.findFirst.mockResolvedValue(fullBusiness);
    deps.sessions.resolveLive.mockResolvedValue(null);
    const service = makeService(deps);

    await expect(service.checkin('tok', undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(deps.visits.registerVisit).not.toHaveBeenCalled();
  });

  it('recoverStart: unknown phone still responds sent:true but sends no code', async () => {
    const deps = makeDeps();
    deps.sources.findByToken.mockResolvedValue(activeSource);
    deps.prisma.business.findFirst.mockResolvedValue(fullBusiness);
    deps.prisma.customer.findFirst.mockResolvedValue(null);
    const service = makeService(deps);

    const result = await service.recoverStart('tok', '099111222');

    expect(result).toEqual({ sent: true });
    expect(deps.verifications.start).not.toHaveBeenCalled();
    expect(deps.messaging.sendVerificationCode).not.toHaveBeenCalled();
  });

  it('recoverVerify: a wrong code throws Unauthorized and issues no session', async () => {
    const deps = makeDeps();
    deps.sources.findByToken.mockResolvedValue(activeSource);
    deps.prisma.business.findFirst.mockResolvedValue(fullBusiness);
    deps.prisma.customer.findFirst.mockResolvedValue({
      id: 'cust-1',
      name: 'Ana',
    });
    deps.verifications.verify.mockResolvedValue(false);
    const service = makeService(deps);

    await expect(
      service.recoverVerify('tok', '099111222', '000000'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(deps.sessions.issue).not.toHaveBeenCalled();
    expect(deps.visits.registerVisit).not.toHaveBeenCalled();
  });

  it('emitClientEvent: rejects an event type outside the whitelist', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await expect(
      service.emitClientEvent('tok', 'visit_created', 'sess'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

/**
 * Bug real (caso David García, +598 92 216 861): en su primera registración
 * recibió el saludo SIN link a Mi Flikker. Causa confirmada en los logs de
 * producción — el registro disparaba DOS WhatsApp al mismo cliente en
 * paralelo (`sendWelcome` + el welcome aparte de Mi Flikker) y WaSenderAPI,
 * que acepta 1 mensaje cada 5 segundos, rechazó el segundo con "account
 * protection". Encima `welcomeLinkSentAt` ya se había marcado ANTES de
 * enviar, así que la cuenta quedó como "welcome enviado" para siempre.
 */
describe('CheckinService — welcome de la primera registración (un solo WhatsApp, con link)', () => {
  function newRegistrationDeps() {
    const deps = makeDeps();
    deps.sources.findByToken.mockResolvedValue(activeSource);
    deps.prisma.business.findFirst.mockResolvedValue(fullBusiness);
    deps.prisma.customer.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValue({ id: 'cust-1', name: 'David' });
    deps.prisma.customer.create.mockResolvedValue({
      id: 'cust-1',
      name: 'David',
    });
    deps.visits.registerVisit.mockResolvedValue({
      created: true,
      isReturn: false,
      visit: {
        id: 'v-1',
        attributionType: VisitAttributionType.organic,
        occurredAt: new Date('2026-09-01T00:20:08.425Z'),
      },
    });
    deps.sessions.issue.mockResolvedValue({
      rawToken: 'raw-token',
      expiresAt: new Date('2027-01-01T00:00:00Z'),
    });
    return deps;
  }

  /** El welcome sale en una cadena fire-and-forget: hay que dejarla correr. */
  const flushOutbound = () => new Promise((resolve) => setImmediate(resolve));

  it('cliente nuevo: el welcome se manda UNA vez y lleva el link de Mi Flikker', async () => {
    const deps = newRegistrationDeps();
    deps.flikkerAccount.claimWelcomeLink.mockResolvedValue(
      'https://flikker.site/mi',
    );
    deps.messaging.sendWelcome.mockResolvedValue(true);
    const service = makeService(deps);

    await service.register('tok', { name: 'David', phone: '092216861' }, 'ua');
    await flushOutbound();

    expect(deps.messaging.sendWelcome).toHaveBeenCalledTimes(1);
    const args = deps.messaging.sendWelcome.mock.calls[0];
    expect(args[0]).toBe('+59892216861');
    // El link viaja como argumento del MISMO mensaje.
    expect(args[5]).toBe('https://flikker.site/mi');
    expect(args[5]).toContain('/mi');
    // Y nunca se libera un reclamo que sí se entregó.
    expect(deps.flikkerAccount.releaseWelcomeLink).not.toHaveBeenCalled();
  });

  it('no existe un segundo welcome: el único envío al cliente es sendWelcome', async () => {
    const deps = newRegistrationDeps();
    deps.flikkerAccount.claimWelcomeLink.mockResolvedValue(
      'https://flikker.site/mi',
    );
    deps.messaging.sendWelcome.mockResolvedValue(true);
    const service = makeService(deps);

    await service.register('tok', { name: 'David', phone: '092216861' }, 'ua');
    await flushOutbound();

    // El servicio de mensajería ya no expone ningún otro welcome al cliente.
    expect(
      (deps.messaging as Record<string, unknown>).sendMiFlikkerWelcome,
    ).toBeUndefined();
    expect(deps.messaging.sendWelcome).toHaveBeenCalledTimes(1);
  });

  it('el link sale de APP_PUBLIC_URL — el check-in nunca lo arma a mano', async () => {
    const deps = newRegistrationDeps();
    deps.messaging.sendWelcome.mockResolvedValue(true);
    const service = makeService(deps);

    await service.register('tok', { name: 'David', phone: '092216861' }, 'ua');
    await flushOutbound();

    // El único origen posible del link es `claimWelcomeLink`, que lo arma con
    // `buildMiFlikkerLink()` (APP_PUBLIC_URL). Acá devuelve null y el welcome
    // sale sin link — nunca con una URL inventada por el check-in.
    expect(deps.flikkerAccount.claimWelcomeLink).toHaveBeenCalledWith(
      '+59892216861',
    );
    expect(deps.messaging.sendWelcome.mock.calls[0][5]).toBeNull();
  });

  it('segunda visita del mismo teléfono: no repite el welcome ni el link', async () => {
    const deps = newRegistrationDeps();
    // El teléfono ya recibió el link antes → el reclamo se pierde.
    deps.flikkerAccount.claimWelcomeLink.mockResolvedValue(null);
    deps.messaging.sendWelcome.mockResolvedValue(true);
    const service = makeService(deps);

    await service.register('tok', { name: 'David', phone: '092216861' }, 'ua');
    await flushOutbound();

    expect(deps.messaging.sendWelcome.mock.calls[0][5]).toBeNull();
    expect(deps.flikkerAccount.releaseWelcomeLink).not.toHaveBeenCalled();
  });

  it('si el proveedor rechaza el envío, el welcome NO queda marcado como enviado', async () => {
    const deps = newRegistrationDeps();
    deps.flikkerAccount.claimWelcomeLink.mockResolvedValue(
      'https://flikker.site/mi',
    );
    // Exactamente lo que devolvió WaSenderAPI en el caso real.
    deps.messaging.sendWelcome.mockResolvedValue(false);
    const service = makeService(deps);

    await service.register('tok', { name: 'David', phone: '092216861' }, 'ua');
    await flushOutbound();

    // Se devuelve el reclamo para que el próximo registro lo reintente.
    expect(deps.flikkerAccount.releaseWelcomeLink).toHaveBeenCalledWith(
      '+59892216861',
    );
  });

  it('el ping al dueño no compite con el welcome del cliente en la misma ventana', async () => {
    const deps = newRegistrationDeps();
    deps.flikkerAccount.claimWelcomeLink.mockResolvedValue(
      'https://flikker.site/mi',
    );
    deps.messaging.sendWelcome.mockResolvedValue(true);
    const service = makeService(deps);

    await service.register('tok', { name: 'David', phone: '092216861' }, 'ua');
    await flushOutbound();

    // El welcome del cliente ya salió; el del dueño espera el piso del
    // proveedor, así que todavía no.
    expect(deps.messaging.sendWelcome).toHaveBeenCalledTimes(1);
    expect(deps.messaging.sendOwnerNotification).not.toHaveBeenCalled();
  });
});
