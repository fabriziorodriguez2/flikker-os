import { ExperienceVersion } from '@prisma/client';
import { BirthdayEmailService } from './birthday-email.service';

// 2026-09-01T12:00:00Z is 2026-09-01 09:00 in America/Montevideo (UTC-3) —
// same calendar day in both, so this fixture stays timezone-agnostic.
const NOW = new Date('2026-09-01T12:00:00.000Z');

const OPEN_SETTINGS = {
  sendingHourStart: 10,
  sendingHourEnd: 20,
  allowedSendingDays: [1, 2, 3, 4, 5, 6, 7],
};

function makeDeps(
  options: {
    businesses?: unknown[];
    customers?: unknown[];
    hasProAccess?: boolean;
    withinWindow?: boolean;
    cooldownAllowed?: boolean;
  } = {},
) {
  const prisma = {
    business: {
      findMany: jest
        .fn()
        .mockResolvedValue(
          options.businesses ?? [
            { id: 'biz-1', name: 'Café Test', timezone: 'America/Montevideo' },
          ],
        ),
    },
    $queryRaw: jest.fn().mockResolvedValue(
      options.customers ?? [
        {
          id: 'cust-1',
          name: 'Cliente Test',
          email: 'cliente@test.com',
          phoneE164: '+59891111111',
        },
      ],
    ),
  };
  const lifecycleEmails = { sendOnce: jest.fn().mockResolvedValue('sent') };
  const plans = {
    hasProAccess: jest.fn().mockResolvedValue(options.hasProAccess ?? true),
  };
  const retentionSettings = {
    getOrCreate: jest.fn().mockResolvedValue(OPEN_SETTINGS),
    isWithinSendingWindow: jest
      .fn()
      .mockReturnValue(options.withinWindow ?? true),
  };
  const cooldown = {
    claimImmediate: jest
      .fn()
      .mockResolvedValue(
        options.cooldownAllowed === false ? 'blocked' : 'confirmed',
      ),
  };
  return { prisma, lifecycleEmails, plans, retentionSettings, cooldown };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new BirthdayEmailService(
    deps.prisma as never,
    deps.lifecycleEmails as never,
    deps.plans as never,
    deps.retentionSettings as never,
    deps.cooldown as never,
  );
}

describe('BirthdayEmailService — business ownership', () => {
  it('only sweeps CHECKIN_V2 businesses with the birthday toggle on', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.runDaily(NOW);

    expect(deps.prisma.business.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          experienceVersion: ExperienceVersion.CHECKIN_V2,
          retentionSettings: { birthdayEmailEnabled: true },
        },
      }),
    );
  });
});

describe('BirthdayEmailService — Pro gate', () => {
  it('never queries customers for a Free business, even with the toggle on', async () => {
    const deps = makeDeps({ hasProAccess: false });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(deps.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(result).toEqual({
      businesses: 1,
      evaluated: 0,
      sent: 0,
      suppressed: 0,
    });
  });

  it('sweeps a Pro business (or one within an active Pro trial)', async () => {
    const deps = makeDeps({ hasProAccess: true });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(deps.prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      businesses: 1,
      evaluated: 1,
      sent: 1,
      suppressed: 0,
    });
  });
});

describe('BirthdayEmailService — ventana horaria', () => {
  it('nunca manda si el negocio está fuera de su horario permitido', async () => {
    const deps = makeDeps({ withinWindow: false });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(deps.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(result.evaluated).toBe(0);
  });

  it('ventana 10–18: el sweep corre a las 8:55 (fuera de ventana) y no se pierde — un sweep posterior a las 10 manda', async () => {
    const deps = makeDeps({ withinWindow: false });
    const service = makeService(deps);
    const at855 = new Date('2026-09-01T08:55:00.000Z');

    const early = await service.runDaily(at855);
    expect(early.sent).toBe(0);
    expect(deps.lifecycleEmails.sendOnce).not.toHaveBeenCalled();

    // El mismo negocio, ahora dentro de la ventana (10–18) — nada se
    // "gastó" en el intento de las 8:55: el mismo cliente sigue elegible.
    deps.retentionSettings.isWithinSendingWindow.mockReturnValue(true);
    const at1005 = new Date('2026-09-01T10:05:00.000Z');
    const later = await service.runDaily(at1005);

    expect(later.sent).toBe(1);
    expect(deps.lifecycleEmails.sendOnce).toHaveBeenCalled();
  });
});

describe('BirthdayEmailService — cooldown global', () => {
  it('no manda si el cooldown ya está reclamado por otra automatización', async () => {
    const deps = makeDeps({ cooldownAllowed: false });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(deps.lifecycleEmails.sendOnce).not.toHaveBeenCalled();
    expect(result.suppressed).toBe(1);
  });
});

describe('BirthdayEmailService — send + dedupe', () => {
  it('sends both WhatsApp and email with a per-year dedupe key, never dedupes across years', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.runDaily(NOW);

    expect(deps.lifecycleEmails.sendOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz-1',
        customerId: 'cust-1',
        kind: 'birthday',
        channel: 'email',
        dedupeKey: '2026',
        to: 'cliente@test.com',
      }),
    );
    expect(deps.lifecycleEmails.sendOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz-1',
        customerId: 'cust-1',
        kind: 'birthday',
        channel: 'whatsapp',
        dedupeKey: '2026',
        to: '+59891111111',
      }),
    );
  });

  it('a customer with no birthday match today is never emailed', async () => {
    const deps = makeDeps({ customers: [] });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(deps.lifecycleEmails.sendOnce).not.toHaveBeenCalled();
    expect(result.evaluated).toBe(0);
  });
});

describe('BirthdayEmailService — multi-business', () => {
  it('sweeps every eligible business independently, re-checking Pro access each time', async () => {
    const deps = makeDeps({
      businesses: [
        { id: 'biz-pro', name: 'Café Pro', timezone: 'America/Montevideo' },
        { id: 'biz-free', name: 'Café Free', timezone: 'America/Montevideo' },
      ],
    });
    deps.plans.hasProAccess.mockImplementation((businessId: string) =>
      Promise.resolve(businessId === 'biz-pro'),
    );
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(deps.plans.hasProAccess).toHaveBeenCalledTimes(2);
    expect(deps.prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result.businesses).toBe(2);
  });
});
