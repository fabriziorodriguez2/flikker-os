import { createHash } from 'crypto';
import { RetentionStrategyType } from '@prisma/client';

/**
 * Deterministic variant allocation.
 *
 * The bucket comes from hashing (experimentId, customerId), which gives four
 * properties at once:
 *  - random-looking, so groups are comparable;
 *  - stable: the same pair always lands in the same bucket, so a re-run of the
 *    worker cannot move somebody between variants;
 *  - idempotent, with no coordination needed between concurrent runs;
 *  - auditable: the bucket can be recomputed later to explain an assignment.
 *
 * The database's unique(experimentId, customerId) is the second line of defence
 * against a genuine race.
 */

export interface AllocatableVariant {
  id: string;
  strategyType: RetentionStrategyType;
  allocationPercent: number;
  active: boolean;
}

/** Stable bucket in [0, 100) for a customer within one experiment. */
export function allocationBucket(
  experimentId: string,
  customerId: string,
): number {
  const digest = createHash('sha256')
    .update(`${experimentId}:${customerId}`)
    .digest();
  // First 4 bytes as an unsigned int → uniform enough for bucketing.
  return digest.readUInt32BE(0) % 100;
}

/**
 * Picks the variant for a customer.
 *
 * Variants are sorted by id so the cumulative ranges do not depend on the order
 * the caller happened to load them in — otherwise the "stable" guarantee would
 * quietly break whenever a query returned rows differently.
 *
 * Returns null when there is nothing to allocate to (no active variants, or
 * percentages summing to 0), so the caller can skip rather than guess.
 */
export function pickVariant(
  experimentId: string,
  customerId: string,
  variants: AllocatableVariant[],
): AllocatableVariant | null {
  const active = variants
    .filter((v) => v.active && v.allocationPercent > 0)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const total = active.reduce((sum, v) => sum + v.allocationPercent, 0);
  if (total <= 0) return null;

  // Scale the bucket into the actual total so allocations that do not sum to
  // exactly 100 still distribute proportionally instead of dropping customers.
  const point = (allocationBucket(experimentId, customerId) / 100) * total;

  let cumulative = 0;
  for (const variant of active) {
    cumulative += variant.allocationPercent;
    if (point < cumulative) return variant;
  }
  return active[active.length - 1];
}

/**
 * Validates an experiment's variant set before it may recruit anybody.
 *
 * Two rules that protect the causal read:
 *  - exactly one CONTROL variant must exist, otherwise "what would have
 *    happened anyway?" is unanswerable;
 *  - control must keep a non-zero share.
 */
export function validateAllocation(variants: AllocatableVariant[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const active = variants.filter((v) => v.active);

  const controls = active.filter(
    (v) => v.strategyType === RetentionStrategyType.CONTROL,
  );
  if (controls.length === 0) {
    errors.push('An experiment must have a CONTROL variant');
  }
  if (controls.length > 1) {
    errors.push('An experiment must have exactly one CONTROL variant');
  }
  if (controls.length === 1 && controls[0].allocationPercent <= 0) {
    errors.push('CONTROL must keep a share above 0%');
  }

  if (active.some((v) => v.allocationPercent < 0)) {
    errors.push('Allocation percentages cannot be negative');
  }

  const total = active.reduce((sum, v) => sum + v.allocationPercent, 0);
  if (total !== 100) {
    errors.push(`Allocation percentages must sum to 100 (got ${total})`);
  }

  return { valid: errors.length === 0, errors };
}
