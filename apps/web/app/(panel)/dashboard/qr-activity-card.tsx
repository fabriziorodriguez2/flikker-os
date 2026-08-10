import type { DashboardQrActivity } from "./dashboard-overview-types";
import { formatChange, n } from "./dashboard-format";
import MiniSparkline from "./mini-sparkline";

/** Card D — la etiqueta cambia según la experiencia real del negocio:
 * "Check-ins" para Check-in V2 (tiene fecha real por evento vía `Visit`),
 * "Escaneos QR" para LEGACY (vía `ScanEvent`). Nunca el mismo label para
 * datos que en realidad miden cosas distintas. */
export default function QrActivityCard({
  data,
}: {
  data: DashboardQrActivity;
}) {
  const change = formatChange(data.change);
  const changeClass =
    change.variant === "positive"
      ? "text-[#639922]"
      : change.variant === "negative"
        ? "text-[#C0392B]"
        : "text-[#8891A4]";

  return (
    <article className="flex flex-col rounded-[16px] border border-[#E8EAF0] bg-white p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8891A4]">
        {data.label}
      </p>
      <p className="mt-3 text-[32px] font-bold leading-none text-[#1A202C]">
        {n(data.current)}
      </p>
      <p className={`mt-2 text-xs font-semibold ${changeClass}`}>{change.text}</p>
      <div className="mt-3">
        <MiniSparkline trend={data.trend} color="#FFAB76" />
      </div>
    </article>
  );
}
