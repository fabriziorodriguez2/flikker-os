import type { DashboardActiveCustomers } from "./dashboard-overview-types";
import { formatChange, n } from "./dashboard-format";
import MiniSparkline from "./mini-sparkline";

/** Clientes únicos con al menos un check-in en el período — solo tiene
 * sentido para negocios con Check-in V2 (requiere `Visit`). En LEGACY no
 * existe ese dato, así que se muestra un estado honesto en su lugar. */
export default function ActiveCustomersCard({
  data,
}: {
  data: DashboardActiveCustomers | null;
}) {
  if (!data) {
    return (
      <article className="flex flex-col rounded-[16px] border border-[#E8EAF0] bg-white p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8891A4]">
          Clientes activos
        </p>
        <p className="mt-4 text-sm text-[#8891A4]">
          Disponible con Check-in digital. Activá el QR principal para empezar
          a medir esto.
        </p>
      </article>
    );
  }

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
        Clientes activos
      </p>
      <p className="mt-3 text-[32px] font-bold leading-none text-[#1A202C]">
        {n(data.current)}
      </p>
      <p className={`mt-2 text-xs font-semibold ${changeClass}`}>{change.text}</p>
      <div className="mt-3">
        <MiniSparkline trend={data.trend} color="#5C6BC0" />
      </div>
    </article>
  );
}
