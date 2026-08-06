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
