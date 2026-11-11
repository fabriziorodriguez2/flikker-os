import { Prisma } from '@prisma/client';
import { OwnerLifecycleEmailsService } from './owner-lifecycle-emails.service';
import { OwnerLifecycleEmailLogService } from './owner-lifecycle-email-log.service';

const MS_PER_DAY = 86_400_000;
const TZ = 'America/Montevideo';

function emptyFunnel() {
  return {
    overall: {
      contacted: 0,
      returned: 0,
      recoveryRate: 0,
      averageDaysToReturn: null,
      evidenceState: 'INSUFFICIENT_DATA' as const,
    },
    byArm: null,
  };
}

function emptyWindow() {
  return {
    customersIdentified: 0,
    customersReturned: 0,
    customersReturnedAfterContact: 0,
    benefitsRedeemed: 0,
    newReviews: 0,
  };
}

function business(
  overrides: Partial<{
    id: string;
    name: string;
    timezone: string;
    onboardingCompletedAt: Date | null;
    benefitsTrialStartedAt: Date | null;
    benefitsTrialEndsAt: Date | null;
  }> = {},
) {
  return {
    id: 'biz-1',
    name: 'Café Test',
    timezone: TZ,
    onboardingCompletedAt: null,
    benefitsTrialStartedAt: null,
    benefitsTrialEndsAt: null,
    ...overrides,
  };
}

/** Fake real (no un stub aparte) del log service, con Prisma en memoria — ejercita la idempotencia real. */
function makeFakeLog() {
  const rows = new Map<string, true>();
  const send = jest.fn().mockResolvedValue({});
  const prisma = {
    ownerLifecycleEmailLog: {
      create: jest.fn(
        ({
          data,
        }: {
          data: { businessId: string; kind: string; dedupeKey: string };
        }) => {
          const key = `${data.businessId}:${data.kind}:${data.dedupeKey}`;
          if (rows.has(key)) {
            throw new Prisma.PrismaClientKnownRequestError('duplicate', {
              code: 'P2002',
              clientVersion: 'test',
            });
          }
          rows.set(key, true);
          return { id: key };
        },
      ),
      update: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(
        ({
          where,
        }: {
          where: {
            businessId_kind_dedupeKey: {
              businessId: string;
              kind: string;
              dedupeKey: string;
            };
          };
        }) => {
          const { businessId, kind, dedupeKey } =
            where.businessId_kind_dedupeKey;
          return rows.has(`${businessId}:${kind}:${dedupeKey}`)
            ? { id: 'x' }
            : null;
        },
      ),
    },
  };
  const email = { isAvailable: jest.fn().mockReturnValue(true), send };
  const whatsApp = {
    isChannelAvailable: jest.fn().mockResolvedValue(true),
    sendText: jest.fn().mockResolvedValue({ whatsappMessageId: 'wa-1' }),
  };
  const logService = new OwnerLifecycleEmailLogService(
    prisma as never,
    email as never,
    whatsApp as never,
  );
  return { logService, send };
}

function makeDeps() {
  const prisma = {
    business: { findMany: jest.fn() },
    membership: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { user: { email: 'owner@negocio.com', notificationEmail: null } },
        ]),
    },
    visit: {
      count: jest.fn().mockResolvedValue(0),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    benefitParticipation: { groupBy: jest.fn().mockResolvedValue([]) },
    benefit: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const plans = { isOnProPlan: jest.fn().mockResolvedValue(false) };
  const reactivationFunnel = {
    forBusiness: jest.fn().mockResolvedValue(emptyFunnel()),
  };
  const businessImpact = {
    getWindowMetrics: jest.fn().mockResolvedValue(emptyWindow()),
  };
  const aiSummary = { generate: jest.fn().mockResolvedValue(null) };
  const { logService, send } = makeFakeLog();

  return {
    prisma,
    plans,
    reactivationFunnel,
    businessImpact,
    aiSummary,
    logService,
    emailSend: send,
  };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new OwnerLifecycleEmailsService(
    deps.prisma as never,
    deps.plans as never,
    deps.reactivationFunnel as never,
    deps.businessImpact as never,
    deps.aiSummary as never,
    deps.logService,
  );
}

