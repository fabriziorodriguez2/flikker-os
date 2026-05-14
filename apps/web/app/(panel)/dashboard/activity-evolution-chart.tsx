"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
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

export const SERIES = [
  { key: "messagesSent", label: "Mensajes enviados", color: "#5C6BC0" },
  { key: "reviewsGenerated", label: "Reseñas generadas", color: "#639922" },
  { key: "reactivatedCustomers", label: "Pacientes reactivados", color: "#FFAB76" },
] as const;

interface ActivityEvolutionChartProps {
  data: ActivityEvolutionPoint[];
}

export default function ActivityEvolutionChart({
  data,
}: ActivityEvolutionChartProps) {
  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: -18 }}
          barGap={4}
        >
          <CartesianGrid stroke="#E8EAF0" strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#8891A4", fontSize: 12, fontFamily: "Manrope" }}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "#8891A4", fontSize: 12, fontFamily: "Manrope" }}
          />
          <Tooltip
            cursor={{ fill: "rgba(92, 107, 192, 0.08)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-[12px] border border-[#E8EAF0] bg-white px-4 py-3 text-sm shadow-[0_18px_45px_rgba(9,16,43,0.12)]">
                  <p className="mb-2 font-semibold text-[#1A202C]">{label}</p>
                  <div className="space-y-1.5">
                    {SERIES.map((series) => {
                      const item = payload.find((e) => e.dataKey === series.key);
                      return (
                        <p
                          key={series.key}
                          className="flex items-center justify-between gap-5 text-xs text-[#8891A4]"
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-[3px]"
                              style={{ backgroundColor: series.color }}
                            />
                            {series.label}
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
  );
}
