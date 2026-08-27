import { Prisma } from '@prisma/client';
import { OwnerMilestoneWhatsAppService } from './owner-milestone-whatsapp.service';
import { OwnerLifecycleEmailLogService } from './owner-lifecycle-email-log.service';

const TZ = 'America/Montevideo';
const NOW = new Date('2026-08-20T15:00:00.000Z'); // 12:00 local

function emptyLifetime(overrides: Record<string, number> = {}) {
  return {
    customersIdentified: 0,
    customersReturned: 0,
    customersReturnedAfterContact: 0,
    benefitsIssued: 0,
    benefitsRedeemed: 0,
    cardsInProgress: 0,
    reviewsSinceFlikker: 0,
    ...overrides,
  };
}

function business(overrides: Partial<{ id: string; name: string }> = {}) {
  return { id: 'biz-1', name: 'Café Test', timezone: TZ, ...overrides };
}

/** Fake real del log service — Prisma en memoria, mismo idioma que el spec de owner-lifecycle-emails.service. */
function makeFakeLogPrisma() {
  const rows = new Map<string, { createdAt: Date }>();
  return {
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
          rows.set(key, { createdAt: NOW });
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
      findFirst: jest.fn(() => (rows.size > 0 ? { id: 'some-log' } : null)),
    },
    rows,
  };
}

function makeDeps() {
  const logPrisma = makeFakeLogPrisma();
  const email = {
    isAvailable: jest.fn().mockReturnValue(true),
    send: jest.fn(),
  };
  const sendText = jest.fn().mockResolvedValue({ whatsappMessageId: 'wa-1' });
  const whatsAppForLog = {
    isChannelAvailable: jest.fn().mockResolvedValue(true),
    sendText,
  };
  const logService = new OwnerLifecycleEmailLogService(
    logPrisma as never,
    email as never,
    whatsAppForLog as never,
  );

  const prisma = {
    business: { findMany: jest.fn() },
    membership: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          { user: { notificationWhatsapp: '+59899111111' } },
        ]),
    },
    ownerLifecycleEmailLog: logPrisma.ownerLifecycleEmailLog,
  };
  const businessImpact = {
    getImpact: jest.fn().mockResolvedValue({
      sinceFlikker: {
        windowStart: NOW,
        anchor: 'onboarding' as const,
        customersIdentified: 0,
        customersReturned: 0,
        customersReturnedAfterContact: 0,
        benefitsRedeemed: 0,
        newReviews: 0,
      },
      last30Days: {
        customersIdentified: 0,
        customersReturned: 0,
        customersReturnedAfterContact: 0,
        benefitsRedeemed: 0,
        newReviews: 0,
      },
      lifetime: emptyLifetime(),
      reactivationEvidenceState: 'INSUFFICIENT_DATA' as const,
      hasEnoughRetentionEvidence: false,
    }),
  };

  return { prisma, businessImpact, logService, sendText };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new OwnerMilestoneWhatsAppService(
    deps.prisma as never,
    deps.businessImpact as never,
    deps.logService,
    { sendText: deps.sendText } as never,
  );
}

describe('OwnerMilestoneWhatsAppService — no manda nada sin un hito real', () => {
  it('con todo por debajo del umbral, 0 envíos', async () => {
    const deps = makeDeps();
    deps.prisma.business.findMany.mockResolvedValue([business()]);
    const service = makeService(deps);

    const result = await service.runDailyCheck(NOW);

    expect(result.sent).toBe(0);
    expect(deps.sendText).not.toHaveBeenCalled();
  });
});

describe('OwnerMilestoneWhatsAppService — idempotencia por hito', () => {
  it('el hito de 50 clientes identificados se manda una sola vez, aunque el sweep corra dos veces', async () => {
    const deps = makeDeps();
    deps.businessImpact.getImpact.mockResolvedValue({
      sinceFlikker: {
        windowStart: NOW,
        anchor: 'onboarding' as const,
        ...emptyLifetime(),
        newReviews: 0,
      },
      last30Days: emptyLifetime(),
      lifetime: emptyLifetime({ customersIdentified: 50 }),
      reactivationEvidenceState: 'INSUFFICIENT_DATA' as const,
      hasEnoughRetentionEvidence: false,
    });
    deps.prisma.business.findMany.mockResolvedValue([business()]);
    const service = makeService(deps);

    await service.runDailyCheck(NOW);
    // Correr una segunda vez el mismo día simula un doble tick — igual
    // debería quedar bloqueado por "ya se mandó algo hoy" antes que nada.
    await service.runDailyCheck(NOW);

    expect(deps.sendText).toHaveBeenCalledTimes(1);
    expect(deps.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('50 clientes') }),
    );
  });
});

