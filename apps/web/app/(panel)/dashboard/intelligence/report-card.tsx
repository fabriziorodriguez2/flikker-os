"use client";

import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Button from "@/components/ui/button";
import { messageForStatus } from "./intelligence-api";
import { formatConversationLongDate } from "./format-date";
import {
  comparisonChartData,
  formatDelta,
  formatMetricValue,
  metricBase,
  periodLabel,
  type IntelligenceReport,
  type PeriodBlock,
  type ReportDelta,
  type ReportMetric,
} from "./report-view";

const BASE = "/api/proxy/intelligence/reports";

/**
 * Un reporte guardado, leído de la API (no del texto del modelo): tabla,
 * gráfico, supuestos, fuentes y exportación si el rol lo permite.
 */
export default function ReportCard({ reportId }: { reportId: string }) {
  const [report, setReport] = useState<IntelligenceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`${BASE}/${encodeURIComponent(reportId)}`);
        if (!res.ok) throw new Error(messageForStatus(res.status));
        const data = (await res.json()) as IntelligenceReport;
        if (!cancelled) {
          setReport(data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : messageForStatus(0));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId, reload]);

  if (error) {
    return (
      <ReportShell>
        <p className="text-sm text-[color:var(--panel-danger-text)]">No pudimos cargar el reporte. {error}</p>
        <Button size="sm" className="mt-2" onClick={() => setReload((n) => n + 1)}>
          Reintentar
        </Button>
      </ReportShell>
    );
  }
  if (!report) {
    return (
      <ReportShell>
        <div className="h-24 animate-pulse rounded-[var(--panel-radius-control)] bg-[color:var(--panel-surface-muted)]" aria-label="Cargando reporte" />
      </ReportShell>
    );
  }
  return <ReportView report={report} />;
}

function ReportShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[680px] rounded-[var(--panel-radius-card)] border border-[color:var(--panel-info-border)] bg-[color:var(--panel-surface)] p-4" data-variant="report-card">
      {children}
    </div>
  );
}

export function ReportView({ report }: { report: IntelligenceReport }) {
  const m = report.metrics;
  return (
    <ReportShell>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--panel-info-text)]">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            Reporte
          </p>
          <h3 className="mt-1 text-sm font-semibold text-[color:var(--panel-text)]">{report.title}</h3>
          <p className="text-xs text-[color:var(--panel-text-muted)]">
            Calculado el {formatConversationLongDate(report.computedAt)} · hora local {report.timezone}
          </p>
        </div>
        {report.canExport ? (
          <div className="flex gap-1">
            <a
              href={`${BASE}/${report.id}/export?format=csv`}
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--panel-radius-control)] border border-[color:var(--panel-border)] px-2.5 text-xs font-semibold text-[color:var(--panel-text)] hover:bg-[color:var(--panel-surface-subtle)]"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              CSV
            </a>
            <a
              href={`${BASE}/${report.id}/export?format=pdf`}
              className="inline-flex h-8 items-center gap-1.5 rounded-[var(--panel-radius-control)] border border-[color:var(--panel-border)] px-2.5 text-xs font-semibold text-[color:var(--panel-text)] hover:bg-[color:var(--panel-surface-subtle)]"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              PDF
            </a>
          </div>
        ) : null}
      </div>

      <div className="mt-3 space-y-4">
        {m.kind === "PERIOD_SUMMARY" ? (
          <MetricsTable caption={periodLabel(m.period)} metrics={m.period.metrics} />
        ) : null}

        {m.kind === "PERIOD_COMPARISON" || m.kind === "MONTHLY" ? (
          <>
            <ComparisonTable periods={m.periods} deltas={m.deltas} />
            <ComparisonChart periods={m.periods} />
          </>
        ) : null}

        {m.kind === "CUSTOMER_COHORT" || m.kind === "MONTHLY" ? (
          <>
            <MetricsTable
              caption={m.kind === "MONTHLY" ? "Clientes registrados en el mes" : "Cohorte de clientes"}
              metrics={m.cohort.metrics}
            />
            <SegmentBars segments={m.cohort.segments} />
          </>
        ) : null}
      </div>

      <details className="mt-3 text-xs text-[color:var(--panel-text-muted)]">
        <summary className="cursor-pointer font-medium text-[color:var(--panel-text-secondary)]">
          Notas, supuestos y fuentes
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {[...report.notes.dataNotes, ...report.notes.assumptions].map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <p className="mt-2">Fuentes: {report.sources.join(", ")}</p>
      </details>
    </ReportShell>
  );
}

