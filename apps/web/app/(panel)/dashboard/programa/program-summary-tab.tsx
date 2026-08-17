"use client";

import { useState } from "react";
import { Award, ChevronRight, Gift, Stamp, Users, X } from "lucide-react";
import ProgramHistoryTab from "./program-history-tab";
import type { LoyaltyProgramOverview, ProgramHistoryItem } from "./types";
import type { ConfigSection } from "./program-configuracion-tab";

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

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: number;
  hint: string;
  icon: typeof Gift;
}) {
  return (
    <article className="rounded-[16px] border border-[#E8EAF0] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8891A4]">
            {label}
          </p>
          <p className="mt-3 text-[32px] font-bold leading-none text-[#1A202C]">
            {value.toLocaleString("es-UY")}
          </p>
          <p className="mt-2 text-xs text-[#8891A4]">{hint}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EEF0FB] text-[#5C6BC0]">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
    </article>
  );
}

export default function ProgramSummaryTab({
  overview,
  history,
  onGoToConfig,
}: {
  overview: LoyaltyProgramOverview;
  history: ProgramHistoryItem[];
  onGoToConfig: (section: ConfigSection) => void;
}) {
  const { stats, recentActivity } = overview;
  const [showAllActivity, setShowAllActivity] = useState(false);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-[#1A202C]">Beneficios</h2>
              <p className="mt-1 text-sm text-[#8891A4]">
                {overview.benefitsCount} beneficio
                {overview.benefitsCount === 1 ? "" : "s"} disponible
                {overview.benefitsCount === 1 ? "" : "s"}
              </p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EEF0FB] text-[#5C6BC0]">
              <Gift className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          <button
            type="button"
            onClick={() => onGoToConfig("premios")}
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#5C6BC0] hover:underline"
          >
            Ver beneficios <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </section>

        <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-base font-bold text-[#1A202C]">
                {overview.enabled
                  ? "Tarjeta de sellos activa"
                  : "Tarjeta de sellos desactivada"}
              </h2>
              {overview.enabled && overview.reward && overview.stampsRequired ? (
                <p className="mt-1 text-sm font-semibold text-[#1A202C]">
                  {overview.stampsRequired} sellos → {overview.reward.name}
                </p>
              ) : (
                <p className="mt-1 text-sm text-[#8891A4]">
                  Podés activarla si querés premiar las visitas frecuentes.
                </p>
              )}
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#EEF0FB] text-[#5C6BC0]">
              <Stamp className="h-4 w-4" aria-hidden="true" />
            </span>
          </div>
          {overview.enabled ? (
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <dt className="text-[10px] uppercase tracking-[0.1em] text-[#8891A4]">
                  Participando
                </dt>
                <dd className="text-sm font-bold text-[#1A202C]">
                  {stats.customersParticipating}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.1em] text-[#8891A4]">
                  Disponibles
                </dt>
                <dd className="text-sm font-bold text-[#1A202C]">
                  {stats.unlockedTotal - stats.redeemedTotal}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-[0.1em] text-[#8891A4]">
                  Canjeadas
                </dt>
                <dd className="text-sm font-bold text-[#1A202C]">
                  {stats.redeemedTotal}
                </dd>
              </div>
            </dl>
          ) : null}
          <button
            type="button"
            onClick={() => onGoToConfig("tarjeta")}
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#5C6BC0] hover:underline"
          >
            {overview.enabled ? "Configurar sellos" : "Activar tarjeta de sellos"}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </section>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Clientes participando"
          value={stats.customersParticipating}
          hint="Tienen o tuvieron una tarjeta"
          icon={Users}
        />
        <StatCard
          label="Tarjetas en progreso"
          value={stats.cardsInProgress}
          hint="Juntando sellos ahora"
          icon={Stamp}
        />
        <StatCard
          label="Recompensas desbloqueadas"
          value={stats.unlockedTotal}
          hint="Completaron su tarjeta"
          icon={Award}
        />
        <StatCard
          label="Recompensas canjeadas"
          value={stats.redeemedTotal}
          hint="Vinieron a buscarla"
          icon={Gift}
        />
      </div>

      <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-base font-bold text-[#1A202C]">
            Actividad reciente
          </h2>
          {/* El Historial no desaparece — se ve desde acá. Mismo
              ProgramAuditEvent de siempre, solo cambia dónde se muestra. */}
          {history.length > 0 ? (
            <button
              type="button"
              onClick={() => setShowAllActivity(true)}
              className="text-sm font-semibold text-[#5C6BC0] hover:underline"
            >
              Ver toda la actividad
            </button>
          ) : null}
        </div>
        {recentActivity.length === 0 ? (
          <p className="mt-3 text-sm text-[#8891A4]">
            Todavía no hay movimientos. En cuanto tus clientes empiecen a sumar
            sellos, vas a verlos acá.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {recentActivity.map((item) => {
              const copy = ACTIVITY_COPY[item.type];
              const Icon = copy.icon;
              return (
                <li key={item.id} className="flex items-start gap-3">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${copy.tone}`}
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
        )}
      </section>

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
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full flex-col rounded-t-[20px] border border-[#E8EAF0] bg-white shadow-xl sm:max-w-lg sm:rounded-[16px]"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[#E8EAF0] px-5 py-4">
              <p className="text-sm font-bold text-[#1A202C]">
                Toda la actividad
              </p>
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