describe('OwnerMilestoneWhatsAppService — agrupamiento', () => {
  it('si varios hitos se cruzan juntos, se manda UN solo mensaje con todos', async () => {
    const deps = makeDeps();
    deps.businessImpact.getImpact.mockResolvedValue({
      sinceFlikker: {
        windowStart: NOW,
        anchor: 'onboarding' as const,
        ...emptyLifetime(),
        newReviews: 0,
      },
      last30Days: emptyLifetime(),
      lifetime: emptyLifetime({
        customersIdentified: 50,
        benefitsRedeemed: 5,
        reviewsSinceFlikker: 5,
      }),
      reactivationEvidenceState: 'INSUFFICIENT_DATA' as const,
      hasEnoughRetentionEvidence: false,
    });
    deps.prisma.business.findMany.mockResolvedValue([business()]);
    const service = makeService(deps);

    await service.runDailyCheck(NOW);

    expect(deps.sendText).toHaveBeenCalledTimes(1);
    const [{ text }] = deps.sendText.mock.calls[0];
    expect(text).toContain('50 clientes');
    expect(text).toContain('5 beneficios');
    expect(text).toContain('5 reseñas nuevas');
  });
});

describe('OwnerMilestoneWhatsAppService — no dos hitos el mismo día', () => {
  it('un negocio que ya recibió un hito hoy no recibe otro aunque cruce un umbral nuevo', async () => {
    const deps = makeDeps();
    deps.businessImpact.getImpact.mockResolvedValue({
      sinceFlikker: {
        windowStart: NOW,
        anchor: 'onboarding' as const,
        ...emptyLifetime(),
        newReviews: 0,
      },
      last30Days: emptyLifetime(),
      lifetime: emptyLifetime({ customersIdentified: 50 }),
      reactivationEvidenceState: 'INSUFFICIENT_DATA' as const,
      hasEnoughRetentionEvidence: false,
    });
    deps.prisma.business.findMany.mockResolvedValue([business()]);
    const service = makeService(deps);
    await service.runDailyCheck(NOW);
    expect(deps.sendText).toHaveBeenCalledTimes(1);

    // Mismo día, un umbral DISTINTO recién cruzado — igual no debe mandar.
    deps.businessImpact.getImpact.mockResolvedValue({
      sinceFlikker: {
        windowStart: NOW,
        anchor: 'onboarding' as const,
        ...emptyLifetime(),
        newReviews: 0,
      },
      last30Days: emptyLifetime(),
      lifetime: emptyLifetime({ customersIdentified: 50, benefitsRedeemed: 5 }),
      reactivationEvidenceState: 'INSUFFICIENT_DATA' as const,
      hasEnoughRetentionEvidence: false,
    });
    const laterSameDay = new Date(NOW.getTime() + 3 * 60 * 60 * 1000);
    await service.runDailyCheck(laterSameDay);

    expect(deps.sendText).toHaveBeenCalledTimes(1);
  });
});

describe('OwnerMilestoneWhatsAppService — resiliencia', () => {
  it('un negocio sin WhatsApp de dueño no rompe el sweep', async () => {
    const deps = makeDeps();
    deps.prisma.membership.findMany.mockResolvedValue([]);
    deps.businessImpact.getImpact.mockResolvedValue({
      sinceFlikker: {
        windowStart: NOW,
        anchor: 'onboarding' as const,
        ...emptyLifetime(),
        newReviews: 0,
      },
      last30Days: emptyLifetime(),
      lifetime: emptyLifetime({ customersIdentified: 50 }),
      reactivationEvidenceState: 'INSUFFICIENT_DATA' as const,
      hasEnoughRetentionEvidence: false,
    });
    deps.prisma.business.findMany.mockResolvedValue([business()]);
    const service = makeService(deps);

    const result = await service.runDailyCheck(NOW);

    expect(result.businesses).toBe(1);
    expect(deps.sendText).not.toHaveBeenCalled();
  });
});