/** Un lunes 9am local (Montevideo, UTC-3) que no es día 1 del mes. */
const MONDAY_9AM = new Date('2026-08-17T12:00:00.000Z');
/** Un día 1 de mes a las 9am local, que no cae en lunes. */
const FIRST_OF_MONTH_9AM = new Date('2026-09-01T12:00:00.000Z');
/** Ni lunes 9am ni día 1 del mes — para tests que solo quieren un tick neutro. */
const NEUTRAL_TICK = new Date('2026-08-20T21:00:00.000Z'); // jueves 18:00 local

describe('OwnerLifecycleEmailsService — bienvenida automática', () => {
  it('usa el negocio y destinatario reales y no duplica entre barridos', async () => {
    const deps = makeDeps();
    deps.prisma.business.findMany.mockResolvedValue([
      business({
        name: 'Café Real',
        onboardingCompletedAt: new Date(NEUTRAL_TICK.getTime() - 30 * 60_000),
      }),
    ]);
    const service = makeService(deps);
    await service.runHourlySweep(NEUTRAL_TICK);
    await service.runHourlySweep(
      new Date(NEUTRAL_TICK.getTime() + 60 * 60_000),
    );
    expect(deps.emailSend).toHaveBeenCalledTimes(1);
    const [email] = deps.emailSend.mock.calls[0];
    expect(email.to).toEqual(['owner@negocio.com']);
    expect(email.subject).toBe('Bienvenido a Flikker 👋');
    expect(email.html).toContain('Café Real');
    expect(email.html).toContain('/dashboard');
    expect(deps.businessImpact.getWindowMetrics).not.toHaveBeenCalled();
  });

  it('cruzar medianoche no pierde la bienvenida', async () => {
    const deps = makeDeps();
    deps.prisma.business.findMany.mockResolvedValue([
      business({
        onboardingCompletedAt: new Date('2026-08-21T02:50:00Z'),
      }),
    ]);
    await makeService(deps).runHourlySweep(new Date('2026-08-21T03:10:00Z'));
    expect(deps.emailSend).toHaveBeenCalledTimes(1);
  });

  it('no envía bienvenidas retroactivas, ni para fechas futuras o onboarding incompleto', async () => {
    const deps = makeDeps();
    deps.prisma.business.findMany.mockResolvedValue([
      business({
        id: 'old',
        onboardingCompletedAt: new Date(NEUTRAL_TICK.getTime() - MS_PER_DAY),
      }),
      business({
        id: 'future',
        onboardingCompletedAt: new Date(NEUTRAL_TICK.getTime() + 60_000),
      }),
      business({ id: 'draft' }),
    ]);
    await makeService(deps).runHourlySweep(NEUTRAL_TICK);
    expect(deps.emailSend).not.toHaveBeenCalled();
  });
});

describe('OwnerLifecycleEmailsService — primera semana / primer mes (una sola vez)', () => {
  it('primera semana se manda exactamente al día 7, no al 6 ni al 8', async () => {
    const deps = makeDeps();
    deps.prisma.business.findMany.mockResolvedValue([
      business({
        onboardingCompletedAt: new Date(
          NEUTRAL_TICK.getTime() - 6 * MS_PER_DAY,
        ),
      }),
    ]);
    const service = makeService(deps);
    await service.runHourlySweep(NEUTRAL_TICK);
    expect(deps.emailSend).not.toHaveBeenCalled();

    deps.prisma.business.findMany.mockResolvedValue([
      business({
        onboardingCompletedAt: new Date(
          NEUTRAL_TICK.getTime() - 7 * MS_PER_DAY,
        ),
      }),
    ]);
    await service.runHourlySweep(NEUTRAL_TICK);
    expect(deps.emailSend).toHaveBeenCalledTimes(1);

    deps.prisma.business.findMany.mockResolvedValue([
      business({
        onboardingCompletedAt: new Date(
          NEUTRAL_TICK.getTime() - 8 * MS_PER_DAY,
        ),
      }),
    ]);
    await service.runHourlySweep(NEUTRAL_TICK);
    expect(deps.emailSend).toHaveBeenCalledTimes(1); // sigue en 1 — el día 8 no es candidato
  });

  it('un segundo sweep el mismo día 7 nunca duplica el envío', async () => {
    const deps = makeDeps();
    const biz = business({
      onboardingCompletedAt: new Date(NEUTRAL_TICK.getTime() - 7 * MS_PER_DAY),
    });
    deps.prisma.business.findMany.mockResolvedValue([biz]);
    const service = makeService(deps);

    await service.runHourlySweep(NEUTRAL_TICK);
    await service.runHourlySweep(NEUTRAL_TICK);

    expect(deps.emailSend).toHaveBeenCalledTimes(1);
  });

  it('primer mes se manda exactamente al día 30 desde la activación', async () => {
    const deps = makeDeps();
    deps.prisma.business.findMany.mockResolvedValue([
      business({
        onboardingCompletedAt: new Date(
          NEUTRAL_TICK.getTime() - 30 * MS_PER_DAY,
        ),
      }),
    ]);
    const service = makeService(deps);

    await service.runHourlySweep(NEUTRAL_TICK);

    expect(deps.emailSend).toHaveBeenCalledTimes(1);
    const [{ subject }] = deps.emailSend.mock.calls[0];
    expect(subject).toContain('primer mes');
  });
});

