import {
  buildBusinessSnapshot,
  previewSegment,
  reachableCustomerIds,
  type SnapshotRaw,
} from './business-snapshot';

const NOW = new Date('2026-11-14T12:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const ahead = (days: number) => new Date(NOW.getTime() + days * 86_400_000);

function raw(over: Partial<SnapshotRaw> = {}): SnapshotRaw {
  return {
    customers: [
      { id: 'regular', isActive: true, optedOut: false },
      { id: 'once', isActive: true, optedOut: false },
      { id: 'recent', isActive: true, optedOut: false },
      { id: 'optout', isActive: true, optedOut: true },
      { id: 'deleted', isActive: false, optedOut: false },
    ],
    visits: [
      // Habitual cada ~7 días, la última hace 30: demorado (ratio > 1,5).
      ...[58, 51, 44, 37, 30].map((d) => ({
        customerId: 'regular',
        occurredAt: ago(d),
      })),
      { customerId: 'once', occurredAt: ago(45) },
      { customerId: 'recent', occurredAt: ago(3) },
      { customerId: 'recent', occurredAt: ago(10) },
      // Clientes que nunca se cuentan.
      { customerId: 'optout', occurredAt: ago(2) },
      { customerId: 'deleted', occurredAt: ago(2) },
    ],
    lastContacts: [{ customerId: 'regular', at: ago(20) }],
    rewardRemaining: [{ customerId: 'recent', remaining: 1 }],
    openBenefits: [
      { customerId: 'once', expiresAt: ahead(5) },
      { customerId: 'regular', expiresAt: null },
    ],
    redemptions: [{ customerId: 'recent', redeemedAt: ago(10) }],
    consented: new Set(['regular', 'recent', 'optout']),
    ...over,
  };
}

describe('buildBusinessSnapshot', () => {
  const snap = buildBusinessSnapshot(raw(), NOW);

  it('solo cuenta clientes activos y sin baja', () => {
    expect([...snap.features.keys()].sort()).toEqual([
      'once',
      'recent',
      'regular',
    ]);
    expect(snap.facts['customers.active']).toBe(3);
    // `optout` autorizó pero se dio de baja: no cuenta.
    expect(snap.facts['customers.with_whatsapp_consent']).toBe(2);
  });

  it('calcula los rasgos de cada cliente', () => {
    expect(snap.features.get('regular')).toMatchObject({
      visitCount: 5,
      daysSinceLastVisit: 30,
      typicalIntervalDays: 7,
      daysSinceLastContact: 20,
      unredeemedBenefits: 1,
      daysToNearestBenefitExpiry: null,
    });
    expect(snap.features.get('regular')!.overdueRatio).toBeGreaterThan(1.5);
    expect(snap.features.get('once')).toMatchObject({
      visitCount: 1,
      typicalIntervalDays: null,
      overdueRatio: null,
      daysToNearestBenefitExpiry: 5,
      daysSinceLastContact: null,
    });
    expect(snap.features.get('recent')).toMatchObject({
      rewardRemainingVisits: 1,
      redemptionsLast90Days: 1,
      visitsLast30Days: 2,
    });
  });

  it('las métricas verificables salen de los mismos rasgos', () => {
    expect(snap.facts).toMatchObject({
      'customers.with_visits': 3,
      'customers.single_visit_lapsed_30d': 1,
      'customers.overdue_regulars': 1,
      'customers.near_reward': 1,
      'customers.with_unredeemed_benefits': 2,
      'customers.benefit_expiring_7d': 1,
      'customers.contacted_last_30d': 1,
      'visits.last_28d': 2,
      'visits.prev_28d': 5,
      'visits.last_28d_vs_prev_change_pct': -60,
      'visits.unique_customers_last_28d': 1,
      'redemptions.last_90d': 1,
    });
  });

  it('sin base anterior no inventa una variación', () => {
    const empty = buildBusinessSnapshot(
      raw({ customers: [], visits: [], consented: new Set() }),
      NOW,
    );
    expect(empty.facts['visits.last_28d_vs_prev_change_pct']).toBeUndefined();
    expect(empty.facts['customers.active']).toBe(0);
  });
});

describe('previewSegment / reachableCustomerIds', () => {
  const snap = buildBusinessSnapshot(raw(), NOW);
  const rule = { field: 'visitCount' as const, op: 'gte' as const, value: 1 };

  it('cuenta quiénes entran y cuántos se pueden contactar, sin ids', () => {
    expect(previewSegment(snap, rule)).toEqual({ matched: 3, reachable: 2 });
  });

  it('para ejecutar, solo devuelve a quien tiene consentimiento', () => {
    expect(reachableCustomerIds(snap, rule).sort()).toEqual([
      'recent',
      'regular',
    ]);
  });
});
