import {
  DEFAULT_SIMULATION_START_AT,
  SimulationClock,
} from './simulation-clock';

describe('SimulationClock — §5: pure, no real sleep', () => {
  it('defaults to 2026-01-01T14:00 America/Montevideo (2026-01-01T17:00:00.000Z) — inside the default sending window', () => {
    const clock = new SimulationClock();
    expect(clock.now()).toEqual(DEFAULT_SIMULATION_START_AT);
    expect(clock.currentVirtualDay).toBe(0);
  });

  it('accepts a configurable startAt', () => {
    const startAt = new Date('2027-05-10T00:00:00.000Z');
    const clock = new SimulationClock(startAt);
    expect(clock.now()).toEqual(startAt);
  });

  it('advances by whole hours without touching the wall clock', () => {
    const clock = new SimulationClock(new Date('2026-01-01T00:00:00.000Z'));
    clock.advanceHours(5);
    expect(clock.now()).toEqual(new Date('2026-01-01T05:00:00.000Z'));
  });

  it('advances by whole days', () => {
    const clock = new SimulationClock(new Date('2026-01-01T00:00:00.000Z'));
    clock.advanceDays(3);
    expect(clock.now()).toEqual(new Date('2026-01-04T00:00:00.000Z'));
  });

  it('accumulates advances across many calls', () => {
    const clock = new SimulationClock(new Date('2026-01-01T00:00:00.000Z'));
    for (let i = 0; i < 10; i++) clock.advanceDays(1);
    expect(clock.now()).toEqual(new Date('2026-01-11T00:00:00.000Z'));
  });

  it('currentVirtualDay counts whole days elapsed since startAt', () => {
    const clock = new SimulationClock(new Date('2026-01-01T00:00:00.000Z'));
    expect(clock.currentVirtualDay).toBe(0);
    clock.advanceHours(23);
    expect(clock.currentVirtualDay).toBe(0);
    clock.advanceHours(1);
    expect(clock.currentVirtualDay).toBe(1);
    clock.advanceDays(59);
    expect(clock.currentVirtualDay).toBe(60);
  });

  it('runs 60 virtual days forward synchronously and fast (no real timers)', () => {
    const clock = new SimulationClock(new Date('2026-01-01T00:00:00.000Z'));
    const startedAt = Date.now();
    for (let day = 0; day < 60; day++) clock.advanceDays(1);
    expect(Date.now() - startedAt).toBeLessThan(100);
    expect(clock.currentVirtualDay).toBe(60);
  });

  it("regression (§38 run A finding): every virtual day lands inside RetentionSettings' default 10–20 sending window in America/Montevideo, never just once but for the whole run — otherwise RetentionV2SendService.isWithinSendingWindow rejects every single send and the simulation never exercises the real send pipeline at all", () => {
    const clock = new SimulationClock();
    for (let day = 0; day < 90; day++) {
      const hour = Number(
        new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Montevideo',
          hour: '2-digit',
          hourCycle: 'h23',
        })
          .formatToParts(clock.now())
          .find((p) => p.type === 'hour')?.value,
      );
      expect(hour).toBeGreaterThanOrEqual(10);
      expect(hour).toBeLessThan(20);
      clock.advanceDays(1);
    }
  });
});
