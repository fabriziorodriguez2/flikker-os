import type { DashboardPerformance } from "./dashboard-overview-types";
import { n } from "./dashboard-format";
import PerformanceChart from "./performance-chart";

const SERIES_COLORS = ["#5C6BC0", "#639922", "#FFAB76", "#9188F5"];

export default function PerformanceSection({
  performance,
}: {
  performance: DashboardPerformance;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {performance.kpis.map((kpi, i) => (
          <div key={kpi.key} className="rounded-[12px] border border-[#E8EAF0] bg-[#F9FAFD] p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }}
              />
              {kpi.label}
            </p>
            <p className="mt-1.5 text-xl font-bold leading-none text-[#1A202C]">
              {n(kpi.current)}
            </p>
          </div>
        ))}
      </div>

      <PerformanceChart kpis={performance.kpis} series={performance.series} />
    </div>
  );
}
