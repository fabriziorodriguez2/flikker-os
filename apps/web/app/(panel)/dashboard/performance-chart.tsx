"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PerformanceKpi, PerformancePoint } from "./dashboard-overview-types";

// Mismo estilo que activity-evolution-chart.tsx — mismos 3 primeros colores,
// +1 nuevo (#9188F5) para la 4ta serie que ese chart no tenía.
const SERIES_COLORS = ["#5C6BC0", "#639922", "#FFAB76", "#9188F5"];

interface PerformanceChartProps {
  kpis: PerformanceKpi[];
  series: PerformancePoint[];
}

export default function PerformanceChart({ kpis, series }: PerformanceChartProps) {
  const legend = kpis.map((kpi, i) => ({ ...kpi, color: SERIES_COLORS[i % SERIES_COLORS.length] }));

  const hasActivity = series.some((point) =>
    legend.some((s) => Number(point[s.key] ?? 0) > 0),
  );

  if (!hasActivity) {
    return (
      <div className="flex h-[260px] w-full items-center justify-center text-sm text-[#8891A4]">
        Todavía no hay actividad suficiente en este período para graficar.
      </div>
    );
  }

  return (
    <div className="h-[260px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#8891A4", fontSize: 11, fontFamily: "Manrope" }}
            tickFormatter={(value: string) =>
              new Date(value).toLocaleDateString("es-UY", {
                day: "2-digit",
                month: "2-digit",
              })
            }
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#8891A4", fontSize: 12, fontFamily: "Manrope" }}
          />
          <Tooltip
            cursor={{ stroke: "rgba(92, 107, 192, 0.15)", strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const labelDate = typeof label === "string" ? new Date(label) : null;
              return (
                <div className="rounded-[12px] border border-[#E8EAF0] bg-white px-4 py-3 text-sm shadow-[0_18px_45px_rgba(9,16,43,0.12)]">
                  <p className="mb-2 font-semibold text-[#1A202C]">
                    {labelDate
                      ? labelDate.toLocaleDateString("es-UY", {
                          day: "2-digit",
                          month: "short",
                        })
                      : ""}
                  </p>
                  <div className="space-y-1.5">
                    {legend.map((s) => {
                      const item = payload.find((entry) => entry.dataKey === s.key);
                      return (
                        <p
                          key={s.key}
                          className="flex items-center justify-between gap-5 text-xs text-[#8891A4]"
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: s.color }}
                            />
                            {s.label}
                          </span>
                          <span className="font-semibold text-[#1A202C]">
                            {Number(item?.value ?? 0).toLocaleString("es-UY")}
                          </span>
                        </p>
                      );
                    })}
                  </div>
                </div>
              );
            }}
          />
          {legend.map((s) => (
            <Line
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              type="monotone"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: s.color, strokeWidth: 0 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
