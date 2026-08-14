"use client";

import { Award, ChevronRight, Gift, Stamp, Users } from "lucide-react";
import type { LoyaltyProgramOverview } from "./types";

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
  onGoToTab,
}: {
  overview: LoyaltyProgramOverview;
  onGoToTab: (tab: "beneficios" | "sellos") => void;
}) {
  const { stats, recentActivity } = overview;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#1A202C]">Beneficios</h2>
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
            onClick={() => onGoToTab("beneficios")}
            className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[#5C6BC0] hover:underline"
          >
            Ver beneficios <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </section>

        <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#1A202C]">
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
            onClick={() => onGoToTab("sellos")}
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
        <h2 className="text-base font-bold text-[#1A202C]">Actividad reciente</h2>
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
    </div>
  );
}
