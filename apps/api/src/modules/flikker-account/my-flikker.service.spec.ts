import { RewardGoalStatus } from '@prisma/client';
import { MyFlikkerService } from './my-flikker.service';

function customerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cust-a',
    businessId: 'biz-a',
    business: {
      name: 'Café A',
      logoUrl: null,
      primaryColor: '#5C6BC0',
      welcomeBenefitId: null,
    },
    ...overrides,
  };
}

function makeDeps(
  options: {
    customers?: unknown[];
    customer?: unknown;
    visitsTotal?: number;
    lastVisit?: unknown;
    rewardView?: unknown;
    unlockedGoal?: unknown;
    otherBenefits?: unknown[];
  } = {},
) {
  const prisma = {
    customer: {
      findMany: jest
        .fn()
        .mockResolvedValue(options.customers ?? [customerRow()]),
      findFirst: jest
        .fn()
        .mockResolvedValue(
          options.customer === undefined ? customerRow() : options.customer,
        ),
    },
    visit: {
      count: jest.fn().mockResolvedValue(options.visitsTotal ?? 4),
      findFirst: jest.fn().mockResolvedValue(
        options.lastVisit ?? {
          occurredAt: new Date('2026-09-01T12:00:00.000Z'),
        },
      ),
    },
    customerRewardGoal: {
      findFirst: jest.fn().mockResolvedValue(options.unlockedGoal ?? null),
    },
  };
  const rewardGoals = {
    currentView: jest
      .fn()
      .mockResolvedValue(
        options.rewardView ?? { goal: null, unlockedNow: false, benefit: null },
      ),
  };
  const benefits = {
    getOtherAvailableBenefits: jest
      .fn()
      .mockResolvedValue(options.otherBenefits ?? []),
  };
  const missions = { currentView: jest.fn().mockResolvedValue([]) };
  const streaks = {
    getStreaksForCustomers: jest.fn().mockResolvedValue(new Map()),
  };
  const returnChallenges = {
    currentViewForCustomers: jest.fn().mockResolvedValue(new Map()),
  };
  return { prisma, rewardGoals, missions, streaks, returnChallenges, benefits };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new MyFlikkerService(
    deps.prisma as never,
    deps.rewardGoals as never,
    deps.missions as never,
    deps.streaks as never,
    deps.returnChallenges as never,
    deps.benefits as never,
  );
}

describe('MyFlikkerService.listPlaces — cross-business, but only this account’s own', () => {
  it('scopes the list strictly to this flikkerAccountId', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.listPlaces('account-1');

    expect(deps.prisma.customer.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { flikkerAccountId: 'account-1', isActive: true },
      }),
    );
  });

  it('returns one place per linked business, with visits and progress', async () => {
    const deps = makeDeps({
      customers: [
        customerRow({
          id: 'cust-a',
          businessId: 'biz-a',
          business: { name: 'Café A', logoUrl: null, primaryColor: null },
        }),
        customerRow({
          id: 'cust-b',
          businessId: 'biz-b',
          business: { name: 'Bar B', logoUrl: null, primaryColor: null },
        }),
      ],
    });
    const service = makeService(deps);

    const places = await service.listPlaces('account-1');

    expect(places).toHaveLength(2);
    expect(places.map((p) => p.businessId)).toEqual(['biz-a', 'biz-b']);
  });

  it('never queries any customer.findFirst without a businessId scope (no cross-tenant bleed)', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.listPlaces('account-1');

    for (const call of deps.prisma.visit.count.mock.calls) {
      expect(call[0].where.businessId).toBeDefined();
      expect(call[0].where.customerId).toBeDefined();
    }
  });
});

describe('MyFlikkerService.placeDetail — per-business isolation (Fase E §38)', () => {
  it('404s instead of revealing whether the account has a relationship with a business it does not', async () => {
    const deps = makeDeps({ customer: null });
    const service = makeService(deps);

    await expect(service.placeDetail('account-1', 'biz-other')).rejects.toThrow(
      'Business not found',
    );
  });

  it('scopes the lookup to both the account AND the specific business', async () => {
    const deps = makeDeps();
    const service = makeService(deps);

    await service.placeDetail('account-1', 'biz-a');

    expect(deps.prisma.customer.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          flikkerAccountId: 'account-1',
          businessId: 'biz-a',
          isActive: true,
        },
      }),
    );
  });

  it('reads visits and reward progress using the exact customerId this business owns', async () => {
    const deps = makeDeps({
      customer: customerRow({ id: 'cust-specific', businessId: 'biz-a' }),
    });
    const service = makeService(deps);

    await service.placeDetail('account-1', 'biz-a');

    expect(deps.prisma.visit.count).toHaveBeenCalledWith({
      where: { businessId: 'biz-a', customerId: 'cust-specific' },
    });
    expect(deps.rewardGoals.currentView).toHaveBeenCalledWith(
      'biz-a',
      'cust-specific',
    );
  });
});

