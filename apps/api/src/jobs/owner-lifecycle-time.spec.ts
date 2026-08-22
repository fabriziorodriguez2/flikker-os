import {
  calendarDayDiff,
  isLocalDayOfMonthAtHour,
  isLocalWeekdayAtHour,
  localMondayIso,
  localMonthKey,
  previousLocalMonthKey,
  previousLocalMonthRange,
  previousLocalWeekRange,
} from './owner-lifecycle-time';

const TZ = 'America/Montevideo'; // UTC-3, sin DST

describe('calendarDayDiff', () => {
  it('cuenta días de calendario, no milisegundos crudos', () => {
    const from = new Date('2026-08-01T23:50:00.000Z'); // 2026-08-01 20:50 local
    const to = new Date('2026-08-08T00:10:00.000Z'); // 2026-08-07 21:10 local
    expect(calendarDayDiff(from, to, TZ)).toBe(6);
  });

  it('es 0 el mismo día local aunque cambien las horas', () => {
    const from = new Date('2026-08-01T13:00:00.000Z');
    const to = new Date('2026-08-01T23:00:00.000Z');
    expect(calendarDayDiff(from, to, TZ)).toBe(0);
  });
});

describe('isLocalWeekdayAtHour / isLocalDayOfMonthAtHour', () => {
  it('reconoce un lunes 9am local', () => {
    // 2026-08-17 es lunes. 09:00 local (UTC-3) = 12:00 UTC.
    const monday9am = new Date('2026-08-17T12:00:00.000Z');
    expect(isLocalWeekdayAtHour(monday9am, TZ, 'Mon', 9)).toBe(true);
    expect(isLocalWeekdayAtHour(monday9am, TZ, 'Mon', 10)).toBe(false);
    expect(isLocalWeekdayAtHour(monday9am, TZ, 'Tue', 9)).toBe(false);
  });

  it('reconoce el día 1 del mes a las 9am local', () => {
    const firstOfMonth9am = new Date('2026-09-01T12:00:00.000Z');
    expect(isLocalDayOfMonthAtHour(firstOfMonth9am, TZ, 1, 9)).toBe(true);
    expect(isLocalDayOfMonthAtHour(firstOfMonth9am, TZ, 2, 9)).toBe(false);
  });
});

describe('localMondayIso', () => {
  it('devuelve el lunes de la semana local, incluso un domingo', () => {
    // 2026-08-23 es domingo local.
    const sunday = new Date('2026-08-23T15:00:00.000Z');
    expect(localMondayIso(sunday, TZ)).toBe('2026-08-17');
  });
});

describe('localMonthKey / previousLocalMonthKey', () => {
  it('calcula el mes local actual y el anterior, incluso cruzando año', () => {
    const januaryFirst = new Date('2026-01-01T12:00:00.000Z');
    expect(localMonthKey(januaryFirst, TZ)).toBe('2026-01');
    expect(previousLocalMonthKey(januaryFirst, TZ)).toBe('2025-12');
  });
});

describe('previousLocalMonthRange / previousLocalWeekRange', () => {
  it('el mes anterior es [inicio, fin) sin superposición con el actual', () => {
    const now = new Date('2026-09-01T12:00:00.000Z');
    const range = previousLocalMonthRange(now, TZ);
    expect(range.start.toISOString()).toBe('2026-08-01T03:00:00.000Z'); // medianoche local 1/8 en UTC-3
    expect(range.end.toISOString()).toBe('2026-09-01T03:00:00.000Z');
  });

  it('la semana anterior son 7 días de calendario local terminando hoy', () => {
    const monday = new Date('2026-08-17T12:00:00.000Z');
    const range = previousLocalWeekRange(monday, TZ);
    expect(range.end.getTime() - range.start.getTime()).toBe(7 * 86_400_000);
  });
});