describe('OwnerLifecycleEmailsService — semanal / mensual (sin duplicar en el mismo período)', () => {
  it('el resumen semanal no duplica en la misma semana (mismo lunes)', async () => {
    const deps = makeDeps();
    deps.prisma.business.findMany.mockResolvedValue([business()]);
    const service = makeService(deps);

    await service.runHourlySweep(MONDAY_9AM);
    await service.runHourlySweep(MONDAY_9AM);

    expect(deps.emailSend).toHaveBeenCalledTimes(1);
  });

  it('el resumen mensual no duplica en el mismo mes', async () => {
    const deps = makeDeps();
    deps.prisma.business.findMany.mockResolvedValue([business()]);
    const service = makeService(deps);

    await service.runHourlySweep(FIRST_OF_MONTH_9AM);
    await service.runHourlySweep(FIRST_OF_MONTH_9AM);

    expect(deps.emailSend).toHaveBeenCalledTimes(1);
  });
});

describe('OwnerLifecycleEmailsService — trial por terminar nunca a un negocio Pro', () => {
  it('no manda el email ni ocupa el slot si el negocio ya es Pro de verdad', async () => {
    const deps = makeDeps();
    deps.plans.isOnProPlan.mockResolvedValue(true);
    deps.prisma.business.findMany.mockResolvedValue([
      business({
        benefitsTrialStartedAt: new Date(
          NEUTRAL_TICK.getTime() - 25 * MS_PER_DAY,
        ),
        benefitsTrialEndsAt: new Date(NEUTRAL_TICK.getTime() + 5 * MS_PER_DAY),
      }),
    ]);
    const service = makeService(deps);

    await service.runHourlySweep(NEUTRAL_TICK);

    expect(deps.emailSend).not.toHaveBeenCalled();
  });

  it('manda el aviso de 5 días si NO es Pro', async () => {
    const deps = makeDeps();
    deps.prisma.business.findMany.mockResolvedValue([
      business({
        benefitsTrialStartedAt: new Date(
          NEUTRAL_TICK.getTime() - 25 * MS_PER_DAY,
        ),
        benefitsTrialEndsAt: new Date(NEUTRAL_TICK.getTime() + 5 * MS_PER_DAY),
      }),
    ]);
    const service = makeService(deps);

    await service.runHourlySweep(NEUTRAL_TICK);

    expect(deps.emailSend).toHaveBeenCalledTimes(1);
    const [{ subject }] = deps.emailSend.mock.calls[0];
    expect(subject).toContain('5 días');
  });
});

describe('OwnerLifecycleEmailsService — arbitraje de prioridad', () => {
  it('con varios kinds due el mismo tick, manda solo el de mayor prioridad', async () => {
    const deps = makeDeps();
    // first_week (día 7) Y resumen mensual (día 1 del mes) due al mismo
    // tiempo — first_week es mayor prioridad.
    deps.prisma.business.findMany.mockResolvedValue([
      business({
        onboardingCompletedAt: new Date(
          FIRST_OF_MONTH_9AM.getTime() - 7 * MS_PER_DAY,
        ),
      }),
    ]);
    const service = makeService(deps);

    await service.runHourlySweep(FIRST_OF_MONTH_9AM);

    expect(deps.emailSend).toHaveBeenCalledTimes(1);
    const [{ subject }] = deps.emailSend.mock.calls[0];
    expect(subject).toBe('Tu primera semana con Flikker');
  });
});