describe('MyFlikkerService — customer-facing fields only (Fase E §20)', () => {
  it('never returns segment/assignment/experiment/uplift — only visits, progress, benefit', async () => {
    const deps = makeDeps({
      rewardView: {
        goal: {
          incentiveName: 'Upgrade gratis',
          progressVisits: 1,
          targetAdditionalVisits: 2,
          remainingVisits: 1,
        },
        unlockedNow: false,
        benefit: null,
      },
    });
    const service = makeService(deps);

    const place = await service.placeDetail('account-1', 'biz-a');

    expect(Object.keys(place)).toEqual([
      'businessId',
      'businessName',
      'logoUrl',
      'primaryColor',
      // Color de la experiencia pública: el mismo que ya ve el cliente en el
      // check-in, para que Mi Flikker no vuelva al fondo genérico.
      'checkinBackgroundColor',
      // Apariencia de la tarjeta: es cara-al-cliente por definición (el
      // cliente literalmente la ve), así que no viola §20 — lo que nunca
      // puede salir es segmento/assignment/experimento/uplift.
      'loyaltyCardColor',
      'loyaltyCardTextColor',
      'loyaltyCardBackgroundImage',
      'loyaltyStampAreaColor',
      'loyaltyStampColor',
      'loyaltyStampIcon',
      'loyaltyShowBusinessName',
      'loyaltyStampBackgroundPattern',
      'loyaltyStampBackgroundOpacity',
      'visitsTotal',
      'lastVisitAt',
      'rewardGoal',
      'benefitAvailable',
      // Otros beneficios otorgados (ej. por una promoción manual), sin
      // canjear — cara-al-cliente por definición, mismo criterio que
      // `benefitAvailable` arriba.
      'otherBenefits',
      // Misiones: progreso y premio, ambos cosas que el cliente ya ve en la
      // pantalla de check-in. Nunca lleva participantes de otros clientes ni
      // nada de lo que §20 prohíbe.
      'missions',
    ]);
  });

  it('surfaces an UNLOCKED, not-yet-redeemed benefit as available', async () => {
    const deps = makeDeps({
      unlockedGoal: {
        incentiveDefinition: { name: 'Café gratis' },
        benefitParticipation: {
          redemptionCode: 'ABCD1234',
          expiresAt: new Date('2026-09-20T00:00:00.000Z'),
        },
      },
    });
    const service = makeService(deps);

    const place = await service.placeDetail('account-1', 'biz-a');

    expect(place.benefitAvailable).toEqual({
      name: 'Café gratis',
      code: 'ABCD1234',
      expiresAt: '2026-09-20T00:00:00.000Z',
    });
    expect(deps.prisma.customerRewardGoal.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: RewardGoalStatus.UNLOCKED }),
      }),
    );
  });

  it('reports no benefit available when nothing is unlocked', async () => {
    const deps = makeDeps({ unlockedGoal: null });
    const service = makeService(deps);

    const place = await service.placeDetail('account-1', 'biz-a');

    expect(place.benefitAvailable).toBeNull();
  });

  it('surfaces a promotion-granted benefit as otherBenefits, independent of the reward-goal one', async () => {
    const deps = makeDeps({
      otherBenefits: [
        {
          benefitId: 'benefit-promo',
          type: 'discount',
          title: '10% off',
          description: null,
          terms: null,
          code: 'PROMO123',
          expiresAt: null,
        },
      ],
    });
    const service = makeService(deps);

    const place = await service.placeDetail('account-1', 'biz-a');

    expect(place.otherBenefits).toEqual([
      {
        title: '10% off',
        description: null,
        terms: null,
        code: 'PROMO123',
        expiresAt: null,
      },
    ]);
  });

  it('excludes the reward-goal benefit and the welcome gift when asking for other benefits', async () => {
    const deps = makeDeps({
      customer: customerRow({
        business: {
          name: 'Café A',
          logoUrl: null,
          primaryColor: null,
          welcomeBenefitId: 'benefit-welcome',
        },
      }),
      unlockedGoal: {
        incentiveDefinition: { name: 'Café gratis' },
        benefitParticipation: {
          benefitId: 'benefit-reward-goal',
          redemptionCode: 'ABCD1234',
          expiresAt: null,
        },
      },
    });
    const service = makeService(deps);

    await service.placeDetail('account-1', 'biz-a');

    expect(deps.benefits.getOtherAvailableBenefits).toHaveBeenCalledWith(
      'biz-a',
      'cust-a',
      ['benefit-reward-goal', 'benefit-welcome'],
    );
  });
});

