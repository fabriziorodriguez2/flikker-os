import { ExperienceVersion, RewardGoalStatus } from '@prisma/client';
import { StampsExpiryEmailService } from './stamps-expiry-email.service';

const NOW = new Date('2026-09-01T12:00:00.000Z');

const OPEN_SETTINGS = {
  sendingHourStart: 10,
  sendingHourEnd: 20,
  allowedSendingDays: [1, 2, 3, 4, 5, 6, 7],
};

function goalFixture(overrides: Record<string, unknown> = {}) {
  return {
    customerId: 'cust-1',
    customer: {
      name: 'Cliente Test',
      email: 'cliente@test.com',
      phoneE164: '+59891111111',
    },
    incentiveDefinition: { name: 'Café gratis' },
    benefitParticipation: {
      id: 'part-1',
      redemptionCode: 'ABC123',
      expiresAt: new Date('2026-09-02T12:00:00.000Z'),
    },
    ...overrides,
  };
}

function makeDeps(
  options: {
    businesses?: unknown[];
    goals?: unknown[];
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
    customerRewardGoal: {
      findMany: jest.fn().mockResolvedValue(options.goals ?? [goalFixture()]),
    },
  };
  const lifecycleEmails = { sendOnce: jest.fn().mockResolvedValue('sent') };
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
  return { prisma, lifecycleEmails, retentionSettings, cooldown };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new StampsExpiryEmailService(
    deps.prisma as never,
    deps.lifecycleEmails as never,
    deps.retentionSettings as never,
    deps.cooldown as never,
  );
}

describe('StampsExpiryEmailService — business ownership', () => {
  it('only sweeps CHECKIN_V2 businesses with reward goals AND the stamps-expiry toggle on', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.runDaily(NOW);

    expect(deps.prisma.business.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isActive: true,
          experienceVersion: ExperienceVersion.CHECKIN_V2,
          retentionSettings: {
            rewardGoalsEnabled: true,
            stampsExpiryEmailEnabled: true,
          },
        },
      }),
    );
  });
});

describe('StampsExpiryEmailService — ventana horaria', () => {
  it('nunca manda si el negocio está fuera de su horario permitido', async () => {
    const deps = makeDeps({ withinWindow: false });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(deps.prisma.customerRewardGoal.findMany).not.toHaveBeenCalled();
    expect(deps.lifecycleEmails.sendOnce).not.toHaveBeenCalled();
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

describe('StampsExpiryEmailService — cooldown global', () => {
  it('no manda si el cooldown ya está reclamado por otra automatización', async () => {
    const deps = makeDeps({ cooldownAllowed: false });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(deps.lifecycleEmails.sendOnce).not.toHaveBeenCalled();
    expect(result).toEqual({
      businesses: 1,
      evaluated: 1,
      sent: 0,
      suppressed: 1,
    });
  });

  it('reclama el cooldown ANTES de intentar cualquiera de los dos canales', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.runDaily(NOW);

    expect(deps.cooldown.claimImmediate).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz-1',
        customerId: 'cust-1',
        kind: 'stamps_expiry',
      }),
    );
  });
});

describe('StampsExpiryEmailService — eligibility window', () => {
  it('only looks at UNLOCKED goals with an unredeemed, soon-expiring benefit', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.runDaily(NOW);

    expect(deps.prisma.customerRewardGoal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: 'biz-1',
          status: RewardGoalStatus.UNLOCKED,
          benefitParticipationId: { not: null },
          benefitParticipation: expect.objectContaining({
            redeemedAt: null,
          }),
        }),
      }),
    );
  });

  it('sends both WhatsApp and email with the real redemption code and rounded days remaining', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(deps.lifecycleEmails.sendOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz-1',
        customerId: 'cust-1',
        kind: 'stamps_expiry',
        channel: 'email',
        dedupeKey: 'part-1',
        to: 'cliente@test.com',
      }),
    );
    expect(deps.lifecycleEmails.sendOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: 'biz-1',
        customerId: 'cust-1',
        kind: 'stamps_expiry',
        channel: 'whatsapp',
        dedupeKey: 'part-1',
        to: '+59891111111',
      }),
    );
    expect(result).toEqual({
      businesses: 1,
      evaluated: 1,
      sent: 1,
      suppressed: 0,
    });
  });

  it('skips a goal whose benefit has no expiresAt or redemption code, without crashing', async () => {
    const deps = makeDeps({
      goals: [
        goalFixture({
          benefitParticipation: {
            id: 'part-2',
            redemptionCode: null,
            expiresAt: null,
          },
        }),
      ],
    });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(deps.lifecycleEmails.sendOnce).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });
});

describe('StampsExpiryEmailService — multi-business', () => {
  it('sweeps every eligible business independently', async () => {
    const deps = makeDeps({
      businesses: [
        { id: 'biz-1', name: 'Café Test', timezone: 'America/Montevideo' },
        { id: 'biz-2', name: 'Bar Test', timezone: 'America/Montevideo' },
      ],
    });
    const service = makeService(deps);

    const result = await service.runDaily(NOW);

    expect(deps.prisma.customerRewardGoal.findMany).toHaveBeenCalledTimes(2);
    expect(result.businesses).toBe(2);
  });
});
