import {
  computeFunnelStats,
  computeReactivationFunnel,
  type FunnelCounts,
} from './reactivation-funnel';

function counts(overrides: Partial<FunnelCounts> = {}): FunnelCounts {
  return { contacted: 0, returned: 0, daysToReturnSamples: [], ...overrides };
}

describe('computeFunnelStats', () => {
  it('computes the real recovery rate — returned / contacted', () => {
    const stats = computeFunnelStats(
      counts({ contacted: 40, returned: 10 }),
      30,
    );
    expect(stats.recoveryRate).toBe(0.25);
  });

  it('never NaN with zero contacted', () => {
    const stats = computeFunnelStats(counts({ contacted: 0 }), 30);
    expect(stats.recoveryRate).toBe(0);
  });

  it('averageDaysToReturn is null with no samples', () => {
    const stats = computeFunnelStats(
      counts({ contacted: 10, returned: 0 }),
      30,
    );
    expect(stats.averageDaysToReturn).toBeNull();
  });

  it('averages the real daysToReturn samples', () => {
    const stats = computeFunnelStats(
      counts({ contacted: 10, returned: 3, daysToReturnSamples: [2, 4, 6] }),
      30,
    );
    expect(stats.averageDaysToReturn).toBe(4);
  });

  it('evidenceState below the minimum is INSUFFICIENT_DATA', () => {
    const stats = computeFunnelStats(counts({ contacted: 10 }), 30);
    expect(stats.evidenceState).toBe('INSUFFICIENT_DATA');
  });

  it('evidenceState at or above the minimum is not INSUFFICIENT_DATA', () => {
    const stats = computeFunnelStats(counts({ contacted: 30 }), 30);
    expect(stats.evidenceState).not.toBe('INSUFFICIENT_DATA');
  });
});

describe('computeReactivationFunnel — byArm gating', () => {
  it('byArm is null when either arm still lacks volume', () => {
    const result = computeReactivationFunnel(
      counts({ contacted: 50, returned: 12 }),
      counts({ contacted: 40, returned: 10 }), // reminder: enough
      counts({ contacted: 10, returned: 2 }), // benefit: below minimum
      30,
    );
    expect(result.byArm).toBeNull();
    // El total SIEMPRE se muestra, incluso sin comparación posible.
    expect(result.overall.contacted).toBe(50);
  });

  it('byArm is populated once both arms clear the minimum', () => {
    const result = computeReactivationFunnel(
      counts({ contacted: 80, returned: 20 }),
      counts({ contacted: 40, returned: 8 }),
      counts({ contacted: 40, returned: 12 }),
      30,
    );
    expect(result.byArm).not.toBeNull();
    expect(result.byArm?.reminderOnly.recoveryRate).toBe(0.2);
    expect(result.byArm?.withBenefit.recoveryRate).toBe(0.3);
  });
});
