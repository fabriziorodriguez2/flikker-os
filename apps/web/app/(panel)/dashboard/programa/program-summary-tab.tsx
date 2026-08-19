"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Award,
  Clock3,
  Download,
  Gift,
  Stamp,
  Users,
  X,
} from "lucide-react";
import ProgramHistoryTab from "./program-history-tab";
import type { LoyaltyProgramOverview, ProgramHistoryItem } from "./types";
import type { ConfigSection } from "./program-configuracion-tab";

function daysRemaining(isoDate: string) {
  const diffMs = new Date(isoDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(diffMs / 86_400_000));
}

function relativeDate(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  if (hours < 48) return "ayer";
  return `hace ${Math.floor(hours / 24)} d`;
}

const ACTIVITY_COPY: Record<
  LoyaltyProgramOverview["recentActivity"][number]["type"],
  { label: string; tone: string; icon: typeof Gift }
> = {
  stamp: { label: "Sello extra", tone: "bg-[#EEF0FB] text-[#5C6BC0]", icon: Stamp },
  unlocked: {
    label: "Recompensa desbloqueada",
    tone: "bg-[#FFF7E5] text-[#C6900A]",
    icon: Award,
  },
  redeemed: {
    label: "Recompensa canjeada",
    tone: "bg-[#EAF6EE] text-[#1D9E75]",
    icon: Gift,
  },
  feedback: {
    label: "Contó su experiencia",
    tone: "bg-[#F3F0FE] text-[#8A6FE8]",
    icon: Users,
  },
};

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export default function ProgramSummaryTab({
  overview,
  history,
}: {
  overview: LoyaltyProgramOverview;
  history: ProgramHistoryItem[];
  onGoToConfig: (section: ConfigSection) => void;
}) {
  const { recentActivity } = overview;
  const [showAllActivity, setShowAllActivity] = useState(false);

  function exportActivity() {
    if (history.length === 0) return;

    const rows = [
      ["Fecha", "Actividad"],
      ...history.map((item) => [
        new Date(item.occurredAt).toLocaleString("es-UY"),
        item.message,
      ]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "actividad-programa.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-[16px] border border-[#E8EAF0] bg-white shadow-[0_2px_8px_rgba(17,22,59,0.025)]">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-5 sm:px-6">
          <div>
            <h2 className="text-base font-bold text-[#1A202C]">Actividad</h2>
            <p className="mt-0.5 text-sm text-[#8891A4]">
              Historial de transacciones del programa
            </p>
          </div>
          <button
            type="button"
            onClick={exportActivity}
            disabled={history.length === 0}
            className="flk-glossy-secondary inline-flex h-9 items-center gap-2 rounded-[10px] border border-[#E8EAF0] bg-white px-3.5 text-sm font-semibold text-[#5C6478] shadow-[0_2px_6px_rgba(17,22,59,0.03)] hover:border-[#D9DEEA] hover:bg-[#F8F9FC] disabled:cursor-not-allowed disabled:text-[#B0B8C9] disabled:shadow-none"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Exportar
          </button>
        </div>

        {recentActivity.length === 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center px-6 pb-8 text-center">
            <span className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-[#F5F6FA] text-[#5C6BC0]">
              <Clock3 className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-base font-bold text-[#1A202C]">
              Sin actividad registrada
            </h3>
            <p className="mt-2 max-w-sm text-sm text-[#8891A4]">
              Las transacciones del programa aparecerán aquí.
            </p>
          </div>
        ) : (
          <div className="border-t border-[#F0F1F6] px-5 pb-5 sm:px-6">
            <ul className="divide-y divide-[#F0F1F6]">
              {recentActivity.map((item) => {
                const copy = ACTIVITY_COPY[item.type];
                const Icon = copy.icon;
                return (
                  <li key={item.id} className="flex items-center gap-3 py-4">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] ${copy.tone}`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#1A202C]">
                        {copy.label}
                        {item.customerName ? ` · ${item.customerName}` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-[#8891A4]">
                        {item.detail ? `${item.detail} · ` : ""}
                        {relativeDate(item.occurredAt)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {history.length > 0 ? (
              <div className="pt-3 text-right">
                <button
                  type="button"
                  onClick={() => setShowAllActivity(true)}
                  className="text-sm font-semibold text-[#5C6BC0] hover:underline"
                >
                  Ver toda la actividad
                </button>
              </div>
            ) : null}
          </div>
        )}
      </section>

      {!overview.plan.isPro &&
      overview.plan.maxCustomers != null &&
      overview.stats.customersParticipating >= overview.plan.maxCustomers ? (
        <div className="rounded-[12px] border border-[#F5D6A8] bg-[#FFF7EE] px-4 py-3 text-sm text-[#8A520D]">
          <span className="font-semibold">
            Llegaste al límite de {overview.plan.maxCustomers} clientes de tu plan Free.
          </span>{" "}
          Los clientes actuales siguen sumando sellos normalmente. Para sumar clientes nuevos,{" "}
          <Link href="/dashboard/settings/suscripcion" className="font-semibold underline">
            actualizá tu plan
          </Link>
          .
        </div>
      ) : null}

      {!overview.plan.isPro && overview.plan.benefitsTrialExpired ? (
        <div className="rounded-[12px] border border-[#F5D6A8] bg-[#FFF7EE] px-4 py-3 text-sm text-[#8A520D]">
          <span className="font-semibold">Tu prueba de 30 días terminó.</span>{" "}
          Tus beneficios, clientes e historial siguen intactos. Para crear beneficios nuevos,{" "}
          <Link href="/dashboard/settings/suscripcion" className="font-semibold underline">
            actualizá tu plan
          </Link>
          .
        </div>
      ) : null}

      {!overview.plan.isPro &&
      !overview.plan.benefitsTrialExpired &&
      overview.plan.trialEndsAt ? (
        <div className="rounded-[12px] border border-[#E8EAF0] bg-[#F5F6FA] px-4 py-3 text-sm text-[#5C6478]">
          <span className="font-semibold text-[#1A202C]">
            Prueba de Beneficios: te quedan {daysRemaining(overview.plan.trialEndsAt)} días.
          </span>{" "}
          Al vencer, tus beneficios y clientes siguen intactos; solo se bloquea crear beneficios nuevos.
        </div>
      ) : null}

      {showAllActivity ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#0D1B2A]/40 sm:items-center sm:p-4"
          onClick={() => setShowAllActivity(false)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Toda la actividad"
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[85vh] w-full flex-col rounded-t-[20px] border border-[#E8EAF0] bg-white shadow-xl sm:max-w-lg sm:rounded-[16px]"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[#E8EAF0] px-5 py-4">
              <p className="text-sm font-bold text-[#1A202C]">Toda la actividad</p>
              <button
                type="button"
                onClick={() => setShowAllActivity(false)}
                aria-label="Cerrar"
                className="flex h-8 w-8 items-center justify-center rounded-[8px] text-[#8891A4] hover:bg-[#F5F6FA]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              <ProgramHistoryTab items={history} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
