import { LoyaltyProgramService } from './loyalty-program.service';

function makeDeps(
  options: {
    settings?: Record<string, unknown>;
    reward?: unknown;
    welcome?: unknown;
  } = {},
) {
  const prisma = {
    customerRewardGoal: {
      groupBy: jest.fn().mockResolvedValue([{ customerId: 'c-1' }]),
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    retentionIncentiveDefinition: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.reward === undefined
            ? { id: 'inc-1', name: '3 medialunas', benefitId: 'ben-1' }
            : options.reward,
        ),
    },
    business: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ welcomeBenefit: options.welcome ?? null }),
    },
    rewardGoalBonusStamp: { findMany: jest.fn().mockResolvedValue([]) },
    checkinFeedback: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const settings = {
    getOrCreate: jest.fn().mockResolvedValue({
      rewardGoalsEnabled: true,
      rewardGoalFeedbackBonusEnabled: false,
      rewardGoalMinVisits: 5,
      rewardGoalMaxVisits: 5,
      ...options.settings,
    }),
  };
  return { prisma, settings };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new LoyaltyProgramService(
    deps.prisma as never,
    deps.settings as never,
  );
}

describe('LoyaltyProgramService — traduce el estado interno a lenguaje de negocio', () => {
  it('expone sellos necesarios, recompensa y estado, sin nombres internos', async () => {
    const service = makeService(makeDeps());

    const result = await service.getOverview('biz-1');

    expect(result.enabled).toBe(true);
    expect(result.stampsRequired).toBe(5);
    expect(result.reward).toEqual({ name: '3 medialunas', benefitId: 'ben-1' });
    // Nada de "rewardGoal", "incentiveDefinition" ni "retention" en la salida.
    expect(Object.keys(result)).toEqual([
      'enabled',
      'feedbackBonusEnabled',
      'stampsRequired',
      'reward',
      'welcomeGift',
      'stats',
      'recentActivity',
    ]);
  });

  it('sin recompensa autorizada devuelve null en vez de inventar una', async () => {
    const service = makeService(makeDeps({ reward: null }));

    const result = await service.getOverview('biz-1');

    expect(result.reward).toBeNull();
  });

  it('sin sellos configurados devuelve null — nunca un default silencioso', async () => {
    const service = makeService(
      makeDeps({
        settings: { rewardGoalMinVisits: null, rewardGoalMaxVisits: null },
      }),
    );

    const result = await service.getOverview('biz-1');

    expect(result.stampsRequired).toBeNull();
  });

  it('el regalo de bienvenida sale del beneficio activo, independiente de la recompensa', async () => {
    const service = makeService(
      makeDeps({
        welcome: { id: 'ben-2', title: 'Café gratis', type: 'gift' },
      }),
    );

    const result = await service.getOverview('biz-1');

    expect(result.welcomeGift).toEqual({
      name: 'Café gratis',
      benefitId: 'ben-2',
    });
    // Y no es el mismo beneficio que la recompensa: son usos independientes.
    expect(result.reward?.benefitId).toBe('ben-1');
  });

  it('cuenta clientes participando por cliente distinto, no por tarjeta', async () => {
    const deps = makeDeps();
    deps.prisma.customerRewardGoal.groupBy.mockResolvedValue([
      { customerId: 'c-1' },
      { customerId: 'c-2' },
    ]);
    const service = makeService(deps);

    const result = await service.getOverview('biz-1');

    expect(result.stats.customersParticipating).toBe(2);
    expect(deps.prisma.customerRewardGoal.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ by: ['customerId'] }),
    );
  });
});

describe('LoyaltyProgramService — actividad reciente', () => {
  it('mezcla las cuatro fuentes y ordena por fecha real, más nueva primero', async () => {
    const deps = makeDeps();
    deps.prisma.customerRewardGoal.findMany
      .mockResolvedValueOnce([
        {
          id: 'g-1',
          unlockedAt: new Date('2026-09-03T10:00:00.000Z'),
          customer: { name: 'Ana' },
          incentiveDefinition: { name: '3 medialunas' },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'g-2',
          redeemedAt: new Date('2026-09-05T10:00:00.000Z'),
          customer: { name: 'Beto' },
          incentiveDefinition: { name: '3 medialunas' },
        },
      ]);
    deps.prisma.rewardGoalBonusStamp.findMany.mockResolvedValue([
      {
        id: 's-1',
        createdAt: new Date('2026-09-01T10:00:00.000Z'),
        customer: { name: 'Caro' },
      },
    ]);
    const service = makeService(deps);

    const result = await service.getOverview('biz-1');

    expect(result.recentActivity.map((a) => a.type)).toEqual([
      'redeemed',
      'unlocked',
      'stamp',
    ]);
    expect(result.recentActivity[0].customerName).toBe('Beto');
  });
});
