import Link from "next/link";
import { Gift } from "lucide-react";
import type { DashboardRewardGoalsSignal } from "./dashboard-overview-types";
import { n } from "./dashboard-format";

/** Una sola línea, discreta — Reward Goals no necesita su propia card
 * gigante en este dashboard, solo un vistazo de que está vivo. */
export default function RewardGoalsStrip({
  signal,
}: {
  signal: DashboardRewardGoalsSignal;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#FFAB76]/30 bg-[#FFF7EE] px-4 py-3">
      <div className="flex items-center gap-2.5 text-sm text-[#8A520D]">
        <Gift className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-semibold">{n(signal.inProgress)}</span> con
          recompensa en progreso · <span className="font-semibold">{n(signal.unlockedInPeriod)}</span>{" "}
          desbloqueadas · <span className="font-semibold">{n(signal.redeemedInPeriod)}</span>{" "}
          canjeadas en el período
        </span>
      </div>
      <Link
        href="/dashboard/retention-v2"
        className="shrink-0 text-xs font-semibold text-[#8A520D] hover:underline"
      >
        Ver Retención
      </Link>
    </div>
  );
}
