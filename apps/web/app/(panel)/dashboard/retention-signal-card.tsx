import Link from "next/link";
import type {
  DashboardRetentionSignal,
  RetentionSignalStatus,
} from "./dashboard-overview-types";
import { n } from "./dashboard-format";

// Solo la señal simple — nunca p-values, allocation, variantes ni nombres
// internos del motor. Eso se queda en /dashboard/retention-v2.
const STATUS_COPY: Record<
  RetentionSignalStatus,
  { label: string; tone: string }
> = {
  LEARNING: { label: "Flikker todavía está aprendiendo", tone: "text-[#8891A4]" },
  SIGNAL: { label: "Hay señal de que está funcionando", tone: "text-[#639922]" },
  NO_DIFFERENCE: { label: "Sin diferencia clara todavía", tone: "text-[#8891A4]" },
};

export default function RetentionSignalCard({
  signal,
}: {
  signal: DashboardRetentionSignal;
}) {
  const status = STATUS_COPY[signal.status];

  return (
    <article className="rounded-[16px] border border-[#E8EAF0] bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-[#1A202C]">Retención</h3>
        <Link
          href="/dashboard/retention-v2"
          className="text-xs font-semibold text-[#5C6BC0] hover:underline"
        >
          Ver detalle
        </Link>
      </div>

      <p className={`mt-1 text-xs font-semibold ${status.tone}`}>{status.label}</p>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="text-lg font-bold leading-none text-[#1A202C]">
            {n(signal.atRisk)}
          </p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8891A4]">
            En riesgo
          </p>
        </div>
        <div>
          <p className="text-lg font-bold leading-none text-[#1A202C]">
            {n(signal.contacted)}
          </p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8891A4]">
            Contactados
          </p>
        </div>
        <div>
          <p className="text-lg font-bold leading-none text-[#1A202C]">
            {n(signal.returned)}
          </p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8891A4]">
            Volvieron
          </p>
        </div>
      </div>
    </article>
  );
}
