/**
 * Dashboard principal — resuelve el período actual y el período anterior
 * inmediato de igual longitud, para "comparación vs período anterior".
 * Función pura, sin acceso a DB — separada para poder testearla sin mocks.
 */

export const ALLOWED_PERIOD_DAYS = [7, 30, 90] as const;
export type PeriodDays = (typeof ALLOWED_PERIOD_DAYS)[number];
const DEFAULT_PERIOD_DAYS: PeriodDays = 30;
const MS_PER_DAY = 86_400_000;

export interface DashboardPeriod {
  days: PeriodDays;
  /** Inicio del período actual (inclusive). */
  from: Date;
  /** Fin del período actual — siempre "ahora" (exclusive en las queries `lt`). */
  to: Date;
  /** Período anterior inmediato, misma longitud: [previousFrom, previousTo). */
  previousFrom: Date;
  previousTo: Date;
}

export function parsePeriodDays(raw: string | undefined): PeriodDays {
  const n = Number(raw);
  return (ALLOWED_PERIOD_DAYS as readonly number[]).includes(n)
    ? (n as PeriodDays)
    : DEFAULT_PERIOD_DAYS;
}

export function resolvePeriod(
  periodDays: PeriodDays,
  now: Date = new Date(),
): DashboardPeriod {
  const to = now;
  const from = new Date(to.getTime() - periodDays * MS_PER_DAY);
  const previousTo = from;
  const previousFrom = new Date(from.getTime() - periodDays * MS_PER_DAY);
  return { days: periodDays, from, to, previousFrom, previousTo };
}

/**
 * Absolute + percent change vs. un valor anterior. Si `previous` es 0, el
 * percent change queda `null` — nunca "+∞%" (pedido explícito).
 */
export function computeChange(
  current: number,
  previous: number,
): { absolute: number; percent: number | null } {
  const absolute = current - previous;
  const percent = previous > 0 ? Math.round((absolute / previous) * 100) : null;
  return { absolute, percent };
}

/** Claves de día (YYYY-MM-DD, UTC) entre from (inclusive) y to (inclusive), en orden. */
export function dayKeysBetween(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const end = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()),
  );
  while (cursor.getTime() <= end.getTime()) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

export function dayKeyOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Serie diaria alineada a `dayKeysBetween(period.from, period.to)`: cuántas
 * `dates` caen en cada día. Pura, sin acceso a DB — el caller ya trajo los
 * timestamps (p.ej. `GoogleReview.postedAt`, `Visit.occurredAt`).
 */
export function bucketByDay(dates: Date[], period: DashboardPeriod): number[] {
  const keys = dayKeysBetween(period.from, period.to);
  const counts = new Map<string, number>();
  for (const date of dates) {
    const key = dayKeyOf(date);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return keys.map((key) => counts.get(key) ?? 0);
}
