import { Prisma } from '@prisma/client';
import { RetentionSettingsService } from './retention-settings.service';
import { isValidToday } from './incentive-issuer.service';

const WINDOW = {
  sendingHourStart: 10,
  sendingHourEnd: 20,
  allowedSendingDays: [1, 2, 3, 4, 5, 6], // Mon–Sat
};

function makePrisma(existing: unknown = null) {
  return {
    retentionSettings: {
      findUnique: jest.fn().mockResolvedValue(existing),
      create: jest.fn().mockResolvedValue({ id: 'set-1', businessId: 'biz-1' }),
      update: jest.fn().mockResolvedValue({ id: 'set-1', businessId: 'biz-1' }),
    },
    retentionVariant: { findFirst: jest.fn().mockResolvedValue(null) },
  };
}

describe('RetentionSettingsService.getOrCreate', () => {
  it('returns the existing row without creating another', async () => {
    const prisma = makePrisma({ id: 'set-1', businessId: 'biz-1' });
    const service = new RetentionSettingsService(prisma as never);

    const result = await service.getOrCreate('biz-1');

    expect(result).toEqual({ id: 'set-1', businessId: 'biz-1' });
    expect(prisma.retentionSettings.create).not.toHaveBeenCalled();
  });

  it('creates defaults on first use, relying on the schema defaults', async () => {
    const prisma = makePrisma(null);
    const service = new RetentionSettingsService(prisma as never);

    await service.getOrCreate('biz-1');

    // Only businessId — every other value comes from the schema, so there is no
    // duplicated constant list that could drift.
    expect(prisma.retentionSettings.create).toHaveBeenCalledWith({
      data: { businessId: 'biz-1' },
    });
  });

  it('recovers from a concurrent create instead of failing', async () => {
    const prisma = makePrisma(null);
    prisma.retentionSettings.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    prisma.retentionSettings.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'raced', businessId: 'biz-1' });
    const service = new RetentionSettingsService(prisma as never);

    const result = await service.getOrCreate('biz-1');

    expect(result).toEqual({ id: 'raced', businessId: 'biz-1' });
  });
});

describe('RetentionSettingsService.isWithinSendingWindow', () => {
  const service = new RetentionSettingsService(makePrisma() as never);
  const TZ = 'America/Montevideo'; // UTC-3

  it('allows a weekday inside the hours', () => {
    // Wednesday 15:00 UTC = 12:00 local.
    const now = new Date('2026-09-02T15:00:00.000Z');
    expect(service.isWithinSendingWindow(WINDOW, TZ, now)).toBe(true);
  });

  it('blocks before the window opens', () => {
    // Wednesday 11:00 UTC = 08:00 local, window opens at 10.
    const now = new Date('2026-09-02T11:00:00.000Z');
    expect(service.isWithinSendingWindow(WINDOW, TZ, now)).toBe(false);
  });

  it('blocks after the window closes', () => {
    // Wednesday 23:30 UTC = 20:30 local, window closes at 20.
    const now = new Date('2026-09-02T23:30:00.000Z');
    expect(service.isWithinSendingWindow(WINDOW, TZ, now)).toBe(false);
  });

  it('blocks a day the owner excluded', () => {
    // Sunday 15:00 UTC = 12:00 local; Sunday (7) is not allowed.
    const now = new Date('2026-09-06T15:00:00.000Z');
    expect(service.isWithinSendingWindow(WINDOW, TZ, now)).toBe(false);
  });

  it('treats an empty day list as "any day"', () => {
    const now = new Date('2026-09-06T15:00:00.000Z'); // Sunday
    expect(
      service.isWithinSendingWindow(
        { ...WINDOW, allowedSendingDays: [] },
        TZ,
        now,
      ),
    ).toBe(true);
  });

  it('evaluates in the business timezone, not UTC', () => {
    // 01:00 UTC Thursday = 22:00 local Wednesday → outside a 10–20 window,
    // even though UTC would call it a different day entirely.
    const now = new Date('2026-09-03T01:00:00.000Z');
    expect(service.isWithinSendingWindow(WINDOW, TZ, now)).toBe(false);
  });
});

describe('isValidToday — incentive day restrictions', () => {
  const TZ = 'America/Montevideo';

  it('allows any day when no restriction is set', () => {
    expect(isValidToday([], TZ, new Date('2026-09-06T15:00:00.000Z'))).toBe(
      true,
    );
  });

  it('allows a listed weekday', () => {
    // Wednesday = 3.
    expect(isValidToday([3], TZ, new Date('2026-09-02T15:00:00.000Z'))).toBe(
      true,
    );
  });

  it('blocks a weekday that is not listed', () => {
    expect(isValidToday([6, 7], TZ, new Date('2026-09-02T15:00:00.000Z'))).toBe(
      false,
    );
  });

  it('uses the local calendar day', () => {
    // 01:00 UTC Thursday is still Wednesday (3) locally.
    expect(isValidToday([3], TZ, new Date('2026-09-03T01:00:00.000Z'))).toBe(
      true,
    );
    expect(isValidToday([4], TZ, new Date('2026-09-03T01:00:00.000Z'))).toBe(
      false,
    );
  });
});