describe('OwnerLifecycleEmailsService — resiliencia del sweep', () => {
  it('un negocio sin OWNER/ADMIN con email no rompe el sweep ni bloquea a los demás', async () => {
    const deps = makeDeps();
    deps.prisma.membership.findMany.mockResolvedValueOnce([]); // primer negocio: sin contactos
    deps.prisma.business.findMany.mockResolvedValue([
      business({
        id: 'biz-sin-contacto',
        onboardingCompletedAt: new Date(
          NEUTRAL_TICK.getTime() - 7 * MS_PER_DAY,
        ),
      }),
      business({
        id: 'biz-con-contacto',
        onboardingCompletedAt: new Date(
          NEUTRAL_TICK.getTime() - 7 * MS_PER_DAY,
        ),
      }),
    ]);
    const service = makeService(deps);

    const result = await service.runHourlySweep(NEUTRAL_TICK);

    expect(result.businesses).toBe(2);
    expect(deps.emailSend).toHaveBeenCalledTimes(1); // solo el segundo negocio, con contacto real
  });
});

describe('OwnerLifecycleEmailsService — la IA caída nunca impide el envío', () => {
  it('el resumen semanal sale sin depender de IA', async () => {
    const deps = makeDeps();
    deps.aiSummary.generate.mockResolvedValue(null);
    deps.prisma.business.findMany.mockResolvedValue([business()]);
    const service = makeService(deps);

    await service.runHourlySweep(MONDAY_9AM);

    expect(deps.emailSend).toHaveBeenCalledTimes(1);
    const [{ html }] = deps.emailSend.mock.calls[0];
    expect(html).toContain('Tu semana en Flikker');
    expect(deps.aiSummary.generate).not.toHaveBeenCalled();
  });
});

describe('OwnerLifecycleEmailsService — los números del email coinciden con BusinessImpactService (fuente única)', () => {
  it('el resumen semanal muestra la ventana canónica y limita visitas y canjes al período del negocio', async () => {
    const deps = makeDeps();
    deps.reactivationFunnel.forBusiness.mockResolvedValue({
      overall: {
        contacted: 24,
        returned: 7,
        recoveryRate: 7 / 24,
        averageDaysToReturn: 4,
        evidenceState: 'HAS_DATA',
      },
      byArm: null,
    });
    deps.prisma.visit.count.mockResolvedValue(88);
    deps.prisma.visit.groupBy
      .mockResolvedValueOnce([
        { customerId: 'c-1', _count: { _all: 2 } },
        { customerId: 'c-2', _count: { _all: 1 } },
      ])
      .mockResolvedValueOnce([
        { visitDayKey: '2026-08-14', _count: { _all: 20 } },
      ]);
    deps.prisma.benefitParticipation.groupBy.mockResolvedValue([
      { benefitId: 'benefit-1', _count: { _all: 7 } },
    ]);
    deps.prisma.benefit.findFirst.mockResolvedValue({
      title: 'Café de regalo',
    });
    deps.businessImpact.getWindowMetrics.mockResolvedValue({
      customersIdentified: 5,
      customersReturned: 6,
      customersReturnedAfterContact: 0,
      benefitsRedeemed: 2,
      newReviews: 3,
    });
    deps.prisma.business.findMany.mockResolvedValue([business()]);
    const service = makeService(deps);

    await service.runHourlySweep(MONDAY_9AM);

    // La ventana semanal es [lunes pasado 00:00 local, hoy 00:00 local) —
    // no el instante exacto del tick (`MONDAY_9AM`, que es 12:00 local).
    expect(deps.businessImpact.getWindowMetrics).toHaveBeenCalledWith(
      'biz-1',
      expect.any(Date),
      expect.any(Date),
    );
    const [{ html }] = deps.emailSend.mock.calls[0];
    expect(html).toContain('2 clientes');
    expect(html).toContain('>6<');
    expect(html).toContain('7 canjes');
    expect(html).toContain('Café de regalo');
    expect(html).toContain('20 interacciones');
    expect(html).toContain('vie');
    expect(html).toContain('>88<');
    expect(html).toContain('+5');
    expect(deps.prisma.benefitParticipation.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId: 'biz-1',
          redeemedAt: {
            gte: new Date('2026-08-10T03:00:00Z'),
            lt: new Date('2026-08-17T03:00:00Z'),
          },
        },
      }),
    );
  });
});
