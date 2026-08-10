"use client";

import { useState } from "react";
import Link from "next/link";
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
    <div className="relative h-[124px] w-[124px] shrink-0">
      <svg viewBox="0 0 184 184" className="h-full w-full -rotate-90">
        <circle
          cx="92"
          cy="92"
          r={r}
          fill="none"
          stroke="#EEF0FB"
          strokeWidth="12"
        />
        <circle
          cx="92"
          cy="92"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
        <p className="flex items-baseline justify-center leading-none">
          <span className="text-[26px] font-bold text-[#1A202C]">{current}</span>
          <span className="text-sm font-semibold text-[#B0B8C9]">/{target}</span>
        </p>
        <p className="mt-1.5 flex w-[92px] flex-col items-center text-[#8891A4]">
          <span className="text-[10px] font-semibold leading-3.5">{noun}</span>
          <span className="text-[9px] font-medium leading-3">
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
    <article className="rounded-[16px] border border-[#E8EAF0] bg-white p-5">
      <div className="flex items-center gap-4">
        <GoalRing
          current={goalView.current}
          target={goalView.target}
          noun={noun}
          periodLabel={periodLabel}
        />
        <div className="min-w-0 flex-1">

      <div className="text-left">
        <p className="text-sm font-bold text-[#1A202C]">Tu objetivo</p>
        <p className="mt-1 text-xs text-[#8891A4]">{hint}</p>
        {goalView.metric === "google_reviews_since_start" ? (
          <p className="mt-2 text-[10px] leading-4 text-[#A0A6B8]">
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
          className="mt-2 inline-flex items-center justify-center rounded-[8px] bg-[#1D9E75] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#168360]"
        >
          Hablemos del plan mensual
        </a>
      )}

      {goalView.source === "user" && (
        <div className="mt-2 flex justify-start">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-[#5C6BC0] hover:underline"
          >
            Editar meta
          </button>
        </div>
      )}

      <Link
        href="/dashboard/reviews"
        className="mt-2 inline-block text-[11px] font-semibold text-[#5C6BC0] hover:underline"
      >
        Ver todas las reseñas
      </Link>
        </div>
      </div>
    </article>
  );
}