describe('RetentionSettingsService.update — Fase C.5 §2', () => {
  it('persists a partial patch scoped to the business', async () => {
    const prisma = makePrisma({ ...WINDOW, businessId: 'biz-1' });
    const service = new RetentionSettingsService(prisma as never);

    await service.update('biz-1', { automaticCampaignsEnabled: false });

    expect(prisma.retentionSettings.update).toHaveBeenCalledWith({
      where: { businessId: 'biz-1' },
      data: { automaticCampaignsEnabled: false },
    });
  });

  it('rejects a sending window with start not before end', async () => {
    const prisma = makePrisma({ ...WINDOW, businessId: 'biz-1' });
    const service = new RetentionSettingsService(prisma as never);

    await expect(
      service.update('biz-1', { sendingHourStart: 20, sendingHourEnd: 10 }),
    ).rejects.toThrow('sendingHourStart must be before sendingHourEnd');
    expect(prisma.retentionSettings.update).not.toHaveBeenCalled();
  });

  it('validates the new hour against the existing one when only one is patched', async () => {
    // Existing window is 10–20; patching only the start to 21 must fail
    // against the still-in-place end of 20, not silently succeed.
    const prisma = makePrisma({ ...WINDOW, businessId: 'biz-1' });
    const service = new RetentionSettingsService(prisma as never);

    await expect(
      service.update('biz-1', { sendingHourStart: 21 }),
    ).rejects.toThrow('sendingHourStart must be before sendingHourEnd');
  });

  it('rejects a reward goal visit range with min above max (Fase E §31)', async () => {
    const prisma = makePrisma({ ...WINDOW, businessId: 'biz-1' });
    const service = new RetentionSettingsService(prisma as never);

    await expect(
      service.update('biz-1', {
        rewardGoalMinVisits: 5,
        rewardGoalMaxVisits: 2,
      }),
    ).rejects.toThrow(
      'rewardGoalMinVisits must not be greater than rewardGoalMaxVisits',
    );
    expect(prisma.retentionSettings.update).not.toHaveBeenCalled();
  });

  it('validates the new reward goal minimum against the existing maximum', async () => {
    const prisma = makePrisma({
      ...WINDOW,
      businessId: 'biz-1',
      rewardGoalMinVisits: 1,
      rewardGoalMaxVisits: 3,
    });
    const service = new RetentionSettingsService(prisma as never);

    await expect(
      service.update('biz-1', { rewardGoalMinVisits: 5 }),
    ).rejects.toThrow(
      'rewardGoalMinVisits must not be greater than rewardGoalMaxVisits',
    );
  });

  it('accepts a valid reward goal visit range', async () => {
    const prisma = makePrisma({ ...WINDOW, businessId: 'biz-1' });
    const service = new RetentionSettingsService(prisma as never);

    await service.update('biz-1', {
      rewardGoalMinVisits: 1,
      rewardGoalMaxVisits: 5,
    });

    expect(prisma.retentionSettings.update).toHaveBeenCalledWith({
      where: { businessId: 'biz-1' },
      data: { rewardGoalMinVisits: 1, rewardGoalMaxVisits: 5 },
    });
  });
});

describe('RetentionSettingsService.budgetWarning — Fase C.5 §6', () => {
  it('warns when incentive-bearing variants exist but no cap is configured', async () => {
    const prisma = makePrisma({
      businessId: 'biz-1',
      maxAutomatedIncentivesPerMonth: null,
      maxEstimatedIncentiveCostPerMonth: null,
    });
    prisma.retentionVariant.findFirst.mockResolvedValue({ id: 'var-1' });
    const service = new RetentionSettingsService(prisma as never);

    expect(await service.budgetWarning('biz-1')).toEqual({
      hasIncentiveBearingVariants: true,
      budgetConfigured: false,
    });
  });

  it('reports no warning when a business has no incentive-bearing variants at all', async () => {
    const prisma = makePrisma({
      businessId: 'biz-1',
      maxAutomatedIncentivesPerMonth: null,
      maxEstimatedIncentiveCostPerMonth: null,
    });
    const service = new RetentionSettingsService(prisma as never);

    expect(await service.budgetWarning('biz-1')).toEqual({
      hasIncentiveBearingVariants: false,
      budgetConfigured: false,
    });
  });

  it('reports the budget as configured once at least one cap is set', async () => {
    const prisma = makePrisma({
      businessId: 'biz-1',
      maxAutomatedIncentivesPerMonth: 10,
      maxEstimatedIncentiveCostPerMonth: null,
    });
    prisma.retentionVariant.findFirst.mockResolvedValue({ id: 'var-1' });
    const service = new RetentionSettingsService(prisma as never);

    expect(await service.budgetWarning('biz-1')).toEqual({
      hasIncentiveBearingVariants: true,
      budgetConfigured: true,
    });
  });
});
