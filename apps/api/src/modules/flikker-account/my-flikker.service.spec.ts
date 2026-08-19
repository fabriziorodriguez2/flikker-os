import { RewardGoalStatus } from '@prisma/client';
import { MyFlikkerService } from './my-flikker.service';

function customerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cust-a',
    businessId: 'biz-a',
    business: { name: 'Café A', logoUrl: null, primaryColor: '#5C6BC0' },
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
  return { prisma, rewardGoals };
}

function makeService(deps: ReturnType<typeof makeDeps>) {
  return new MyFlikkerService(deps.prisma as never, deps.rewardGoals as never);
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
      'visitsTotal',
      'lastVisitAt',
      'rewardGoal',
      'benefitAvailable',
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
});
