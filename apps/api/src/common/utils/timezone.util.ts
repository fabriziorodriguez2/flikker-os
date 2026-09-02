/** Year/month/day/hour/minute of `date` as observed in `timezone`. Month is 1-indexed. */
export interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function getLocalDateTimeParts(
  date: Date,
  timezone: string,
): LocalDateTimeParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/**
 * True when `date`'s local calendar day in `timezone` is the last day of its
 * month. `Date.UTC(year, month, 0)` gives the last day of the target month
 * because `month` here is 1-indexed (e.g. 7 for July) which, used directly as
 * JS's 0-indexed month, already points one month ahead.
 */
export function isLastDayOfMonthInTz(date: Date, timezone: string): boolean {
  const { year, month, day } = getLocalDateTimeParts(date, timezone);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day === lastDay;
}

/** "YYYY-MM" for the local calendar month of `date` in `timezone`. */
export function localPeriodKey(date: Date, timezone: string): string {
  const { year, month } = getLocalDateTimeParts(date, timezone);
  return `${year}-${String(month).padStart(2, '0')}`;
}

/** "YYYY-MM-DD" for the local calendar day of `date` in `timezone`. */
export function localDayKey(date: Date, timezone: string): string {
  const { year, month, day } = getLocalDateTimeParts(date, timezone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Límites de calendario local, como instantes UTC reales.
//
// Existen para que nadie vuelva a resolver una ventana ("este mes", "esta
// semana") restando bloques de 24 o 168 horas: eso rompe en cada cambio de
// horario y ya nos costó un bug de fechas relativas. Un mes local puede durar
// 27 días y 23 horas medido en milisegundos, y eso está bien.
//
// Hay aritmética equivalente en `jobs/owner-lifecycle-time.ts`, escrita antes
// que esto y con su propio motivo documentado para estar ahí. No se unificó en
// esta tanda para no mezclar un refactor transversal con una feature nueva;
// queda como deuda conocida, y este archivo es el hogar canónico.
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;

/** Cuánto se corre `timezone` de UTC en el instante `date`, en ms. */
function timezoneOffsetMs(date: Date, timezone: string): number {
  const { year, month, day, hour, minute } = getLocalDateTimeParts(
    date,
    timezone,
  );
  return Date.UTC(year, month - 1, day, hour, minute) - date.getTime();
}

/**
 * El instante UTC real de la medianoche local de (year, month, day).
 *
 * El offset se mide sobre una primera aproximación y después se corrige, que
 * es lo que hace que funcione también el día en que cambia el horario de
 * verano (donde el offset de la medianoche no es el mismo que el del mediodía).
 */
function zonedMidnightToUtc(
  year: number,
  month: number,
  day: number,
  timezone: string,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day));
  const corrected = new Date(
    guess.getTime() - timezoneOffsetMs(guess, timezone),
  );
  // Segunda pasada: si el primer offset correspondía al otro lado del salto,
  // esta lo recalcula sobre el instante ya corregido.
  return new Date(guess.getTime() - timezoneOffsetMs(corrected, timezone));
}

/** Medianoche local del día que contiene `date`. */
export function startOfLocalDay(date: Date, timezone: string): Date {
  const { year, month, day } = getLocalDateTimeParts(date, timezone);
  return zonedMidnightToUtc(year, month, day, timezone);
}

/** Medianoche local de `days` días de CALENDARIO después del día de `date`. */
export function startOfLocalDayPlus(
  date: Date,
  timezone: string,
  days: number,
): Date {
  const { year, month, day } = getLocalDateTimeParts(date, timezone);
  // Se avanza sobre el calendario (`Date.UTC` normaliza fin de mes y año) y
  // recién ahí se resuelve la medianoche local — nunca sumando milisegundos
  // sobre un instante ya resuelto, que es donde se cuela el error de DST.
  const target = new Date(Date.UTC(year, month - 1, day + days));
  return zonedMidnightToUtc(
    target.getUTCFullYear(),
    target.getUTCMonth() + 1,
    target.getUTCDate(),
    timezone,
  );
}

/** Medianoche local del LUNES de la semana que contiene `date` (semana ISO). */
export function startOfLocalWeek(date: Date, timezone: string): Date {
  const { year, month, day } = getLocalDateTimeParts(date, timezone);
  // getUTCDay sobre la fecha local tratada como UTC da el día de la semana de
  // ESE día de calendario, que es exactamente lo que se busca. 0 = domingo.
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysSinceMonday = weekday === 0 ? 6 : weekday - 1;
  return startOfLocalDayPlus(date, timezone, -daysSinceMonday);
}

/** Medianoche local del día 1 del mes que contiene `date`. */
export function startOfLocalMonth(date: Date, timezone: string): Date {
  const { year, month } = getLocalDateTimeParts(date, timezone);
  return zonedMidnightToUtc(year, month, 1, timezone);
}

/** Medianoche local del día 1 del mes SIGUIENTE al que contiene `date`. */
export function startOfNextLocalMonth(date: Date, timezone: string): Date {
  const { year, month } = getLocalDateTimeParts(date, timezone);
  return month === 12
    ? zonedMidnightToUtc(year + 1, 1, 1, timezone)
    : zonedMidnightToUtc(year, month + 1, 1, timezone);
}

/** Días de calendario local entre dos instantes (puede ser negativo). */
export function localDaysBetween(
  from: Date,
  to: Date,
  timezone: string,
): number {
  const a = getLocalDateTimeParts(from, timezone);
  const b = getLocalDateTimeParts(to, timezone);
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) -
      Date.UTC(a.year, a.month - 1, a.day)) /
      MS_PER_DAY,
  );
}
