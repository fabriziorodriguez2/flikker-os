import { chance, createSeededRandom, intBetween, pickWeighted } from './prng';

describe('createSeededRandom — §9: reproducible, no scattered Math.random()', () => {
  it('produces the exact same sequence for the same seed', () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces a different sequence for a different seed', () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(43);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('always returns values in [0, 1)', () => {
    const rng = createSeededRandom(1);
    for (let i = 0; i < 1000; i++) {
      const value = rng();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('treats a seed of 0 the same as any other seed (never silently degenerate)', () => {
    const rng = createSeededRandom(0);
    const values = Array.from({ length: 10 }, () => rng());
    expect(new Set(values).size).toBeGreaterThan(1);
  });
});

describe('chance', () => {
  it('always happens at probability 1', () => {
    const rng = createSeededRandom(7);
    for (let i = 0; i < 50; i++) expect(chance(rng, 1)).toBe(true);
  });

  it('never happens at probability 0', () => {
    const rng = createSeededRandom(7);
    for (let i = 0; i < 50; i++) expect(chance(rng, 0)).toBe(false);
  });

  it('lands close to the configured probability over many rolls', () => {
    const rng = createSeededRandom(123);
    let hits = 0;
    const trials = 20_000;
    for (let i = 0; i < trials; i++) if (chance(rng, 0.3)) hits++;
    expect(hits / trials).toBeGreaterThan(0.27);
    expect(hits / trials).toBeLessThan(0.33);
  });
});

describe('intBetween', () => {
  it('never goes outside [min, max]', () => {
    const rng = createSeededRandom(99);
    for (let i = 0; i < 500; i++) {
      const value = intBetween(rng, 3, 7);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(7);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = createSeededRandom(5);
    const b = createSeededRandom(5);
    const seqA = Array.from({ length: 10 }, () => intBetween(a, 1, 100));
    const seqB = Array.from({ length: 10 }, () => intBetween(b, 1, 100));
    expect(seqA).toEqual(seqB);
  });
});

describe('pickWeighted — §8: assigns ground-truth personas from a population mix', () => {
  it('always returns the only option when there is just one', () => {
    const rng = createSeededRandom(1);
    for (let i = 0; i < 20; i++) {
      expect(pickWeighted(rng, [{ value: 'ONLY', weight: 1 }])).toBe('ONLY');
    }
  });

  it('never returns an option with zero weight', () => {
    const rng = createSeededRandom(2);
    for (let i = 0; i < 500; i++) {
      const value = pickWeighted(rng, [
        { value: 'NEVER', weight: 0 },
        { value: 'ALWAYS', weight: 1 },
      ]);
      expect(value).toBe('ALWAYS');
    }
  });

  it('lands close to the configured proportions over many draws', () => {
    const rng = createSeededRandom(3);
    const counts = { A: 0, B: 0, C: 0 };
    const trials = 30_000;
    for (let i = 0; i < trials; i++) {
      const pick = pickWeighted(rng, [
        { value: 'A' as const, weight: 0.5 },
        { value: 'B' as const, weight: 0.3 },
        { value: 'C' as const, weight: 0.2 },
      ]);
      counts[pick]++;
    }
    expect(counts.A / trials).toBeGreaterThan(0.47);
    expect(counts.A / trials).toBeLessThan(0.53);
    expect(counts.B / trials).toBeGreaterThan(0.27);
    expect(counts.B / trials).toBeLessThan(0.33);
    expect(counts.C / trials).toBeGreaterThan(0.17);
    expect(counts.C / trials).toBeLessThan(0.23);
  });

  it('normalizes weights that do not sum to 1', () => {
    const rng = createSeededRandom(4);
    const counts = { X: 0, Y: 0 };
    const trials = 10_000;
    for (let i = 0; i < trials; i++) {
      const pick = pickWeighted(rng, [
        { value: 'X' as const, weight: 4 },
        { value: 'Y' as const, weight: 1 },
      ]);
      counts[pick]++;
    }
    expect(counts.X / trials).toBeGreaterThan(0.75);
  });

  it('throws when every weight is zero rather than silently picking something', () => {
    const rng = createSeededRandom(5);
    expect(() =>
      pickWeighted(rng, [
        { value: 'A', weight: 0 },
        { value: 'B', weight: 0 },
      ]),
    ).toThrow();
  });

  it('is deterministic for a given seed', () => {
    const options = [
      { value: 'A' as const, weight: 0.3 },
      { value: 'B' as const, weight: 0.3 },
      { value: 'C' as const, weight: 0.4 },
    ];
    const a = createSeededRandom(6);
    const b = createSeededRandom(6);
    const seqA = Array.from({ length: 50 }, () => pickWeighted(a, options));
    const seqB = Array.from({ length: 50 }, () => pickWeighted(b, options));
    expect(seqA).toEqual(seqB);
  });
});
