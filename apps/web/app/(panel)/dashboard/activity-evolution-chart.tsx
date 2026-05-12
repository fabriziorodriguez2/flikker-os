"use client";

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

export interface ActivityEvolutionPoint {
  month: string;
  label: string;
  messagesSent: number;
  reviewsGenerated: number;
  reactivatedCustomers: number;
}

const SERIES = [
  {
    key: "messagesSent",
    label: "Mensajes enviados",
    color: "#5C6BC0",
  },
  {
    key: "reviewsGenerated",
    label: "Reseñas generadas",
    color: "#639922",
  },
  {
    key: "reactivatedCustomers",
    label: "Clientes reactivados",
    color: "#FFAB76",
  },
] as const;

interface ActivityEvolutionChartProps {
  data: ActivityEvolutionPoint[];
}

export default function ActivityEvolutionChart({
  data,
}: ActivityEvolutionChartProps) {
  const activeMonths = data.filter(
    (item) =>
      item.messagesSent > 0 ||
      item.reviewsGenerated > 0 ||
      item.reactivatedCustomers > 0,
  ).length;
  const showDataNotice = activeMonths < 2;

  return (
    <div className="space-y-4">
      {showDataNotice ? (
        <div className="rounded-[16px] border border-[color:var(--border)] bg-[color:var(--surface-muted)] px-4 py-3 text-sm leading-6 text-[color:var(--text-muted)]">
          Los datos se completan con el tiempo - seguí usando Flikker para ver
          la evolución.
        </div>
      ) : null}

      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
            barGap={4}
          >
            <CartesianGrid
              stroke="var(--border)"
              strokeDasharray="4 4"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{
                fill: "var(--text-muted)",
                fontSize: 12,
                fontFamily: "var(--font-manrope)",
              }}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={{
                fill: "var(--text-muted)",
                fontSize: 12,
                fontFamily: "var(--font-manrope)",
              }}
            />
            <Tooltip
              cursor={{ fill: "rgba(92, 107, 192, 0.08)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;

                return (
                  <div className="rounded-[14px] border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 text-sm shadow-[0_18px_45px_rgba(9,16,43,0.16)]">
                    <p className="mb-2 font-semibold text-[color:var(--foreground)]">
                      {label}
                    </p>
                    <div className="space-y-1.5">
                      {SERIES.map((series) => {
                        const item = payload.find(
                          (entry) => entry.dataKey === series.key,
                        );
                        return (
                          <p
                            key={series.key}
                            className="flex items-center justify-between gap-5 text-xs text-[color:var(--text-muted)]"
                          >
                            <span className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: series.color }}
                              />
                              {series.label}
                            </span>
                            <span className="font-semibold text-[color:var(--foreground)]">
                              {Number(item?.value ?? 0).toLocaleString(
                                "es-UY",
                              )}
                            </span>
                          </p>
                        );
                      })}
                    </div>
                  </div>
                );
              }}
            />
            <Legend
              verticalAlign="bottom"
              iconType="circle"
              wrapperStyle={{
                color: "var(--text-muted)",
                fontSize: 12,
                fontFamily: "var(--font-manrope)",
                paddingTop: 12,
              }}
              formatter={(value) =>
                SERIES.find((series) => series.key === value)?.label ?? value
              }
            />
            {SERIES.map((series) => (
              <Bar
                key={series.key}
                dataKey={series.key}
                name={series.label}
                fill={series.color}
                radius={[6, 6, 0, 0]}
                maxBarSize={32}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
