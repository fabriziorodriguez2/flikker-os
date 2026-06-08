"use client";

import { useState } from "react";
import Flik, { type FlikPose } from "@/components/ui/flik";
import WelcomeGoalPicker from "./welcome-goal-picker";
import type { GoalView, PlanType } from "./page";

interface RecentAttendance {
  id: string;
  customerName: string;
  eventAt: string;
  hasReview: boolean;
  messageSent: boolean;
}

interface FlikPanelProps {
  attendedToday: number;
  currentPlan: { type: PlanType } | null;
  goalView: GoalView | null;
  recentAttendances: RecentAttendance[];
}

function getPoseAndMessage(
  attendedToday: number,
  goalView: GoalView | null,
): { pose: FlikPose; message: string } {
  if (goalView && goalView.current >= goalView.target) {
    const noun = goalView.type === "REVIEWS" ? "reseñas" : "contactos";
    return {
      pose: "celebrando",
      message: `¡Llegaste a la meta! ${goalView.current} ${noun} nuevos. 🎉`,
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
      pose: "normal",
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
  goalView,
  celebrating,
}: {
  goalView: GoalView;
  celebrating: boolean;
}) {
  const pct = Math.min(
    Math.round((goalView.current / goalView.target) * 100),
    100,
  );
  const over = goalView.current >= goalView.target;
  const noun = goalView.type === "REVIEWS" ? "reseñas" : "contactos";

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
          {goalView.current} de {goalView.target} {noun}
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
  currentPlan,
  goalView,
  recentAttendances,
}: FlikPanelProps) {
  const { pose, message } = getPoseAndMessage(attendedToday, goalView);
  const celebrating = pose === "celebrando";

  // BASE/PRO without an active user goal → welcome banner with cards
  const showWelcomeCards =
    currentPlan != null &&
    (currentPlan.type === "BASE" || currentPlan.type === "PRO") &&
    goalView === null;

  // Goal-reached banner for FREE_TRIAL (CTA to talk about monthly plan)
  const showTrialReachedBanner =
    currentPlan?.type === "FREE_TRIAL" &&
    goalView &&
    goalView.current >= goalView.target;

  const [editingGoal, setEditingGoal] = useState(false);

  return (
    <div className="space-y-4">
      {/* Flik bubble */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="shrink-0 self-start sm:self-auto">
          <Flik pose={pose} size={80} />
        </div>
        <div
          className="border border-[#E8EAF0] bg-white px-4 py-3 text-sm font-medium text-[#1A202C] shadow-[0_4px_16px_rgba(0,0,0,0.06)]"
          style={{ borderRadius: "12px 12px 12px 2px" }}
        >
          {message}
        </div>
      </div>

      {/* Trial reached: CTA to talk plans */}
      {showTrialReachedBanner && (
        <div className="rounded-[12px] border border-[color:rgba(29,158,117,0.25)] bg-[color:rgba(29,158,117,0.08)] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[#1D9E75]">
              ¡Llegaste a las {goalView!.target} reseñas! Hablemos del plan mensual.
            </p>
            <a
              href="https://www.flikker.website/#precios"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-[8px] bg-[#1D9E75] px-4 py-2 text-sm font-semibold text-white hover:bg-[#168360]"
            >
              Ver planes
            </a>
          </div>
        </div>
      )}

      {/* Welcome cards for BASE/PRO without goal */}
      {showWelcomeCards && <WelcomeGoalPicker />}

      {/* Progress bar when there's an active goal */}
      {goalView && !editingGoal && (
        <div className="rounded-[12px] border border-[#E8EAF0] bg-white px-5 py-4">
          <ProgressBar goalView={goalView} celebrating={celebrating} />
          {goalView.source === "user" && (
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setEditingGoal(true)}
                className="text-xs font-medium text-[#5C6BC0] hover:underline"
              >
                Editar meta
              </button>
            </div>
          )}
        </div>
      )}

      {/* Editing the existing goal */}
      {editingGoal && (
        <div className="space-y-2">
          <WelcomeGoalPicker
            compact
            onGoalCreated={() => setEditingGoal(false)}
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setEditingGoal(false)}
              className="text-xs font-medium text-[#8891A4] hover:text-[#1A202C]"
            >
              Cancelar
            </button>
          </div>
        </div>
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
