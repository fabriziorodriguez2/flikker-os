/** Forma del reporte tal como lo devuelve `GET /intelligence/reports/:id`. */

export type MetricUnit = "count" | "percent" | "ratio" | "score";

export interface ReportMetric {
  key: string;
  label: string;
  value: number | null;
  unit: MetricUnit;
  numerator?: number;
  denominator?: number;
  definition: string;
}

export interface ReportDelta {
  key: string;
  label: string;
  unit: MetricUnit;
  a: number | null;
  b: number | null;
  absolute: number | null;
  percentChange: number | null;
}

export interface PeriodBlock {
  label: string;
  from: string;
  to: string;
  partial: boolean;
  metrics: ReportMetric[];
}

export type ReportMetrics =
  | { kind: "PERIOD_SUMMARY"; period: PeriodBlock }
  | { kind: "PERIOD_COMPARISON"; periods: [PeriodBlock, PeriodBlock]; deltas: ReportDelta[] }
  | {
      kind: "CUSTOMER_COHORT";
      cohort: { from: string | null; to: string | null; metrics: ReportMetric[]; segments: ReportMetric[] };
    }
  | {
      kind: "MONTHLY";
      periods: [PeriodBlock, PeriodBlock];
      deltas: ReportDelta[];
      cohort: { metrics: ReportMetric[]; segments: ReportMetric[] };
    };

export interface IntelligenceReport {
  id: string;
  kind: ReportMetrics["kind"];
  title: string;
  timezone: string;
  computedAt: string;
  metrics: ReportMetrics;
  sources: string[];
  notes: { dataNotes: string[]; assumptions: string[] };
  canExport: boolean;
}

const NUMBER = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });

/** "1.234", "50%", "1,5", "sin datos". */
export function formatMetricValue(value: number | null, unit: MetricUnit): string {
  if (value === null) return "sin datos";
  const text = NUMBER.format(value);
  return unit === "percent" ? `${text}%` : text;
}

/** De dónde sale un porcentaje o promedio: "2 de 4". */
export function metricBase(metric: ReportMetric): string | null {
  if (metric.unit === "count" || metric.denominator === undefined) return null;
  if (metric.numerator === undefined) return `sobre ${NUMBER.format(metric.denominator)}`;
  return `${NUMBER.format(metric.numerator)} de ${NUMBER.format(metric.denominator)}`;
}

/** Diferencia de una comparación: puntos para porcentajes, valor y % para el resto. */
export function formatDelta(delta: ReportDelta): string {
  if (delta.absolute === null) return "—";
  const sign = delta.absolute > 0 ? "+" : "";
  if (delta.unit === "percent") return `${sign}${NUMBER.format(delta.absolute)} pts`;
  const change =
    delta.percentChange === null
      ? ""
      : ` (${delta.percentChange > 0 ? "+" : ""}${NUMBER.format(delta.percentChange)}%)`;
  return `${sign}${NUMBER.format(delta.absolute)}${change}`;
}

/** Métricas de conteo que tiene sentido graficar lado a lado. */
const CHART_KEYS = ["visits", "activeCustomers", "returningCustomers", "benefitsRedeemed"];

export function comparisonChartData(periods: [PeriodBlock, PeriodBlock]) {
  return CHART_KEYS.flatMap((key) => {
    const a = periods[0].metrics.find((m) => m.key === key);
    const b = periods[1].metrics.find((m) => m.key === key);
    if (!a || !b) return [];
    return [{ name: a.label, a: a.value ?? 0, b: b.value ?? 0 }];
  });
}

export function periodLabel(block: { from: string; to: string; partial: boolean }) {
  return `${block.from} a ${block.to}${block.partial ? " (en curso)" : ""}`;
}
