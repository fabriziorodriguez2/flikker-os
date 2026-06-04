"use client";

import Link from "next/link";
import Flik, { type FlikPose } from "@/components/ui/flik";

interface RecentAttendance {
  id: string;
  customerName: string;
  eventAt: string;
  hasReview: boolean;
  messageSent: boolean;
}

interface FlikPanelProps {
  attendedToday: number;
  reviewsThisMonth: number;
  reviewGoal: number;
  recentAttendances: RecentAttendance[];
}

function getPoseAndMessage(
  attendedToday: number,
  reviewsThisMonth: number,
  effectiveGoal: number,
): { pose: FlikPose; message: string } {
  if (reviewsThisMonth >= effectiveGoal) {
    return {
      pose: "celebrando",
      message: `¡Llegaste a la meta! ${reviewsThisMonth} reseñas nuevas este mes. 🎉`,
    };
  }
  if (attendedToday === 0) {
    const hour = new Date().getHours();
    return {
      pose: "esperando",
      message:
        hour < 14
          ? "Todavía no marcaste a nadie hoy. ¿Arrancamos?"
          : "Capaz se te pasó el día. Igual podés marcar a los de hoy.",
    };
  }
  if (attendedToday <= 5) {
    return {
      pose: "guino",
      message: `Van ${attendedToday} atendidos hoy. Cada uno es una reseña que viene.`,
    };
  }
  return {
    pose: "normal",
    message: `¡${attendedToday} atendidos hoy! El sistema está trabajando solo.`,
  };
}

function formatRelative(isoDate: string) {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  if (hours < 48) return "ayer";
  return `hace ${Math.floor(hours / 24)} d`;
}

function ProgressBar({
  current,
  goal,
  celebrating,
}: {
  current: number;
  goal: number;
  celebrating: boolean;
}) {
  const pct = Math.min(Math.round((current / goal) * 100), 100);
  const over = current >= goal;

  let barColor = "#9188F5";
  let hint = "Vas bien, seguí marcando clientes.";

  if (over || celebrating) {
    barColor = "#1D9E75";
    hint = "¡Meta cumplida! Hablemos del plan mensual.";
  } else if (pct >= 75) {
    barColor = "#FAAB4B";
    hint = "Casi. Unos pocos más y llegamos.";
  } else if (pct >= 40) {
    barColor = "#FAAB4B";
    hint = "Más de la mitad. ¡Flik lo está haciendo!";
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-semibold text-[#1A202C]">
        <span>Progreso al objetivo</span>
        <span className="tabular-nums">
          {current} de {goal} reseñas
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[#F0F2FA]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: barColor }}
        />
      </div>
      <p className="text-xs text-[#8891A4]">{hint}</p>
    </div>
  );
}

export default function FlikPanel({
  attendedToday,
  reviewsThisMonth,
  reviewGoal,
  recentAttendances,
}: FlikPanelProps) {
  const effectiveGoal = reviewGoal > 0 ? reviewGoal : 20;
  const { pose, message } = getPoseAndMessage(
    attendedToday,
    reviewsThisMonth,
    effectiveGoal,
  );
  const celebrating = pose === "celebrando";

  return (
    <div className="space-y-4">
      {/* Flik bubble */}
      <div className="flex items-end gap-4">
        <div className="shrink-0">
          <Flik pose={pose} size={80} />
        </div>
        <div
          className="rounded-[12px_12px_12px_2px] border border-[#E8EAF0] bg-white px-4 py-3 text-sm font-medium text-[#1A202C] shadow-[0_4px_16px_rgba(0,0,0,0.06)]"
          style={{ borderRadius: "12px 12px 12px 2px" }}
        >
          {message}
        </div>
      </div>

      {/* Progress bar or goal link */}
      {reviewGoal > 0 ? (
        <div className="rounded-[12px] border border-[#E8EAF0] bg-white px-5 py-4">
          <ProgressBar
            current={reviewsThisMonth}
            goal={reviewGoal}
            celebrating={celebrating}
          />
        </div>
      ) : (
        <p className="text-xs text-[#8891A4]">
          <Link
            href="/dashboard/campaigns"
            className="font-medium text-[#5C6BC0] hover:underline"
          >
            ¿Querés configurar una meta?
          </Link>
        </p>
      )}

      {/* Recent attendances */}
      {recentAttendances.length > 0 && (
        <div className="rounded-[12px] border border-[#E8EAF0] bg-white overflow-hidden">
          <p className="border-b border-[#E8EAF0] px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8891A4]">
            Últimas atenciones
          </p>
          <ul className="divide-y divide-[#E8EAF0]">
            {recentAttendances.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#1A202C]">
                    {item.customerName}
                  </p>
                  <p className="text-xs text-[#8891A4]">
                    {formatRelative(item.eventAt)}
                  </p>
                </div>
                {item.hasReview ? (
                  <span className="shrink-0 rounded-full bg-[color:rgba(29,158,117,0.12)] px-2.5 py-1 text-xs font-semibold text-[#1D9E75]">
                    Reseña recibida ✓
                  </span>
                ) : item.messageSent ? (
                  <span className="shrink-0 rounded-full bg-[#F0F2FA] px-2.5 py-1 text-xs font-semibold text-[#8891A4]">
                    Mensaje enviado
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
