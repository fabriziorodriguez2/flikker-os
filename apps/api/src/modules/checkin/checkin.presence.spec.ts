import { BadRequestException } from '@nestjs/common';
import { CheckinPresenceMode } from '@prisma/client';
import { CheckinService } from './checkin.service';
import { PresenceChallengeService } from './presence-challenge.service';
import { currentPresenceChallenge } from './presence-challenge';
import { evaluateDedup } from './checkin.rules';

/**
 * Prueba de presencia, de punta a punta del servicio.
 *
 * Cada test de este archivo corresponde a uno de los escenarios que había
 * que demostrar:
 *
 *   escaneo válido en el local             → crea Visit
 *   refresh inmediato                      → no duplica
 *   URL guardada, abierta al día siguiente → NO crea Visit
 *   código vencido                         → NO crea Visit
 *   replay del mismo desafío               → NO crea Visit
 *   negocio sin la exigencia prendida      → nada cambia
 */

const SECRET = 'x'.repeat(48);
const BIZ = 'biz-1';
const NOW = new Date('2026-08-24T15:00:00.000Z');

function makeDeps() {
  const prisma = {
    customer: { findFirst: jest.fn(), create: jest.fn() },
    business: { findFirst: jest.fn() },
    googleReview: { findFirst: jest.fn().mockResolvedValue(null) },
    customerEvent: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const sources = {
    findByToken: jest.fn(),
    bumpScan: jest.fn().mockResolvedValue(undefined),
  };
  const visits = {
    registerVisit: jest.fn().mockResolvedValue({
      created: true,
      visit: { id: 'v-1', attributionType: 'organic' },
      isReturn: true,
    }),
    countByCustomer: jest.fn().mockResolvedValue(2),
    findLastByCustomer: jest.fn().mockResolvedValue({
      id: 'v-0',
      occurredAt: new Date('2026-08-20T15:00:00.000Z'),
    }),
  };
  const sessions = {
    issue: jest.fn().mockResolvedValue({
      rawToken: 'raw',
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
    }),
    resolveLive: jest
      .fn()
      .mockResolvedValue({ businessId: BIZ, customerId: 'cust-1' }),
    revoke: jest.fn(),
  };
  const verifications = { start: jest.fn(), verify: jest.fn() };
  const events = { emit: jest.fn().mockResolvedValue(undefined) };
  const benefits = {
    resolveActiveBenefit: jest.fn().mockResolvedValue(null),
    grantWelcomeGift: jest.fn().mockResolvedValue(null),
    getWelcomeGiftState: jest.fn().mockResolvedValue(null),
    registerParticipation: jest.fn().mockResolvedValue(undefined),
    isRedeemable: jest.fn().mockReturnValue(false),
    // Dep de main (beneficios otorgados por promoción manual): irrelevante
    // para la prueba de presencia, pero `buildPersonalSpace` la llama.
    getOtherAvailableBenefits: jest.fn().mockResolvedValue([]),
  };
  const messaging = {
    sendWelcome: jest.fn(),
    sendOwnerNotification: jest.fn(),
    enqueueReviewRequest: jest.fn(),
    sendVerificationCode: jest.fn(),
  };
  const returnChallenges = {
    completeForVisit: jest.fn().mockResolvedValue({ status: 'none' }),
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
  const rewardGoalFeedback = { submit: jest.fn() };
  // Dep de main (envío único del link de "Mi Flikker"): irrelevante para la
  // prueba de presencia, pero el servicio la exige.
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
    returnChallenges,
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
    deps.returnChallenges as never,
    deps.rewardGoalFeedback as never,
    deps.flikkerAccount as never,
    new PresenceChallengeService(deps.prisma as never),
  );
}

const source = {
  id: 'src-1',
  name: 'Principal',
  type: 'qr',
  isActive: true,
  businessId: BIZ,
  business: { id: BIZ, isActive: true, experienceVersion: 'CHECKIN_V2' },
};

function businessWith(mode: CheckinPresenceMode) {
  return {
    id: BIZ,
    name: 'Cafe Uno',
    logoUrl: null,
    primaryColor: null,
    googleBusinessProfileUrl: null,
    phone: null,
    timezone: 'America/Montevideo',
    checkinMinHoursBetweenVisits: 8,
    checkinMaxVisitsPerDay: 1,
    checkinReviewPromptEveryDays: 30,
    experienceVersion: 'CHECKIN_V2',
    checkinPresenceMode: mode,
  };
}

function setUp(mode: CheckinPresenceMode) {
  const deps = makeDeps();
  deps.sources.findByToken.mockResolvedValue(source);
  deps.prisma.business.findFirst.mockResolvedValue(businessWith(mode));
  deps.prisma.customer.findFirst.mockResolvedValue({
    id: 'cust-1',
    name: 'Ana',
  });
  return { deps, service: makeService(deps) };
}

/** El codigo real que el mostrador esta mostrando en ese instante. */
function codeNow(now = new Date()) {
  return currentPresenceChallenge(SECRET, BIZ, now).code;
}

describe('check-in con prueba de presencia', () => {
  const ORIGINAL = process.env.CHECKIN_PRESENCE_SECRET;

  beforeEach(() => {
    process.env.CHECKIN_PRESENCE_SECRET = SECRET;
  });
  afterAll(() => {
    if (ORIGINAL === undefined) delete process.env.CHECKIN_PRESENCE_SECRET;
    else process.env.CHECKIN_PRESENCE_SECRET = ORIGINAL;
  });

  // -- Escenario: escaneo valido en el local ------------------------------
  it('escaneo valido con el codigo del local crea Visit', async () => {
    const { deps, service } = setUp(CheckinPresenceMode.rotating_code);

    const result = await service.checkin('tok', 'raw', codeNow());

    expect(result.status).toBe('checked_in');
    expect(deps.visits.registerVisit).toHaveBeenCalledTimes(1);
    // La Visit queda anclada al desafio: eso es lo que bloquea el replay.
    expect(
      deps.visits.registerVisit.mock.calls[0][0].presenceChallengeId,
    ).toBeTruthy();
  });

  // -- Escenario: URL guardada, abierta otro dia --------------------------
  it('abrir la URL guardada sin codigo NO crea Visit', async () => {
    const { deps, service } = setUp(CheckinPresenceMode.rotating_code);

    await expect(
      service.checkin('tok', 'raw', undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deps.visits.registerVisit).not.toHaveBeenCalled();
  });

  it('el codigo de ayer, guardado, NO crea Visit hoy', async () => {
    const { deps, service } = setUp(CheckinPresenceMode.rotating_code);
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);

    await expect(
      service.checkin('tok', 'raw', codeNow(yesterday)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deps.visits.registerVisit).not.toHaveBeenCalled();
  });

  // -- Escenario: codigo vencido / inventado ------------------------------
  it('codigo inventado NO crea Visit', async () => {
    const { deps, service } = setUp(CheckinPresenceMode.rotating_code);

    await expect(
      service.checkin('tok', 'raw', 'ZZZZZZ'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(deps.visits.registerVisit).not.toHaveBeenCalled();
  });

  it('el rechazo no distingue sin-codigo de codigo-vencido', async () => {
    const { service } = setUp(CheckinPresenceMode.rotating_code);
    const yesterday = new Date(Date.now() - 24 * 3600 * 1000);

    const rejectionOf = async (code?: string) => {
      try {
        await service.checkin('tok', 'raw', code);
        throw new Error('esperaba un rechazo');
      } catch (error) {
        return (error as BadRequestException).getResponse();
      }
    };

    expect(await rejectionOf(undefined)).toEqual(
      await rejectionOf(codeNow(yesterday)),
    );
  });

  // -- Escenario: replay del mismo desafio --------------------------------
  it('replay del mismo desafio NO crea una segunda Visit', async () => {
    const { deps, service } = setUp(CheckinPresenceMode.rotating_code);
    const code = codeNow();

    await service.checkin('tok', 'raw', code);

    // El repositorio reconoce el desafio ya usado (indice unico
    // businessId + customerId + presenceChallengeId).
    deps.visits.registerVisit.mockResolvedValueOnce({
      created: false,
      reason: 'presence_replay',
      lastVisitAt: NOW,
    });

    const second = await service.checkin('tok', 'raw', code);
    expect(second.status).toBe('duplicate');
    expect(second.duplicateReason).toBe('presence_replay');
  });

  // -- Escenario: las tres puertas estan cerradas -------------------------
  it('registro y recuperacion exigen la misma prueba que el check-in', async () => {
    const { deps, service } = setUp(CheckinPresenceMode.rotating_code);
    deps.prisma.customer.findFirst.mockResolvedValue(null);

    await expect(
      service.register('tok', { name: 'Ana', phone: '099111222' }, 'ua'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.recoverVerify('tok', '099111222', '123456', 'ua'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(deps.prisma.customer.create).not.toHaveBeenCalled();
    expect(deps.visits.registerVisit).not.toHaveBeenCalled();
  });

  // -- Escenario: nada cambia para quien no lo prendio --------------------
  it('con checkinPresenceMode off el check-in funciona igual que siempre', async () => {
    const { deps, service } = setUp(CheckinPresenceMode.off);

    const result = await service.checkin('tok', 'raw');

    expect(result.status).toBe('checked_in');
    expect(
      deps.visits.registerVisit.mock.calls[0][0].presenceChallengeId,
    ).toBeNull();
  });

  it('la landing dice si hay que pedir el codigo, pero NUNCA el codigo', async () => {
    const { service } = setUp(CheckinPresenceMode.rotating_code);

    const landing = (await service.resolveLanding('tok')) as Record<
      string,
      unknown
    >;

    expect(landing.presence).toEqual({
      required: true,
      mode: CheckinPresenceMode.rotating_code,
    });
    expect(JSON.stringify(landing)).not.toContain(codeNow());
  });

  it('sin secreto de servidor no se finge la proteccion: queda como off', async () => {
    delete process.env.CHECKIN_PRESENCE_SECRET;
    const originalJwt = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    try {
      const { deps, service } = setUp(CheckinPresenceMode.rotating_code);
      const result = await service.checkin('tok', 'raw');
      expect(result.status).toBe('checked_in');
      expect(
        deps.visits.registerVisit.mock.calls[0][0].presenceChallengeId,
      ).toBeNull();
    } finally {
      if (originalJwt !== undefined) process.env.JWT_SECRET = originalJwt;
    }
  });
});

describe('el dedup actual NO resuelve el replay diario', () => {
  /**
   * Este test existe para que la limitacion quede escrita, no escondida: el
   * dedup es una defensa contra el doble escaneo del mismo dia, y por diseno
   * PERMITE una visita nueva cada dia. Es exactamente el agujero que la
   * prueba de presencia cierra, y por eso no se lo puede tratar como si ya
   * lo cerrara.
   */
  it('permite una visita nueva al dia siguiente, venga de donde venga', () => {
    const yesterday = new Date('2026-08-23T15:00:00.000Z');
    expect(
      evaluateDedup({
        lastVisitAt: yesterday,
        visitsToday: 0,
        now: NOW,
        minHoursBetweenVisits: 8,
        maxVisitsPerDay: 1,
      }),
    ).toEqual({ allowed: true });
  });

  it('si bloquea el refresh inmediato — sigue siendo la defensa correcta para eso', () => {
    expect(
      evaluateDedup({
        lastVisitAt: new Date(NOW.getTime() - 60_000),
        visitsToday: 1,
        now: NOW,
        minHoursBetweenVisits: 8,
        maxVisitsPerDay: 1,
      }),
    ).toEqual({ allowed: false, reason: 'min_hours' });
  });
});
