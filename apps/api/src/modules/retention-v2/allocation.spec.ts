import { RetentionStrategyType } from '@prisma/client';
import {
  allocationBucket,
  pickVariant,
  validateAllocation,
  type AllocatableVariant,
} from './allocation';

function variant(
  id: string,
  strategyType: RetentionStrategyType,
  allocationPercent: number,
  active = true,
): AllocatableVariant {
  return { id, strategyType, allocationPercent, active };
}

const STANDARD: AllocatableVariant[] = [
  variant('v-control', RetentionStrategyType.CONTROL, 15),
  variant('v-reminder', RetentionStrategyType.REMINDER, 30),
  variant('v-soft', RetentionStrategyType.SOFT_BENEFIT, 30),
  variant('v-strong', RetentionStrategyType.STRONG_BENEFIT, 25),
];

describe('allocationBucket', () => {
  it('is stable for the same experiment/customer pair', () => {
    const a = allocationBucket('exp-1', 'cust-1');
    const b = allocationBucket('exp-1', 'cust-1');
    expect(a).toBe(b);
  });

  it('stays within [0, 100)', () => {
    for (let i = 0; i < 200; i++) {
      const bucket = allocationBucket('exp-1', `cust-${i}`);
      expect(bucket).toBeGreaterThanOrEqual(0);
      expect(bucket).toBeLessThan(100);
    }
  });

  it('differs across experiments, so a customer is not stuck in one arm', () => {
    const buckets = new Set(
      Array.from({ length: 20 }, (_, i) =>
        allocationBucket(`exp-${i}`, 'cust-1'),
      ),
    );
    expect(buckets.size).toBeGreaterThan(1);
  });
});

describe('pickVariant', () => {
  it('always returns the same variant for the same customer', () => {
    const first = pickVariant('exp-1', 'cust-1', STANDARD);
    const second = pickVariant('exp-1', 'cust-1', STANDARD);
    expect(first?.id).toBe(second?.id);
  });

  it('does not depend on the order the variants were loaded in', () => {
    const shuffled = [...STANDARD].reverse();
    expect(pickVariant('exp-1', 'cust-7', STANDARD)?.id).toBe(
      pickVariant('exp-1', 'cust-7', shuffled)?.id,
    );
  });

  it('spreads a population roughly along the configured percentages', () => {
    const counts = new Map<string, number>();
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const v = pickVariant('exp-1', `cust-${i}`, STANDARD)!;
      counts.set(v.id, (counts.get(v.id) ?? 0) + 1);
    }

    // Every arm is used, and control lands near its 15% share.
    expect(counts.size).toBe(4);
    const controlShare = (counts.get('v-control') ?? 0) / N;
    expect(controlShare).toBeGreaterThan(0.1);
    expect(controlShare).toBeLessThan(0.2);
  });

  it('never routes to an inactive variant', () => {
    const withPaused = [
      variant('v-control', RetentionStrategyType.CONTROL, 50),
      variant('v-off', RetentionStrategyType.STRONG_BENEFIT, 50, false),
    ];
    for (let i = 0; i < 200; i++) {
      expect(pickVariant('exp-1', `cust-${i}`, withPaused)?.id).toBe(
        'v-control',
      );
    }
  });

  it('returns null when there is nothing to allocate to', () => {
    expect(pickVariant('exp-1', 'cust-1', [])).toBeNull();
    expect(
      pickVariant('exp-1', 'cust-1', [
        variant('v-control', RetentionStrategyType.CONTROL, 0),
      ]),
    ).toBeNull();
  });
});

describe('validateAllocation', () => {
  it('accepts a well-formed set', () => {
    expect(validateAllocation(STANDARD)).toEqual({ valid: true, errors: [] });
  });

  it('rejects an experiment without CONTROL — uplift would be unmeasurable', () => {
    const noControl = [
      variant('v-reminder', RetentionStrategyType.REMINDER, 50),
      variant('v-soft', RetentionStrategyType.SOFT_BENEFIT, 50),
    ];
    const result = validateAllocation(noControl);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'An experiment must have a CONTROL variant',
    );
  });

  it('rejects a control share of 0%', () => {
    const emptyControl = [
      variant('v-control', RetentionStrategyType.CONTROL, 0),
      variant('v-reminder', RetentionStrategyType.REMINDER, 100),
    ];
    expect(validateAllocation(emptyControl).errors).toContain(
      'CONTROL must keep a share above 0%',
    );
  });

  it('rejects percentages that do not sum to 100', () => {
    const wrong = [
      variant('v-control', RetentionStrategyType.CONTROL, 15),
      variant('v-reminder', RetentionStrategyType.REMINDER, 30),
    ];
    expect(validateAllocation(wrong).valid).toBe(false);
  });

  it('rejects more than one CONTROL', () => {
    const twoControls = [
      variant('v-c1', RetentionStrategyType.CONTROL, 50),
      variant('v-c2', RetentionStrategyType.CONTROL, 50),
    ];
    expect(validateAllocation(twoControls).errors).toContain(
      'An experiment must have exactly one CONTROL variant',
    );
  });
});
