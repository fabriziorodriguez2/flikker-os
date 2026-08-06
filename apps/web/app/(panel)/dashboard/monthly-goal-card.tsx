"use client";

import { useState } from "react";
import WelcomeGoalPicker from "./welcome-goal-picker";
import type { GoalView, PlanType } from "./page";

function ringColor(pct: number): string {
  if (pct >= 67) return "#1D9E75";
  if (pct >= 34) return "#FAAB4B";
  return "#9188F5";
}

function GoalRing({
  current,
  target,
  noun,
  periodLabel,
}: {
  current: number;
  target: number;
  noun: string;
  periodLabel: string;
}) {
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
  const r = 70;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - pct / 100);
  const color = ringColor(pct);

  return (
    <div className="relative mx-auto h-[184px] w-[184px]">
      <svg viewBox="0 0 184 184" className="h-full w-full -rotate-90">
        <circle
          cx="92"
          cy="92"
          r={r}
          fill="none"
          stroke="#EEF0FB"
          strokeWidth="14"
        />
        <circle
          cx="92"
          cy="92"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-7 text-center">
        <p className="flex items-baseline justify-center leading-none">
          <span className="text-4xl font-bold text-[#1A202C]">{current}</span>
          <span className="text-lg font-semibold text-[#B0B8C9]">/{target}</span>
        </p>
        <p className="mt-2 flex w-[118px] flex-col items-center text-[#8891A4]">
          <span className="text-xs font-semibold leading-4">{noun}</span>
          <span className="text-[10px] font-medium leading-3.5">
            {periodLabel}
          </span>
        </p>
      </div>
    </div>
  );
}

export default function MonthlyGoalCard({
  goalView,
  currentPlan,
}: {
  goalView: GoalView | null;
  currentPlan: { type: PlanType } | null;
}) {
  const [editing, setEditing] = useState(false);

  // No goal yet → let the owner pick one.
  if (!goalView) {
    return <WelcomeGoalPicker />;
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <WelcomeGoalPicker compact onGoalCreated={() => setEditing(false)} />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs font-medium text-[#8891A4] hover:text-[#1A202C]"
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  const noun = goalView.type === "REVIEWS" ? "reseñas" : "contactos";
  // The count runs from the Flikker start date (trial) or from the day the goal
  // was set — never a calendar month, so don't say "del mes".
  const periodLabel =
    goalView.source === "trial" ? "desde que usás Flikker" : "desde tu meta";
  const pct =
    goalView.target > 0
      ? Math.min(100, Math.round((goalView.current / goalView.target) * 100))
      : 0;
  const reached = goalView.current >= goalView.target;
  const hint = reached
    ? "¡Meta cumplida! 🎉"
    : pct >= 75
      ? "Casi. Unos pocos más y llegamos."
      : pct >= 40
        ? "Más de la mitad. ¡Vas muy bien!"
        : "Vas bien, seguí sumando.";

  const showTrialCta = currentPlan?.type === "FREE_TRIAL" && reached;

  return (
    <article className="flex flex-col rounded-[16px] border border-[#E8EAF0] bg-white p-6">
      <GoalRing
        current={goalView.current}
        target={goalView.target}
        noun={noun}
        periodLabel={periodLabel}
      />

      <div className="mt-4 text-center">
        <p className="text-base font-bold text-[#1A202C]">Tu objetivo</p>
        <p className="mt-1 text-sm text-[#8891A4]">{hint}</p>
        {goalView.metric === "google_reviews_since_start" ? (
          <p className="mt-2 text-xs leading-relaxed text-[#A0A6B8]">
            Cuenta todas las reseñas de Google recibidas en el período, no solo
            las que haya generado Flikker.
          </p>
        ) : null}
      </div>

      {showTrialCta && (
        <a
          href="https://www.flikker.website/#precios"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center justify-center rounded-[8px] bg-[#1D9E75] px-4 py-2 text-sm font-semibold text-white hover:bg-[#168360]"
        >
          Hablemos del plan mensual
        </a>
      )}

      {goalView.source === "user" && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-[#5C6BC0] hover:underline"
          >
            Editar meta
          </button>
        </div>
      )}
    </article>
  );
}
