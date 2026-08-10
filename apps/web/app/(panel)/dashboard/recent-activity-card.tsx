import Link from "next/link";
import {
  Gift,
  Heart,
  Megaphone,
  QrCode,
  Star,
  Trophy,
  UserRoundCheck,
} from "lucide-react";
import type { RecentActivityItem, RecentActivityType } from "./dashboard-overview-types";
import { formatRelativeDate } from "./dashboard-format";

const ICONS: Record<RecentActivityType, typeof Star> = {
  review: Star,
  benefit_redeemed: Gift,
  visit: UserRoundCheck,
  visit_source_created: QrCode,
  campaign_sent: Megaphone,
  reward_goal_unlocked: Trophy,
  customer_recovered: Heart,
};

const TONES: Record<RecentActivityType, string> = {
  review: "bg-[#FFF0E5] text-[#E07C3E]",
  benefit_redeemed: "bg-[#EAF6EE] text-[#1D9E75]",
  visit: "bg-[#EAF6FB] text-[#4B98C8]",
  visit_source_created: "bg-[#EEF0FB] text-[#5C6BC0]",
  campaign_sent: "bg-[#F3F0FE] text-[#8A6FE8]",
  reward_goal_unlocked: "bg-[#FFF7E5] text-[#C6900A]",
  customer_recovered: "bg-[#FDEBEE] text-[#D45B79]",
};

export default function RecentActivityCard({
  items,
}: {
  items: RecentActivityItem[];
}) {
  return (
    <article className="flex h-full flex-col rounded-[16px] border border-[#E8EAF0] bg-white p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-[#1A202C]">Actividad reciente</h3>
        <Link
          href="/dashboard/insights"
          className="text-xs font-semibold text-[#5C6BC0] hover:underline"
        >
          Ver todas
        </Link>
      </div>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-[#8891A4]">
          Todavía no hay actividad para mostrar. En cuanto tengas reseñas,
          check-ins o campañas enviadas, vas a verlas acá.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {items.map((item) => {
            const Icon = ICONS[item.type];
            return (
              <li key={item.id} className="flex items-start gap-3">
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${TONES[item.type]}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#1A202C]">
                    {item.title}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[#8891A4]">
                    {item.subtitle ? <span className="truncate">{item.subtitle}</span> : null}
                    {item.subtitle ? <span aria-hidden="true">·</span> : null}
                    <span className="shrink-0">{formatRelativeDate(item.occurredAt)}</span>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}