describe('MyFlikkerService.listChallenges — misiones y rachas juntas', () => {
  function makeChallengeDeps() {
    const deps = makeDeps();
    deps.prisma.customer.findMany = jest.fn().mockResolvedValue([
      {
        id: 'cust-a',
        businessId: 'biz-a',
        business: {
          name: 'Bar Fraternidad',
          logoUrl: null,
          timezone: 'America/Montevideo',
        },
      },
    ]);
    return deps;
  }

  it('pide las rachas de TODOS los lugares en un solo llamado', async () => {
    const deps = makeChallengeDeps();
    const service = makeService(deps);

    await service.listChallenges('account-1');

    // Una llamada al batch, no una por negocio.
    expect(deps.streaks.getStreaksForCustomers).toHaveBeenCalledTimes(1);
    expect(deps.streaks.getStreaksForCustomers).toHaveBeenCalledWith(
      [
        {
          customerId: 'cust-a',
          businessId: 'biz-a',
          timezone: 'America/Montevideo',
        },
      ],
      expect.any(Date),
    );
  });

  it('una racha que vale la pena se convierte en tarjeta', async () => {
    const deps = makeChallengeDeps();
    deps.streaks.getStreaksForCustomers.mockResolvedValue(
      new Map([
        [
          // El Map viene clavado por customerId, no por businessId: una
          // cuenta puede tener dos Customer del mismo negocio.
          'cust-a',
          {
            currentWeeks: 3,
            state: 'AT_RISK',
            currentWeekStart: '2026-09-21',
            deadlineDayKey: '2026-09-27',
          },
        ],
      ]),
    );
    const service = makeService(deps);

    const challenges = await service.listChallenges('account-1');

    expect(challenges).toEqual([
      {
        kind: 'streak',
        businessId: 'biz-a',
        businessName: 'Bar Fraternidad',
        logoUrl: null,
        currentWeeks: 3,
        state: 'AT_RISK',
        deadlineDayKey: '2026-09-27',
      },
    ]);
  });

  it('una racha de una sola semana NO llega a la pantalla', async () => {
    const deps = makeChallengeDeps();
    deps.streaks.getStreaksForCustomers.mockResolvedValue(
      new Map([
        [
          // El Map viene clavado por customerId, no por businessId: una
          // cuenta puede tener dos Customer del mismo negocio.
          'cust-a',
          {
            currentWeeks: 1,
            state: 'ACTIVE',
            currentWeekStart: '2026-09-21',
            deadlineDayKey: '2026-09-27',
          },
        ],
      ]),
    );

    expect(await makeService(deps).listChallenges('account-1')).toEqual([]);
  });

  it('una racha rota tampoco', async () => {
    const deps = makeChallengeDeps();
    deps.streaks.getStreaksForCustomers.mockResolvedValue(
      new Map([
        [
          // El Map viene clavado por customerId, no por businessId: una
          // cuenta puede tener dos Customer del mismo negocio.
          'cust-a',
          {
            currentWeeks: 0,
            state: 'BROKEN',
            currentWeekStart: '2026-09-21',
            deadlineDayKey: '2026-09-27',
          },
        ],
      ]),
    );

    expect(await makeService(deps).listChallenges('account-1')).toEqual([]);
  });

  it('las misiones activas van antes que las rachas', async () => {
    const deps = makeChallengeDeps();
    deps.missions.currentView.mockResolvedValue([
      {
        missionId: 'm-1',
        name: 'Vení 3 veces',
        status: 'ACTIVE',
        endsAt: '2026-10-01T03:00:00.000Z',
        progress: { current: 1, target: 3, remaining: 2, complete: false },
      },
    ]);
    deps.streaks.getStreaksForCustomers.mockResolvedValue(
      new Map([
        [
          // El Map viene clavado por customerId, no por businessId: una
          // cuenta puede tener dos Customer del mismo negocio.
          'cust-a',
          {
            currentWeeks: 3,
            state: 'AT_RISK',
            currentWeekStart: '2026-09-21',
            deadlineDayKey: '2026-09-27',
          },
        ],
      ]),
    );

    const challenges = await makeService(deps).listChallenges('account-1');

    expect(challenges.map((c) => c.kind)).toEqual(['mission', 'streak']);
  });

  it('sin misiones ni rachas la lista queda vacía, no rota', async () => {
    const deps = makeChallengeDeps();

    expect(await makeService(deps).listChallenges('account-1')).toEqual([]);
  });
});
