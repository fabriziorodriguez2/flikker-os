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
import { ACTIVITY_SERIES } from "./activity-series";

export interface ActivityEvolutionPoint {
  month: string;
  label: string;
  messagesSent: number;
  reviewsGenerated: number;
  reactivatedCustomers: number;
}

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
          <CartesianGrid
            stroke="#E8EAF0"
            strokeDasharray="4 4"
            vertical={false}
          />
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
                    {ACTIVITY_SERIES.map((series) => {
                      const item = payload.find(
                        (entry) => entry.dataKey === series.key,
                      );
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
                            {Number(item?.value  0).toLocaleString("es-UY")}
                          </span>
                        </p>
                      );
                    })}
                  </div>
                </div>
              );
            }}
          />
          {ACTIVITY_SERIES.map((series) => (
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
