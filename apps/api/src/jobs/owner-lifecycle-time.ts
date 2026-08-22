/**
 * Aritmética pura de fecha/hora local para los emails de ciclo de vida al
 * dueño (`owner-lifecycle-emails.service.ts`). Deliberadamente duplicado de
 * `owner-notifications.worker.ts` (no extraído) — ver el plan: evitar un
 * segundo touch a ese archivo LEGACY-adjacent. Sin dependencias de Prisma,
 * así que se testea sin mocks.
 */

const MS_PER_DAY = 86_400_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface LocalParts {
  weekday: string;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function localParts(date: Date, timezone: string): LocalParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const entries = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    weekday: entries.weekday,
    year: Number(entries.year),
    month: Number(entries.month),
    day: Number(entries.day),
    hour: Number(entries.hour === '24' ? 0 : entries.hour),
    minute: Number(entries.minute),
  };
}

/** Medianoche local de esa fecha, como instante UTC — para diffear en días de calendario, nunca en milisegundos crudos. */
function localMidnightUtc(date: Date, timezone: string): Date {
  const parts = localParts(date, timezone);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

/** Cuántos días de calendario LOCAL separan `from` de `to` (puede ser negativo). */
export function calendarDayDiff(
  from: Date,
  to: Date,
  timezone: string,
): number {
  const fromMidnight = localMidnightUtc(from, timezone);
  const toMidnight = localMidnightUtc(to, timezone);
  return Math.round(
    (toMidnight.getTime() - fromMidnight.getTime()) / MS_PER_DAY,
  );
}

export function isLocalWeekdayAtHour(
  date: Date,
  timezone: string,
  weekday: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun',
  hour: number,
): boolean {
  const parts = localParts(date, timezone);
  return parts.weekday === weekday && parts.hour === hour;
}

export function isLocalDayOfMonthAtHour(
  date: Date,
  timezone: string,
  dayOfMonth: number,
  hour: number,
): boolean {
  const parts = localParts(date, timezone);
  return parts.day === dayOfMonth && parts.hour === hour;
}

/** 'yyyy-MM-dd' del lunes de la semana local de `date` — clave de dedupe del resumen semanal. */
export function localMondayIso(date: Date, timezone: string): string {
  const parts = localParts(date, timezone);
  const dayIndex = WEEKDAYS.indexOf(parts.weekday); // 0=Sun..6=Sat
  const isoOffset = dayIndex === 0 ? 6 : dayIndex - 1; // días desde el lunes
  const monday = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day) - isoOffset * MS_PER_DAY,
  );
  return monday.toISOString().slice(0, 10);
}

/** 'yyyy-MM' del mes local de `date`. */
export function localMonthKey(date: Date, timezone: string): string {
  const parts = localParts(date, timezone);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
}

/** 'yyyy-MM' del mes local INMEDIATAMENTE ANTERIOR al de `date`. */
export function previousLocalMonthKey(date: Date, timezone: string): string {
  const parts = localParts(date, timezone);
  const prevMonthDate = new Date(Date.UTC(parts.year, parts.month - 2, 1));
  return `${prevMonthDate.getUTCFullYear()}-${String(
    prevMonthDate.getUTCMonth() + 1,
  ).padStart(2, '0')}`;
}

function timezoneOffsetMs(date: Date, timezone: string): number {
  const parts = localParts(date, timezone);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
  );
  return localAsUtc - date.getTime();
}

/** El instante UTC real que corresponde a medianoche local de (year, month, day) en `timezone`. */
function zonedMidnightToUtc(
  year: number,
  month: number,
  day: number,
  timezone: string,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day));
  const offset = timezoneOffsetMs(guess, timezone);
  return new Date(guess.getTime() - offset);
}

/** [inicio, fin) del mes local que contiene `date`, como instantes UTC reales. */
export function localMonthRangeContaining(
  date: Date,
  timezone: string,
): { start: Date; end: Date } {
  const parts = localParts(date, timezone);
  const start = zonedMidnightToUtc(parts.year, parts.month, 1, timezone);
  const endParts =
    parts.month === 12
      ? { year: parts.year + 1, month: 1 }
      : { year: parts.year, month: parts.month + 1 };
  const end = zonedMidnightToUtc(endParts.year, endParts.month, 1, timezone);
  return { start, end };
}

/** [inicio, fin) del mes local INMEDIATAMENTE ANTERIOR al que contiene `date`. */
export function previousLocalMonthRange(
  date: Date,
  timezone: string,
): { start: Date; end: Date } {
  const parts = localParts(date, timezone);
  const prevMonth = parts.month === 1 ? 12 : parts.month - 1;
  const prevYear = parts.month === 1 ? parts.year - 1 : parts.year;
  const start = zonedMidnightToUtc(prevYear, prevMonth, 1, timezone);
  const end = zonedMidnightToUtc(parts.year, parts.month, 1, timezone);
  return { start, end };
}

/** [inicio, fin) de los últimos 7 días de calendario local que ya cerraron, terminando hoy a medianoche local. */
export function previousLocalWeekRange(
  date: Date,
  timezone: string,
): { start: Date; end: Date } {
  const parts = localParts(date, timezone);
  const end = zonedMidnightToUtc(parts.year, parts.month, parts.day, timezone);
  const start = new Date(end.getTime() - 7 * MS_PER_DAY);
  return { start, end };
}
