"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Card from "@/components/ui/card";
import type { InsightsMetricsView } from "./types";
import { comparisonPercentage, percentage } from "./types";

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-[var(--panel-radius-card)] border border-[color:var(--panel-border)] bg-[color:var(--panel-surface)] px-3 py-2 text-xs shadow-lg">
      {label ? (
        <p className="mb-1.5 font-semibold text-[color:var(--panel-text)]">
          {label}
        </p>
      ) : null}
      {payload.map((item) => (
        <p
          key={item.name}
          className="flex items-center justify-between gap-5 py-0.5 text-[color:var(--panel-text-muted)]"
        >
          <span>{item.name}</span>
          <strong className="font-semibold tabular-nums text-[color:var(--panel-text)]">
            {item.value ?? 0}
          </strong>
        </p>
      ))}
    </div>
  );
}

export function CustomerCompositionChart({
  metrics,
}: {
  metrics: InsightsMetricsView;
}) {
  const recurrent = Math.min(
    metrics.returningCustomers,
    metrics.totalCustomers,
  );
  const notRecurrent = Math.max(metrics.totalCustomers - recurrent, 0);
  const recurrentRate = percentage(recurrent, metrics.totalCustomers);
  const data = [
    { name: "Recurrentes", value: recurrent },
    { name: "No recurrentes", value: notRecurrent },
  ];

  return (
    <Card className="min-w-0">
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--panel-text)]">
          Composición de clientes
        </h2>
        <p className="mt-1 text-xs text-[color:var(--panel-text-muted)]">
          ¿Qué proporción ya volvió al menos una vez?
        </p>
      </div>

      {metrics.totalCustomers > 0 ? (
        <div className="mt-4 grid items-center gap-2 sm:grid-cols-[170px_1fr]">
          <div className="relative h-[160px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={52}
                  outerRadius={70}
                  startAngle={90}
                  endAngle={-270}
                  stroke="none"
                >
                  <Cell fill="var(--panel-accent)" />
                  <Cell fill="var(--panel-surface-muted)" />
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold tabular-nums tracking-tight text-[color:var(--panel-text)]">
                {recurrentRate}%
              </span>
              <span className="text-[10px] text-[color:var(--panel-text-muted)]">
                recurrencia
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {data.map((item, index) => (
              <div key={item.name} className="flex items-center gap-2.5">
                <span
                  className={`h-2.5 w-2.5 rounded-sm ${
                    index === 0
                      ? "bg-[color:var(--panel-accent)]"
                      : "bg-[color:var(--panel-surface-muted)] ring-1 ring-[color:var(--panel-border)]"
                  }`}
                />
                <span className="flex-1 text-xs text-[color:var(--panel-text-muted)]">
                  {item.name}
                </span>
                <strong className="text-sm font-semibold tabular-nums text-[color:var(--panel-text)]">
                  {item.value}
                </strong>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex h-[160px] items-center justify-center text-sm text-[color:var(--panel-text-muted)]">
          Todavía no hay clientes para comparar.
        </div>
      )}
    </Card>
  );
}

export function VisitTrendChart({ metrics }: { metrics: InsightsMetricsView }) {
  const data = metrics.visitTrend.map((window) => ({
    label: `${window.days} días`,
    Actual: window.current,
    Anterior: window.previous,
  }));
  const mainWindow = metrics.visitTrend.find(
    (window) => window.days === metrics.windowDays,
  );
  const change = mainWindow
    ? comparisonPercentage(mainWindow.current, mainWindow.previous)
    : null;

  return (
    <Card className="min-w-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[color:var(--panel-text)]">
            Evolución de visitas
          </h2>
          <p className="mt-1 text-xs text-[color:var(--panel-text-muted)]">
            Cada ventana contra el período anterior equivalente.
          </p>
        </div>
        {change !== null ? (
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              change >= 0
                ? "bg-[color:var(--panel-success-bg)] text-[color:var(--panel-success-text)]"
                : "bg-[color:var(--panel-warning-bg)] text-[color:var(--panel-warning-text)]"
            }`}
          >
            {change >= 0 ? "+" : ""}
            {change}% en {metrics.windowDays} días
          </span>
        ) : null}
      </div>

      <div className="mt-4 h-[190px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 4, bottom: 0, left: -24 }}
          >
            <CartesianGrid
              stroke="var(--panel-border)"
              strokeDasharray="3 3"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--panel-text-muted)", fontSize: 11 }}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--panel-text-muted)", fontSize: 10 }}
            />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ fill: "transparent" }}
            />
            <Bar
              dataKey="Anterior"
              fill="var(--panel-surface-muted)"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
            <Bar
              dataKey="Actual"
              fill="var(--panel-accent)"
              radius={[4, 4, 0, 0]}
              maxBarSize={28}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center justify-center gap-5 text-[11px] text-[color:var(--panel-text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[color:var(--panel-accent)]" />
          Actual
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-[color:var(--panel-surface-muted)] ring-1 ring-[color:var(--panel-border)]" />
          Período anterior
        </span>
      </div>
    </Card>
  );
}
