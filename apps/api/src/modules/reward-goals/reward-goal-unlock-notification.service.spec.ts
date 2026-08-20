import { RewardGoalUnlockNotificationService } from './reward-goal-unlock-notification.service';

const NOW = new Date('2026-09-05T12:00:00.000Z');

function makeDeps(
  options: {
    business?: unknown;
    settings?: unknown;
    withinWindow?: boolean;
    claimResult?: 'confirmed' | 'outranked' | 'blocked';
    customer?: unknown;
    sendOutcome?: string;
  } = {},
) {
  const prisma = {
    business: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.business === undefined
            ? { timezone: 'America/Montevideo' }
            : options.business,
        ),
    },
    customer: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.customer === undefined
            ? { name: 'Juan', phoneE164: '+59891624988' }
            : options.customer,
        ),
    },
  };
  const lifecycleEmails = {
    sendOnce: jest.fn().mockResolvedValue(options.sendOutcome ?? 'sent'),
  };
  const retentionSettings = {
    getOrCreate: jest.fn().mockResolvedValue(options.settings ?? {}),
    isWithinSendingWindow: jest
      .fn()
      .mockReturnValue(options.withinWindow ?? true),
  };
  const cooldown = {
    claimImmediate: jest
      .fn()
      .mockResolvedValue(options.claimResult ?? 'confirmed'),
  };
  return { prisma, lifecycleEmails, retentionSettings, cooldown };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new RewardGoalUnlockNotificationService(
    deps.prisma as never,
    deps.lifecycleEmails as never,
    deps.retentionSettings as never,
    deps.cooldown as never,
  );
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    businessId: 'biz-1',
    customerId: 'cust-1',
    goalId: 'goal-1',
    rewardName: '1 café gratis',
    participationId: 'part-1',
    now: NOW,
    ...overrides,
  };
}

describe('RewardGoalUnlockNotificationService — happy path', () => {
  it('sends exactly one WhatsApp message, deduped by goalId', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.notify(input());

    expect(deps.lifecycleEmails.sendOnce).toHaveBeenCalledTimes(1);
    expect(deps.lifecycleEmails.sendOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz-1',
        customerId: 'cust-1',
        kind: 'reward_goal_unlocked',
        channel: 'whatsapp',
        dedupeKey: 'goal-1',
        to: '+59891624988',
      }),
    );
  });

  it('links to the real Benefit issuance, not a generic business link', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.notify(input({ participationId: 'part-42' }));

    const call = deps.lifecycleEmails.sendOnce.mock.calls[0][0];
    expect(call.text).toContain('/beneficio/part-42');
  });
});

describe('RewardGoalUnlockNotificationService — retry never duplicates', () => {
  it('a second call with the same goalId is skipped by sendOnce (dedupeKey)', async () => {
    const deps = makeDeps({ sendOutcome: 'skipped_duplicate' });
    const service = makeService(deps);

    await service.notify(input());
    await service.notify(input());

    expect(deps.lifecycleEmails.sendOnce).toHaveBeenCalledTimes(2);
    expect(
      deps.lifecycleEmails.sendOnce.mock.calls.every(
        (call: unknown[]) =>
          (call[0] as { dedupeKey: string }).dedupeKey === 'goal-1',
      ),
    ).toBe(true);
  });
});

describe('RewardGoalUnlockNotificationService — sending window', () => {
  it('never sends outside the business sending window', async () => {
    const deps = makeDeps({ withinWindow: false });
    const service = makeService(deps);

    await service.notify(input());

    expect(deps.cooldown.claimImmediate).not.toHaveBeenCalled();
    expect(deps.lifecycleEmails.sendOnce).not.toHaveBeenCalled();
  });
});

describe('RewardGoalUnlockNotificationService — cooldown', () => {
  it('never sends when outranked or blocked by another automation', async () => {
    const deps = makeDeps({ claimResult: 'blocked' });
    const service = makeService(deps);

    await service.notify(input());

    expect(deps.lifecycleEmails.sendOnce).not.toHaveBeenCalled();
  });
});
