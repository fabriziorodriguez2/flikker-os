import { RetentionStrategyType } from '@prisma/client';

/**
 * Fase G §20 — the deterministic allocation algorithm. Pure: no Prisma, no
 * "now", no randomness. Given the CURRENT allocation and which variant (if
 * any) the metrics engine picked as winner, computes a new allocation that:
 *
 *   1. never drops CONTROL below `minimumControlPercent` (§7);
 *   2. never drops the combined non-winner share below
 *      `minimumExplorationPercent` (§8);
 *   3. never moves any single variant by more than
 *      `maxAllocationChangePerOptimization` points in one call (§9);
 *   4. always sums to exactly 100 (§20).
 *
 * `winnerVariantId: null` means "no conclusion" — returns the input
 * unchanged. Never called for CONTROL as a "winner": `determineWinner`
 * (Fase D) already excludes CONTROL from its own candidate list.
 */

export interface CurrentAllocationEntry {
  variantId: string;
  strategyType: RetentionStrategyType;
  allocationPercent: number;
}

export interface AllocationProposalInput {
  current: CurrentAllocationEntry[];
  winnerVariantId: string | null;
  minimumControlPercent: number;
  minimumExplorationPercent: number;
  maxAllocationChangePerOptimization: number;
  /**
   * Variants that must never receive MORE share this round (Fase G §14 —
   * budget-constrained incentive variants). They may still lose share to
   * the winner like any other loser.
   */
  blockedFromIncrease?: Set<string>;
}

export interface AllocationProposalResult {
  allocations: Record<string, number>;
  changed: boolean;
}

export function proposeAllocation(
  input: AllocationProposalInput,
): AllocationProposalResult {
  const current = new Map(
    input.current.map((v) => [v.variantId, v.allocationPercent]),
  );

  const controlEntry = input.current.find(
    (v) => v.strategyType === RetentionStrategyType.CONTROL,
  );
  if (!controlEntry || !input.winnerVariantId) {
    return { allocations: Object.fromEntries(current), changed: false };
  }

  const controlId = controlEntry.variantId;
  const winnerId = input.winnerVariantId;
  const loserIds = input.current
    .map((v) => v.variantId)
    .filter((id) => id !== controlId && id !== winnerId);

  const maxStep = input.maxAllocationChangePerOptimization;
  const currentControl = current.get(controlId)!;
  const currentWinner = current.get(winnerId) ?? 0;
  const currentLosersSum = loserIds.reduce(
    (sum, id) => sum + (current.get(id) ?? 0),
    0,
  );

  // ── 1. CONTROL: only ever grows toward the floor, gradually, never shrinks. ──
  const desiredControl = Math.max(currentControl, input.minimumControlPercent);
  const nextControl =
    currentControl + Math.min(desiredControl - currentControl, maxStep);

  // ── 2. Winner: grows toward "everything not reserved for control/exploration
  //    or blocked", capped at one step. ──────────────────────────────────────
  const remainingAfterControl = 100 - nextControl;
  const blocked = input.blockedFromIncrease?.has(winnerId) ?? false;
  const winnerCeiling = blocked
    ? currentWinner
    : Math.min(
        currentWinner + maxStep,
        remainingAfterControl - input.minimumExplorationPercent,
      );
  // Never shrink the winner, and never let it go negative when a large
  // control correction ate all the remaining room.
  const nextWinner = Math.max(
    currentWinner,
    Math.min(winnerCeiling, remainingAfterControl),
  );

  // ── 3. Losers absorb exactly the room the winner took, proportionally to
  //    their own current share, each capped at maxStep of decrease. ─────────
  const losersSumNext = remainingAfterControl - nextWinner;
  const nextLosers = distributeLosers(
    loserIds,
    current,
    currentLosersSum,
    losersSumNext,
    maxStep,
  );

  const proposed = new Map<string, number>();
  proposed.set(controlId, nextControl);
  proposed.set(winnerId, nextWinner);
  for (const [id, value] of nextLosers) proposed.set(id, value);

  const normalized = normalizeToHundred(proposed, winnerId);

  const changed = input.current.some(
    (v) => normalized.get(v.variantId) !== v.allocationPercent,
  );

  return { allocations: Object.fromEntries(normalized), changed };
}

/**
 * Shrinks (or grows, if losersSumNext > currentLosersSum — e.g. after a
 * control correction frees up room) losers proportionally to their current
 * share, then clamps each individual move to `maxStep` so no single loser
 * is crushed in one round even if the combined floor would allow it.
 */
function distributeLosers(
  loserIds: string[],
  current: Map<string, number>,
  currentLosersSum: number,
  losersSumNext: number,
  maxStep: number,
): Map<string, number> {
  const result = new Map<string, number>();
  if (loserIds.length === 0) return result;

  if (currentLosersSum <= 0) {
    // Nothing to scale proportionally from — split evenly as a fallback,
    // still respecting maxStep.
    const even = losersSumNext / loserIds.length;
    for (const id of loserIds) {
      const cur = current.get(id) ?? 0;
      result.set(id, clampStep(cur, even, maxStep));
    }
    return result;
  }

  for (const id of loserIds) {
    const cur = current.get(id) ?? 0;
    const proportional = (cur / currentLosersSum) * losersSumNext;
    result.set(id, clampStep(cur, proportional, maxStep));
  }
  return result;
}

function clampStep(current: number, target: number, maxStep: number): number {
  const delta = Math.max(-maxStep, Math.min(maxStep, target - current));
  return Math.max(0, current + delta);
}

/**
 * Rounds every value to an integer (the schema stores `Int`) and corrects
 * whatever rounding remainder is left by adjusting `adjustVariantId` (the
 * winner, or control if there is none) — never a loser, so the floors from
 * steps 1-2 are never violated by a rounding fix.
 */
function normalizeToHundred(
  values: Map<string, number>,
  adjustVariantId: string,
): Map<string, number> {
  const rounded = new Map<string, number>();
  for (const [id, value] of values) {
    rounded.set(id, Math.round(Math.max(0, value)));
  }
  const sum = [...rounded.values()].reduce((a, b) => a + b, 0);
  const diff = 100 - sum;
  if (diff !== 0) {
    rounded.set(adjustVariantId, (rounded.get(adjustVariantId) ?? 0) + diff);
  }
  return rounded;
}
