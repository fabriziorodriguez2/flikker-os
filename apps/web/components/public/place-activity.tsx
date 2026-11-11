"use client";

import {
  Clock,
  Gift,
  MapPin,
  MessageCircle,
  Target,
  Ticket,
} from "lucide-react";
import RewardGoalStamps from "./reward-goal-stamps";

export interface PlaceActivityItem {
  id: string;
  type:
    | "VISIT"
    | "STAMP_EARNED"
    | "BENEFIT_UNLOCKED"
    | "BENEFIT_REDEEMED"
    | "BENEFIT_EXPIRED"
    | "MISSION_COMPLETED"
    | "FEEDBACK_SENT";
  occurredAt: string;
  title: string;
  description: string | null;
}
export interface PlaceActivityPage {
  items: PlaceActivityItem[];
  total: number;
  nextCursor: string | null;
  timezone: string;
  snapshot: string;
}

export function activityGroup(
  at: string,
  timezone: string,
  now = new Date(),
): { key: string; label: string } {
  const day = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  const date = new Date(at);
  const today = day(now);
  // Subtract one calendar day, not 24 hours in the business timezone (DST).
  const [y, m, d] = today.split("-").map(Number);
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1))
    .toISOString()
    .slice(0, 10);
  const dateKey = day(date);
  if (dateKey === today) return { key: dateKey, label: "Hoy" };
  if (dateKey === yesterday) return { key: dateKey, label: "Ayer" };
  const month = dateKey.slice(0, 7);
  return {
    key: month,
    label: new Intl.DateTimeFormat("es-UY", {
      timeZone: timezone,
      month: "long",
      ...(month.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}),
    }).format(date),
  };
}

const eventVisuals = {
  VISIT: [MapPin, "#FFFFFF", "#47475E"],
  BENEFIT_UNLOCKED: [Gift, "#FFF0E3", "#B95314"],
  BENEFIT_REDEEMED: [Ticket, "#E4F4EC", "#147950"],
  BENEFIT_EXPIRED: [Clock, "#F0F0F5", "#858598"],
  MISSION_COMPLETED: [Target, "#EEE9FF", "#6A5DF0"],
  FEEDBACK_SENT: [MessageCircle, "#FFFFFF", "#77778B"],
} as const;

