/**
 * Simulation Center §9 — every random decision inside a simulation must go
 * through a seeded generator built here, never a scattered `Math.random()`.
 * Same scenario + seed + config must always produce the same result.
 *
 * mulberry32: small, fast, well-known, deterministic across platforms for a
 * given 32-bit seed. Not cryptographic — this never needs to be.
 */
export type Rng = () => number;

export function createSeededRandom(seed: number): Rng {
  let state = seed >>> 0 || 0x9e3779b9;
  return function mulberry32() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Rolls `rng()` once and reports whether the event happened. */
export function chance(rng: Rng, probability: number): boolean {
  return rng() < probability;
}

/** An integer in `[min, max]`, both inclusive. */
export function intBetween(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * Picks one value from `options` with probability proportional to its
 * `weight` (weights need not sum to 1 — they're normalized here). Used to
 * assign each simulated customer a ground-truth persona from the
 * scenario's population mix (§8).
 */
export function pickWeighted<T>(
  rng: Rng,
  options: ReadonlyArray<{ value: T; weight: number }>,
): T {
  const total = options.reduce((sum, o) => sum + o.weight, 0);
  if (total <= 0 || options.length === 0) {
    throw new Error('pickWeighted: options must have a positive total weight');
  }
  let roll = rng() * total;
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) return option.value;
  }
  // Floating-point edge case (roll landed exactly on the tail) — the last
  // option is the only sane fallback, never a silent wrong answer.
  return options[options.length - 1].value;
}
