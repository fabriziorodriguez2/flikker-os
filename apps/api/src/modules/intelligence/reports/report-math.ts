import { zonedMidnightToUtc } from '../../../jobs/owner-lifecycle-time';

/**
 * Aritmética pura de reportes: períodos en hora local del negocio, métricas
 * con su numerador/denominador y variaciones. Sin Prisma, para testear cada
 * regla contra números escritos a mano.
 */

export type MetricUnit = 'count' | 'percent' | 'ratio' | 'score';

export interface Metric {
  key: string;
  label: string;
  value: number | null;
  unit: MetricUnit;
  /** Para porcentajes y promedios: de dónde sale el valor. */
  numerator?: number;
  denominator?: number;
  definition: string;
}

export interface ResolvedRange {
  /** Fechas locales del pedido, inclusivas ("del 1 al 31 de octubre"). */
  fromDay: string;
  toDay: string;
  start: Date;
  /** Exclusivo. Si el período no terminó, es "ahora". */
  end: Date;
  partial: boolean;
}

export const MAX_RANGE_DAYS = 366;
const MIN_DAY = '2020-01-01';
const MS_PER_DAY = 86_400_000;

export class ReportRangeError extends Error {}

export function parseDay(
  value: unknown,
): { y: number; m: number; d: number } | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y &&
    probe.getUTCMonth() === m - 1 &&
    probe.getUTCDate() === d
    ? { y, m, d }
    : null;
}

export function parseMonth(value: unknown): { y: number; m: number } | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [y, m] = value.split('-').map(Number);
  return m >= 1 && m <= 12 ? { y, m } : null;
}

function addDays(day: { y: number; m: number; d: number }, n: number) {
  const next = new Date(Date.UTC(day.y, day.m - 1, day.d + n));
  return {
    y: next.getUTCFullYear(),
    m: next.getUTCMonth() + 1,
    d: next.getUTCDate(),
  };
}

function dayKey(day: { y: number; m: number; d: number }) {
  return `${day.y}-${String(day.m).padStart(2, '0')}-${String(day.d).padStart(2, '0')}`;
}

/** [desde, hasta] inclusivo en días locales → instantes UTC [inicio, fin). */
export function resolveRange(
  fromRaw: unknown,
  toRaw: unknown,
  timezone: string,
  now: Date,
): ResolvedRange {
  const from = parseDay(fromRaw);
  const to = parseDay(toRaw);
  if (!from || !to)
    throw new ReportRangeError(
      'Las fechas tienen que tener formato AAAA-MM-DD.',
    );
  if (dayKey(from) < MIN_DAY)
    throw new ReportRangeError('El período empieza antes de 2020.');
  if (dayKey(from) > dayKey(to))
    throw new ReportRangeError('La fecha de inicio es posterior a la de fin.');

  const start = zonedMidnightToUtc(from.y, from.m, from.d, timezone);
  const afterTo = addDays(to, 1);
  const naturalEnd = zonedMidnightToUtc(
    afterTo.y,
    afterTo.m,
    afterTo.d,
    timezone,
  );
  if (
    (naturalEnd.getTime() - start.getTime()) / MS_PER_DAY >
    MAX_RANGE_DAYS + 1
  ) {
    throw new ReportRangeError(
      `El período no puede superar ${MAX_RANGE_DAYS} días.`,
    );
  }
  if (start.getTime() >= now.getTime()) {
    throw new ReportRangeError('El período todavía no empezó.');
  }
  const partial = naturalEnd.getTime() > now.getTime();
  return {
    fromDay: dayKey(from),
    toDay: dayKey(to),
    start,
    end: partial ? now : naturalEnd,
    partial,
  };
}

/** Mes calendario local "AAAA-MM" → su rango, y el del mes anterior. */
export function monthRanges(monthRaw: unknown, timezone: string, now: Date) {
  const month = parseMonth(monthRaw);
  if (!month)
    throw new ReportRangeError('El mes tiene que tener formato AAAA-MM.');
  const last = addDays(
    {
      y: month.m === 12 ? month.y + 1 : month.y,
      m: month.m === 12 ? 1 : month.m + 1,
      d: 1,
    },
    -1,
  );
  const prevFirst =
    month.m === 1
      ? { y: month.y - 1, m: 12, d: 1 }
      : { y: month.y, m: month.m - 1, d: 1 };
  const prevLast = addDays({ y: month.y, m: month.m, d: 1 }, -1);
  return {
    current: resolveRange(
      dayKey({ ...month, d: 1 }),
      dayKey(last),
      timezone,
      now,
    ),
    previous: resolveRange(dayKey(prevFirst), dayKey(prevLast), timezone, now),
  };
}

export function percent(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : null;
}

export function ratio(part: number, total: number): number | null {
  return total > 0 ? Math.round((part / total) * 100) / 100 : null;
}

export interface MetricDelta {
  key: string;
  label: string;
  unit: MetricUnit;
  a: number | null;
  b: number | null;
  /** b − a. */
  absolute: number | null;
  /** Variación porcentual de a → b; null si a es 0 o falta. Para porcentajes, la diferencia es en puntos. */
  percentChange: number | null;
}

/** Variaciones de A (base) → B, métrica por métrica, con la misma clave. */
export function deltas(a: Metric[], b: Metric[]): MetricDelta[] {
  return a.map((metricA) => {
    const metricB = b.find((m) => m.key === metricA.key);
    const va = metricA.value;
    const vb = metricB?.value ?? null;
    const absolute =
      va !== null && vb !== null ? Math.round((vb - va) * 100) / 100 : null;
    return {
      key: metricA.key,
      label: metricA.label,
      unit: metricA.unit,
      a: va,
      b: vb,
      absolute,
      percentChange:
        metricA.unit === 'percent' || va === null || vb === null || va === 0
          ? null
          : Math.round(((vb - va) / va) * 1000) / 10,
    };
  });
}

/** Una celda CSV segura: comillas escapadas y sin fórmulas (=, +, -, @). */
export function csvCell(
  value: string | number | boolean | null | undefined,
): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && typeof value !== 'number') text = `'${text}`;
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRow(
  values: (string | number | boolean | null | undefined)[],
): string {
  return values.map(csvCell).join(',');
}