function MetricsTable({ caption, metrics }: { caption: string; metrics: ReportMetric[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="pb-1 text-left text-xs font-medium text-[color:var(--panel-text-muted)]">{caption}</caption>
        <tbody>
          {metrics.map((metric) => {
            const base = metricBase(metric);
            return (
              <tr key={metric.key} className="border-t border-[color:var(--panel-border)]" title={metric.definition}>
                <th scope="row" className="py-1.5 pr-3 text-left font-normal text-[color:var(--panel-text-secondary)]">
                  {metric.label}
                </th>
                <td className="py-1.5 text-right font-semibold tabular-nums text-[color:var(--panel-text)]">
                  {formatMetricValue(metric.value, metric.unit)}
                  {base ? (
                    <span className="ml-1.5 text-xs font-normal text-[color:var(--panel-text-muted)]">({base})</span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ComparisonTable({ periods, deltas }: { periods: [PeriodBlock, PeriodBlock]; deltas: ReportDelta[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] text-sm">
        <thead>
          <tr className="text-xs text-[color:var(--panel-text-muted)]">
            <th scope="col" className="pb-1 text-left font-medium">Métrica</th>
            <th scope="col" className="pb-1 text-right font-medium">{periodLabel(periods[0])}</th>
            <th scope="col" className="pb-1 text-right font-medium">{periodLabel(periods[1])}</th>
            <th scope="col" className="pb-1 text-right font-medium">Cambio</th>
          </tr>
        </thead>
        <tbody>
          {deltas.map((delta) => (
            <tr key={delta.key} className="border-t border-[color:var(--panel-border)]">
              <th scope="row" className="py-1.5 pr-3 text-left font-normal text-[color:var(--panel-text-secondary)]">
                {delta.label}
              </th>
              <td className="py-1.5 text-right tabular-nums">{formatMetricValue(delta.a, delta.unit)}</td>
              <td className="py-1.5 text-right tabular-nums">{formatMetricValue(delta.b, delta.unit)}</td>
              <td className="py-1.5 text-right font-semibold tabular-nums text-[color:var(--panel-text)]">
                {formatDelta(delta)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComparisonChart({ periods }: { periods: [PeriodBlock, PeriodBlock] }) {
  const data = comparisonChartData(periods);
  if (data.length === 0) return null;
  return (
    <div className="h-[200px] w-full" aria-label="Gráfico comparativo">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid vertical={false} stroke="var(--panel-border)" />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--panel-text-muted)" }} interval={0} />
          <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--panel-text-muted)" }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="a" name={periodLabel(periods[0])} fill="var(--panel-border-strong)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="b" name={periodLabel(periods[1])} fill="var(--panel-accent)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function SegmentBars({ segments }: { segments: ReportMetric[] }) {
  const total = segments.reduce((sum, s) => sum + (s.value ?? 0), 0);
  if (total === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-[color:var(--panel-text-muted)]">Segmento actual</p>
      <ul className="space-y-1.5">
        {segments.map((segment) => (
          <li key={segment.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 text-xs">
            <span className="truncate text-[color:var(--panel-text-secondary)]">{segment.label}</span>
            <span className="tabular-nums font-semibold text-[color:var(--panel-text)]">{segment.value ?? 0}</span>
            <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-[color:var(--panel-surface-muted)]">
              <span
                className="block h-full rounded-full bg-[color:var(--panel-accent)]"
                style={{ width: `${Math.round(((segment.value ?? 0) / total) * 100)}%` }}
              />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