export default function PlaceActivity({
  page,
  loading,
  error,
  onMore,
  onRetry,
  businessName,
  stampIcon,
  stampColor,
  now = new Date(),
}: {
  page: PlaceActivityPage | null;
  loading?: boolean;
  error?: boolean;
  onMore?: () => void;
  onRetry?: () => void;
  businessName: string;
  stampIcon?: string | null;
  stampColor?: string | null;
  now?: Date;
}) {
  const timezone = page?.timezone ?? "UTC";
  const groups = new Map<
    string,
    { label: string; items: PlaceActivityItem[] }
  >();
  for (const item of page?.items ?? []) {
    const group = activityGroup(item.occurredAt, timezone, now);
    if (!groups.has(group.key))
      groups.set(group.key, { label: group.label, items: [] });
    groups.get(group.key)!.items.push(item);
  }
  const empty = !loading && !error && page?.total === 0;
  return (
    <section
      aria-label="Actividad"
      aria-busy={loading}
      className="mt-6 rounded-[24px] border border-[#EBEAF2] bg-white px-4 py-5"
    >
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold tracking-[-0.025em]">
          Actividad
        </h2>
        {page ? (
          <span className="text-[11px] text-[#616176]">
            {page.total} {page.total === 1 ? "movimiento" : "movimientos"}
          </span>
        ) : null}
      </div>
      {loading && !page ? (
        <p role="status" className="py-5 text-sm text-[#77778B]">
          Cargando tu actividad…
        </p>
      ) : null}
      {Array.from(groups, ([key, group]) => (
        <div key={key} className="mb-4 last:mb-0">
          <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#66667A]">
            {group.label}
          </h3>
          <ol>
            {group.items.map((item, index) => {
              const visual =
                item.type === "STAMP_EARNED" ? null : eventVisuals[item.type];
              const Icon = visual?.[0];
              const recent = ["Hoy", "Ayer"].includes(group.label);
              const date = new Date(item.occurredAt);
              const time = new Intl.DateTimeFormat("es-UY", {
                timeZone: timezone,
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }).format(date);
              return (
                <li
                  key={item.id}
                  className="relative flex gap-3 pb-5 last:pb-0"
                >
                  {index < group.items.length - 1 ? (
                    <span
                      aria-hidden="true"
                      className="absolute bottom-0 left-[15px] top-8 w-px bg-[#EEEFF5]"
                    />
                  ) : null}
                  <span
                    className="relative h-8 w-8 shrink-0"
                    aria-hidden="true"
                  >
                    {item.type === "STAMP_EARNED" ? (
                      <RewardGoalStamps
                        target={1}
                        progress={1}
                        cardColor={stampColor}
                        stampColor={stampColor}
                        stampAreaColor="#FFFFFF"
                        icon={stampIcon}
                      />
                    ) : (
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-[#EDEDF4]"
                        style={{
                          backgroundColor: visual?.[1],
                          color: visual?.[2],
                        }}
                      >
                        {Icon ? (
                          <Icon className="h-4 w-4" strokeWidth={1.7} />
                        ) : null}
                      </span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 break-words text-[13px] font-bold leading-snug">
                        {item.title}
                      </p>
                      <time
                        dateTime={item.occurredAt}
                        className="shrink-0 pt-0.5 text-[9px] tabular-nums text-[#66667A]"
                      >
                        {!recent
                          ? `${new Intl.DateTimeFormat("es-UY", { timeZone: timezone, day: "numeric", month: "short" }).format(date)} · `
                          : ""}
                        {time}
                      </time>
                    </div>
                    {item.description ? (
                      <p
                        className={`mt-1 break-words text-xs leading-snug ${item.type.startsWith("BENEFIT_") ? "font-bold text-[#303042]" : "text-[#858598]"} ${item.type === "BENEFIT_EXPIRED" ? "line-through" : ""}`}
                      >
                        {item.description}
                      </p>
                    ) : null}
                    {item.type === "BENEFIT_REDEEMED" ||
                    item.type === "BENEFIT_EXPIRED" ? (
                      <span
                        className={`mt-2 inline-block rounded-md px-2 py-1 text-[10px] font-semibold ${item.type === "BENEFIT_REDEEMED" ? "bg-[#E4F4EC] text-[#147950]" : "bg-[#F0F0F5] text-[#77778B]"}`}
                      >
                        {item.type === "BENEFIT_REDEEMED"
                          ? "Canjeado"
                          : "Vencido"}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
      {empty ? (
        <div>
          <div aria-hidden="true" className="mb-5 space-y-3 opacity-60">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="h-8 w-8 rounded-full border border-dashed border-[#DCDDE8]" />
                <span className="space-y-1.5">
                  <span className="block h-2 w-36 rounded-full bg-[#EFEFF5]" />
                  <span className="block h-2 w-24 rounded-full bg-[#F4F4F8]" />
                </span>
              </div>
            ))}
          </div>
          <h3 className="text-sm font-bold">Todavía no hay actividad</h3>
          <p className="mt-1 text-xs leading-relaxed text-[#858598]">
            Cuando registres tu primera visita en {businessName}, vas a ver acá
            tus sellos, beneficios y canjes.
          </p>
        </div>
      ) : null}
      {page && page.total > 0 && page.total <= 2 && !error ? (
        <p className="mt-5 border-t border-[#F0F0F5] pt-4 text-center text-xs leading-relaxed text-[#858598]">
          Tus próximos sellos, beneficios y canjes van a aparecer acá.
        </p>
      ) : null}
      {error ? (
        <div role="alert" className="mt-4 text-sm text-[#66667A]">
          No pudimos cargar la actividad.{" "}
          <button
            type="button"
            onClick={onRetry}
            className="font-bold text-[#6A5DF0]"
          >
            Reintentar
          </button>
        </div>
      ) : null}
      {page?.nextCursor ? (
        <button
          type="button"
          disabled={loading}
          onClick={onMore}
          className="mt-5 w-full rounded-xl bg-[#F3F0FF] py-3 text-xs font-bold text-[#6A5DF0] disabled:opacity-60"
        >
          {loading ? "Cargando…" : "Ver más"}
        </button>
      ) : null}
    </section>
  );
}
