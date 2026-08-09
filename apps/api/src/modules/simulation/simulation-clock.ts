/**
 * §5 — default virtual start instant: 2026-01-01T14:00 in America/Montevideo
 * (UTC-3 year-round; Uruguay has had no DST since 2015), i.e.
 * 2026-01-01T17:00:00.000Z. Kept as a plain UTC literal rather than pulling
 * in a timezone-conversion dependency (CLAUDE.md §8: no new deps without a
 * real need) — the codebase's own `timezone.util.ts` only converts
 * UTC→local for display, not local→UTC, and one hardcoded, documented
 * default doesn't justify adding that.
 *
 * BUG FOUND during the mandatory runs (§38) and fixed here, disclosed in
 * the final report: the request's own example default, 08:00, sits
 * BEFORE `RetentionSettings.sendingHourStart`'s own default of 10 —
 * `RetentionV2SendService.isWithinSendingWindow` (real, unchanged) then
 * correctly rejects every single send, every single virtual day, for the
 * entire run. That is not a Flikker bug — it is the real send-window guard
 * working exactly as designed — but a simulation whose clock never once
 * lands inside business hours never exercises the real send pipeline at
 * all, which defeats the whole point of simulating it. 14:00 sits
 * comfortably inside the default 10–20 window with margin on both sides.
 */
export const DEFAULT_SIMULATION_START_AT = new Date('2026-01-01T17:00:00.000Z');

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Simulation Center §5 — a pure virtual clock. Compresses days/weeks of
 * simulated time into synchronous calls: nothing here ever sleeps or waits
 * on a real timer. The engine (a later batch) advances it explicitly between
 * steps; every "loop-driving" real service it calls receives this clock's
 * `now()` as its `now: Date` parameter, exactly as those services already
 * expect from prior phases — no service internals change.
 */
export class SimulationClock {
  private currentMs: number;
  private readonly startAtMs: number;

  constructor(startAt: Date = DEFAULT_SIMULATION_START_AT) {
    this.startAtMs = startAt.getTime();
    this.currentMs = this.startAtMs;
  }

  now(): Date {
    return new Date(this.currentMs);
  }

  advanceHours(hours: number): Date {
    this.currentMs += hours * MS_PER_HOUR;
    return this.now();
  }

  advanceDays(days: number): Date {
    return this.advanceHours(days * 24);
  }

  /** Whole virtual days elapsed since `startAt` — 0 on the first day. */
  get currentVirtualDay(): number {
    return Math.floor((this.currentMs - this.startAtMs) / MS_PER_DAY);
  }
}
