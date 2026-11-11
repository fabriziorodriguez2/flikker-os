import { renderToStaticMarkup } from "react-dom/server";
import MessageItem from "./message-item";
import { presentMessage } from "./message-presentation";
import { ReportView } from "./report-card";
import {
  comparisonChartData,
  formatDelta,
  formatMetricValue,
  metricBase,
  type IntelligenceReport,
  type PeriodBlock,
  type ReportMetric,
} from "./report-view";

// Datos de ejemplo SOLO para el test: la pantalla siempre lee el reporte de la API.
const metric = (key: string, label: string, value: number | null, extra: Partial<ReportMetric> = {}): ReportMetric => ({
  key,
  label,
  value,
  unit: "count",
  definition: `def ${key}`,
  ...extra,
});

const october: PeriodBlock = {
  label: "B",
  from: "2026-10-01",
  to: "2026-10-31",
  partial: false,
  metrics: [
    metric("visits", "Visitas", 6),
    metric("activeCustomers", "Clientes que visitaron", 4),
    metric("returningCustomers", "Clientes que volvieron", 2),
    metric("recurrenceRatePercent", "Recurrencia", 50, { unit: "percent", numerator: 2, denominator: 4 }),
    metric("benefitsRedeemed", "Beneficios canjeados", 2),
  ],
};
const september: PeriodBlock = {
  ...october,
  label: "A",
  from: "2026-09-01",
  to: "2026-09-30",
  metrics: [
    metric("visits", "Visitas", 4),
    metric("activeCustomers", "Clientes que visitaron", 3),
    metric("returningCustomers", "Clientes que volvieron", 1),
    metric("recurrenceRatePercent", "Recurrencia", 33.3, { unit: "percent", numerator: 1, denominator: 3 }),
    metric("benefitsRedeemed", "Beneficios canjeados", 1),
  ],
};

const comparison: IntelligenceReport = {
  id: "22222222-2222-4222-8222-222222222222",
  kind: "PERIOD_COMPARISON",
  title: "Comparación septiembre vs octubre",
  timezone: "America/Montevideo",
  computedAt: "2026-11-10T15:00:00Z",
  metrics: {
    kind: "PERIOD_COMPARISON",
    periods: [september, october],
    deltas: [
      { key: "visits", label: "Visitas", unit: "count", a: 4, b: 6, absolute: 2, percentChange: 50 },
      { key: "recurrenceRatePercent", label: "Recurrencia", unit: "percent", a: 33.3, b: 50, absolute: 16.7, percentChange: null },
    ],
  },
  sources: ["Visit", "Customer"],
  notes: {
    dataNotes: ["Flikker registra visitas (check-ins), no compras ni ventas."],
    assumptions: ["Días calculados en hora local (America/Montevideo)."],
  },
  canExport: true,
};

describe("formato de reportes", () => {
  it("valores, bases y cambios con formato rioplatense", () => {
    expect(formatMetricValue(1234, "count")).toBe("1.234");
    expect(formatMetricValue(33.3, "percent")).toBe("33,3%");
    expect(formatMetricValue(null, "count")).toBe("sin datos");
    expect(metricBase(october.metrics[3])).toBe("2 de 4");
    expect(metricBase(october.metrics[0])).toBeNull();
    expect(formatDelta(comparison.metrics.kind === "PERIOD_COMPARISON" ? comparison.metrics.deltas[0] : (null as never))).toBe("+2 (+50%)");
    expect(formatDelta({ key: "r", label: "r", unit: "percent", a: 33.3, b: 50, absolute: 16.7, percentChange: null })).toBe("+16,7 pts");
    expect(formatDelta({ key: "v", label: "v", unit: "count", a: 6, b: 4, absolute: -2, percentChange: -33.3 })).toBe("-2 (-33,3%)");
  });

  it("el gráfico usa solo conteos comparables de ambos períodos", () => {
    expect(comparisonChartData([september, october])).toEqual([
      { name: "Visitas", a: 4, b: 6 },
      { name: "Clientes que visitaron", a: 3, b: 4 },
      { name: "Clientes que volvieron", a: 1, b: 2 },
      { name: "Beneficios canjeados", a: 1, b: 2 },
    ]);
  });
});

describe("ReportView", () => {
  it("comparación: tabla con ambos períodos, cambio, notas y fuentes", () => {
    const html = renderToStaticMarkup(<ReportView report={comparison} />);
    expect(html).toContain("Comparación septiembre vs octubre");
    expect(html).toContain("2026-09-01 a 2026-09-30");
    expect(html).toContain("2026-10-01 a 2026-10-31");
    expect(html).toContain("+2 (+50%)");
    expect(html).toContain("+16,7 pts");
    expect(html).toContain("no compras ni ventas");
    expect(html).toContain("Fuentes: Visit, Customer");
    expect(html).toContain('aria-label="Gráfico comparativo"');
  });

  it("exportar aparece solo si el rol lo permite", () => {
    const allowed = renderToStaticMarkup(<ReportView report={comparison} />);
    expect(allowed).toContain(`/api/proxy/intelligence/reports/${comparison.id}/export?format=csv`);
    expect(allowed).toContain("format=pdf");
    const denied = renderToStaticMarkup(<ReportView report={{ ...comparison, canExport: false }} />);
    expect(denied).not.toContain("/export?");
  });

  it("resumen de período: cada porcentaje muestra su base", () => {
    const html = renderToStaticMarkup(
      <ReportView
        report={{
          ...comparison,
          kind: "PERIOD_SUMMARY",
          title: "Resumen de octubre",
          metrics: { kind: "PERIOD_SUMMARY", period: october },
        }}
      />,
    );
    expect(html).toContain("Recurrencia");
    expect(html).toContain("50%");
    expect(html).toContain("(2 de 4)");
  });
});

describe("en el chat", () => {
  const toolMessage = (metadata: Record<string, unknown>) => ({
    id: "m",
    role: "TOOL" as const,
    kind: "TOOL_RESULT" as const,
    content: "{}",
    metadata,
    createdAt: "2026-11-10T12:00:00Z",
  });

  it("un resultado con reporte se muestra como tarjeta que se carga de la API", () => {
    const message = toolMessage({ toolLabel: "Comparó los dos períodos", ok: true, reportId: comparison.id });
    expect(presentMessage(message)).toMatchObject({ variant: "report-card", reportId: comparison.id });
    const html = renderToStaticMarkup(<MessageItem message={message} />);
    expect(html).toContain("Comparó los dos períodos");
    expect(html).toContain('aria-label="Cargando reporte"');
  });

  it("un reportId inválido o un resultado fallido no genera tarjeta", () => {
    expect(presentMessage(toolMessage({ reportId: "../../x", ok: true })).variant).toBe("tool");
    expect(presentMessage(toolMessage({ reportId: comparison.id, ok: false })).variant).toBe("tool");
  });
});
