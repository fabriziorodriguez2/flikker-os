import { ExperienceVersion } from '@prisma/client';
import { BirthdayEmailService } from './birthday-email.service';

// 2026-09-01T12:00:00Z is 2026-09-01 09:00 in America/Montevideo (UTC-3) —
// same calendar day in both, so this fixture stays timezone-agnostic.
const NOW = new Date('2026-09-01T12:00:00.000Z');

function makeDeps(
  options: {
    businesses?: unknown[];
    customers?: unknown[];
    hasProAccess?: boolean;
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
    $queryRaw: jest
      .fn()
      .mockResolvedValue(
        options.customers ?? [
          { id: 'cust-1', name: 'Cliente Test', email: 'cliente@test.com' },
        ],
      ),
  };
  const lifecycleEmails = { sendOnce: jest.fn().mockResolvedValue('sent') };
  const plans = {
    hasProAccess: jest.fn().mockResolvedValue(options.hasProAccess ?? true),
  };
  return { prisma, lifecycleEmails, plans };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new BirthdayEmailService(
    deps.prisma as never,
    deps.lifecycleEmails as never,
    deps.plans as never,
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
    expect(result).toEqual({ businesses: 1, evaluated: 0, sent: 0 });
  });

  it('sweeps a Pro business (or one within an active Pro trial)', async () => {
    const deps = makeDeps({ hasProAccess: true });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(deps.prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ businesses: 1, evaluated: 1, sent: 1 });
  });
});

describe('BirthdayEmailService — send + dedupe', () => {
  it('sends with a per-year dedupe key, never dedupes across years', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.runDaily(NOW);

    expect(deps.lifecycleEmails.sendOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz-1',
        customerId: 'cust-1',
        kind: 'birthday',
        dedupeKey: '2026',
        to: 'cliente@test.com',
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
