"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";

/**
 * Reseñas nuevas por día — mismo patrón visual que `performance-chart.tsx`
 * (Manrope, grilla punteada, tooltip con fecha), pero una sola serie: no hay
 * nada más que comparar acá.
 */
export default function ReviewsChart({
  data,
}: {
  data: { date: string; count: number }[];
}) {
  const hasActivity = data.some((point) => point.count > 0);

  if (!hasActivity) {
    return (
      <div className="flex h-[220px] w-full items-center justify-center text-sm text-[#8891A4]">
        Todavía no hay reseñas nuevas en este período.
      </div>
    );
  }

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
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
          <Tooltip
            cursor={{ fill: "rgba(92, 107, 192, 0.08)" }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const labelDate = typeof label === "string" ? new Date(label) : null;
              const count = Number(payload[0]?.value ?? 0);
              return (
                <div className="rounded-[12px] border border-[#E8EAF0] bg-white px-4 py-3 text-sm shadow-[0_18px_45px_rgba(9,16,43,0.12)]">
                  <p className="font-semibold text-[#1A202C]">
                    {labelDate
                      ? labelDate.toLocaleDateString("es-UY", {
                          day: "2-digit",
                          month: "short",
                        })
                      : ""}
                  </p>
                  <p className="mt-1 text-xs text-[#8891A4]">
                    {count} {count === 1 ? "reseña nueva" : "reseñas nuevas"}
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="count" fill="#5C6BC0" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
