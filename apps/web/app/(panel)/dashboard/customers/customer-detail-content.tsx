"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Check,
  Gift,
  Loader2,
  MessageCircle,
  QrCode,
  RefreshCw,
  Store,
  UserPlus,
} from "lucide-react";
import RewardGoalStamps from "@/components/public/reward-goal-stamps";
import { useIsCheckinV2 } from "../../experience-context";
import {
  MESSAGE_LABEL,
  RECURRENCE,
  Stars,
  longDate,
  relativeDay,
  shortDate,
  type MessageKind,
  type RecurrenceKey,
} from "./loyalty-ui";

/**
 * El contenido del detalle de un cliente — la historia de su relación con
 * ESTE negocio. Compartido entre el modal/drawer (click desde la lista) y la
 * página `/dashboard/customers/[id]` (deep link, compatibilidad): mismos
 * datos, mismo componente, solo cambia el marco que lo envuelve.
 *
 * Todo viene de `/customers/:id/overview`, una sola llamada agregada. La
 * pantalla no calcula nada: si el backend no pudo afirmar algo, manda `null`
 * y acá simplemente no se muestra.
 */

export type TimelineKind =
  | "registro"
  | "escaneo"
  | "visita"
  | "feedback"
  | "desbloqueo"
  | "canje"
  | "beneficio_ofrecido"
  | "beneficio_canjeado"
  | "mensaje"
  | "reactivacion";

interface Overview {
  customer: {
    id: string;
    name: string;
    phone: string;
    createdAt: string;
    optedOut: boolean;
  };
  summary: {
    visitCount: number;
    firstVisitAt: string | null;
    lastVisitAt: string | null;
    feedbackCount: number;
    rewardsRedeemed: number;
    benefitsReceived: number;
    redemptionsCount: number;
    recurrence: RecurrenceKey | null;
    cadencePhrase: string | null;
  };
  currentCard: {
    state: "en_progreso" | "disponible";
    rewardName: string;
    progressVisits: number;
    visitProgress: number;
    bonusStamps: number;
    targetAdditionalVisits: number;
    remainingVisits: number;
  } | null;
  history: {
    id: string;
    rewardName: string;
    status: string;
    progressVisits: number;
    targetAdditionalVisits: number;
    unlockedAt: string | null;
    redeemedAt: string | null;
  }[];
  benefits: {
    id: string;
    title: string;
    offeredAt: string;
    redeemedAt: string | null;
  }[];
  feedback: {
    id: string;
    score: number;
    comment: string | null;
    createdAt: string;
    gaveBonusStamp: boolean;
  }[];
  notifications: { id: string; at: string; kind: MessageKind }[];
  timeline: {
    at: string;
    kind: TimelineKind;
    stamp: "visita" | "bonus" | null;
    rewardName?: string;
    benefitName?: string;
    score?: number;
    comment?: string | null;
    messageKind?: MessageKind;
  }[];
}

const HISTORY_STATUS: Record<string, string> = {
  UNLOCKED: "Lista para canjear",
  REDEEMED: "Canjeada",
  EXPIRED: "Vencida",
  CANCELLED: "Cancelada",
};

export default function CustomerDetailContent({
  customerId,
}: {
  customerId: string;
}) {
  const isCheckinV2 = useIsCheckinV2();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // En LEGACY no se pide nada: el negocio no tiene tarjetas, visitas ni
    // sellos, así que la pantalla de fidelización no aplica.
    if (!isCheckinV2) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/proxy/customers/${customerId}/overview`);
      if (res.status === 404) throw new Error("Este cliente no existe.");
      if (!res.ok) throw new Error("No pudimos cargar el cliente.");
      setData((await res.json()) as Overview);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos cargar el cliente.");
    } finally {
      setLoading(false);
    }
  }, [customerId, isCheckinV2]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Guard de versión. Esta pantalla cuenta la relación del cliente con el
   * programa de sellos, que en LEGACY no existe: entrar por URL a mano
   * mostraría una tarjeta vacía, cero visitas y una timeline con un solo
   * evento, como si el cliente no hubiera hecho nada.
   */
  if (!isCheckinV2) {
    return (
      <div className="px-1 py-8 text-center">
        <p className="font-display text-lg font-semibold text-[#202333]">
          Esta vista todavía no está disponible para tu negocio
        </p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#7F879C]">
          El detalle de cliente muestra el avance en el programa de sellos.
          Podés seguir gestionando tus clientes desde la lista.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[#5C6BC0]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4 px-1 py-6">
        <p className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
          {error ?? "No pudimos cargar el cliente."}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex h-10 items-center rounded-[10px] border border-[#E3E5F0] bg-white px-4 text-sm font-semibold text-[#202333] hover:border-[#5C6BC0]"
        >
          Reintentar
        </button>
      </div>
    );
  }

  const {
    customer,
    summary,
    currentCard,
    history,
    benefits,
    feedback,
    notifications,
  } = data;

  return (
    <div className="space-y-7">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="border-b border-[#DDE1EC]/80 pb-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-display text-[27px] font-semibold leading-tight tracking-[-0.025em] text-[#202333] md:text-[30px]">
            {customer.name}
          </h1>
          {summary.recurrence ? (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${RECURRENCE[summary.recurrence].className}`}
            >
              {RECURRENCE[summary.recurrence].label}
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 text-sm text-[#7F879C]">
          {customer.phone} · Cliente desde {longDate(customer.createdAt)}
        </p>
        {customer.optedOut ? (
          <p className="mt-2 text-xs font-semibold text-[#8A520D]">
            Pidió no recibir mensajes.
          </p>
        ) : null}
      </header>

      {/* ── 1. Tarjeta actual — solo si el negocio usa sellos ───────────── */}
      {currentCard || history.length > 0 ? (
        <section>
          <SectionTitle>Sellos</SectionTitle>
          {currentCard ? (
            <div className="mt-3 rounded-[18px] border border-[#E8EAF0] bg-white p-6">
              <p className="font-display text-lg font-semibold text-[#202333]">
                {currentCard.rewardName}
              </p>

              <div className="mt-5 max-w-md">
                {/* La misma visualización que ve el cliente en su tarjeta. */}
                <RewardGoalStamps
                  progress={currentCard.progressVisits}
                  target={currentCard.targetAdditionalVisits}
                />
              </div>

              <p className="mt-4 text-sm font-semibold text-[#202333]">
                {currentCard.progressVisits} de{" "}
                {currentCard.targetAdditionalVisits} sellos
              </p>

              {currentCard.state === "disponible" ? (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#EAF7EF] px-3 py-1.5 text-sm font-semibold text-[#147A5B]">
                  <Gift className="h-4 w-4" />
                  Recompensa disponible
                </p>
              ) : (
                <p className="mt-1 text-sm text-[#7F879C]">
                  {currentCard.remainingVisits === 0
                    ? "Ya completó la tarjeta"
                    : currentCard.remainingVisits === 1
                      ? "Le falta 1 sello"
                      : `Le faltan ${currentCard.remainingVisits} sellos`}
                </p>
              )}

              {/*
                La descomposición importa: 4 sellos con 3 visitas es correcto
                cuando uno vino del feedback. Sin esto el dueño cree que hay
                un error de cuentas.
              */}
              {currentCard.bonusStamps > 0 ? (
                <p className="mt-3 border-t border-[#EFF1F7] pt-3 text-xs text-[#8891A4]">
                  {currentCard.visitProgress}{" "}
                  {currentCard.visitProgress === 1 ? "sello" : "sellos"} por
                  visitas · {currentCard.bonusStamps} por completar el
                  feedback
                </p>
              ) : null}
            </div>
          ) : (
            <p className="mt-3 rounded-[16px] border border-dashed border-[#DDE1EC] bg-white px-5 py-6 text-sm text-[#8891A4]">
              No tiene una tarjeta activa todavía.
            </p>
          )}
        </section>
      ) : null}

      {/* ── 2. Resumen ────────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Resumen</SectionTitle>
        <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Visitas" value={String(summary.visitCount)} />
          <Stat label="Última visita" value={relativeDay(summary.lastVisitAt)} />
          {/* Solo si tiene una tarjeta en curso — no hay "sellos actuales"
              cuando el negocio no usa tarjeta, o cuando la usa pero este
              cliente no tiene un ciclo activo ahora mismo. */}
          {currentCard ? (
            <Stat
              label="Sellos actuales"
              value={`${currentCard.progressVisits}/${currentCard.targetAdditionalVisits}`}
            />
          ) : null}
          <Stat
            label="Beneficios recibidos"
            value={String(summary.benefitsReceived)}
          />
          <Stat label="Canjes" value={String(summary.redemptionsCount)} />
          <Stat label="Feedback" value={String(summary.feedbackCount)} />
        </dl>
        {/* Solo aparece si el backend pudo calcularla con historial real. */}
        {summary.cadencePhrase ? (
          <p className="mt-3 text-sm text-[#7F879C]">{summary.cadencePhrase}</p>
        ) : null}
      </section>

      {/* ── 3. Actividad ──────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Actividad</SectionTitle>
        <ol className="mt-3 space-y-0.5">
          {data.timeline.map((event, index) => (
            <li key={`${event.at}-${index}`} className="flex gap-3.5">
              <div className="flex flex-col items-center">
                <span className="mt-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F1F3FA] text-[#5C6BC0]">
                  <TimelineIcon kind={event.kind} />
                </span>
                {index < data.timeline.length - 1 ? (
                  <span className="w-px flex-1 bg-[#EFF1F7]" />
                ) : null}
              </div>

              <div className="min-w-0 flex-1 pb-4">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-[#202333]">
                    {timelineTitle(event)}
                  </span>
                  {event.stamp ? (
                    <span className="rounded-full bg-[#EEF0FB] px-2 py-0.5 text-[11px] font-semibold text-[#4A56A6]">
                      {event.stamp === "bonus" ? "+1 sello extra" : "+1 sello"}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-[#8891A4]">
                  {relativeDay(event.at)} · {shortDate(event.at)}
                </p>
                {event.kind === "feedback" && event.comment ? (
                  <p className="mt-1.5 text-sm italic text-[#5F6780]">
                    “{event.comment}”
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ── 4. Recompensas anteriores (tarjeta) ──────────────────────── */}
      {history.length > 0 ? (
        <section>
          <SectionTitle>Recompensas anteriores</SectionTitle>
          <ul className="mt-3 divide-y divide-[#EFF1F7] overflow-hidden rounded-[16px] border border-[#E8EAF0] bg-white">
            {history.map((goal) => (
              <li
                key={goal.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#202333]">
                    {goal.rewardName}
                  </p>
                  {/* Cada ciclo conserva sus propios sellos: no se resetea. */}
                  <p className="mt-0.5 text-xs text-[#8891A4]">
                    {goal.progressVisits}/{goal.targetAdditionalVisits} sellos
                  </p>
                </div>
                <p className="text-xs font-semibold text-[#5F6780]">
                  {HISTORY_STATUS[goal.status] ?? goal.status}
                  {goal.redeemedAt ? ` · ${shortDate(goal.redeemedAt)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/*
        ── 5. Beneficios — SEPARADO de sellos a propósito ───────────────
        Una persona puede tener beneficios sin tarjeta: bienvenida,
        reactivación, o un canje directo del catálogo. Nunca se mezcla con
        "Recompensas anteriores" (eso es específicamente de la tarjeta).
      */}
      {benefits.length > 0 ? (
        <section>
          <SectionTitle>Beneficios</SectionTitle>
          <ul className="mt-3 divide-y divide-[#EFF1F7] overflow-hidden rounded-[16px] border border-[#E8EAF0] bg-white">
            {benefits.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-3.5"
              >
                <p className="truncate text-sm font-semibold text-[#202333]">
                  {b.title}
                </p>
                <p className="text-xs font-semibold text-[#5F6780]">
                  {b.redeemedAt
                    ? `Canjeado · ${shortDate(b.redeemedAt)}`
                    : `Ofrecido · ${shortDate(b.offeredAt)}`}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── 6. Feedback ───────────────────────────────────────────────── */}
      <section>
        <SectionTitle>Feedback</SectionTitle>
        {feedback.length > 0 ? (
          <ul className="mt-3 space-y-2.5">
            {feedback.map((item) => (
              <li
                key={item.id}
                className="rounded-[14px] border border-[#E8EAF0] bg-white px-5 py-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Stars score={item.score} />
                  <span className="text-xs text-[#8891A4]">
                    {shortDate(item.createdAt)}
                  </span>
                </div>
                {/* Sin comentario se muestran solo las estrellas. */}
                {item.comment ? (
                  <p className="mt-2 text-sm text-[#5F6780]">
                    “{item.comment}”
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-[16px] border border-dashed border-[#DDE1EC] bg-white px-5 py-6 text-sm text-[#8891A4]">
            Aún no dejó feedback.
          </p>
        )}
      </section>

      {/* ── 7. Notificaciones ─────────────────────────────────────────── */}
      {notifications.length > 0 ? (
        <section>
          <SectionTitle>Notificaciones</SectionTitle>
          <ul className="mt-3 space-y-1.5">
            {notifications.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 text-sm"
              >
                <span className="text-[#5F6780]">
                  {MESSAGE_LABEL[item.kind]}
                </span>
                <span className="text-xs text-[#8891A4]">
                  {shortDate(item.at)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Link
        href={`/dashboard/customers/${customer.id}`}
        className="inline-flex text-xs font-semibold text-[#8891A4] hover:text-[#5C6BC0] hover:underline"
      >
        Abrir en su propia página
      </Link>
    </div>
  );
}

function timelineTitle(event: Overview["timeline"][number]): string {
  switch (event.kind) {
    case "registro":
      return "Se registró";
    case "escaneo":
      return "Escaneó el QR";
    case "visita":
      return "Visitó el local";
    case "feedback":
      return "Completó el feedback";
    case "desbloqueo":
      return `Desbloqueó ${event.rewardName ?? "una recompensa"}`;
    case "canje":
      return "Canjeó su recompensa";
    case "beneficio_ofrecido":
      return `Recibió el beneficio "${event.benefitName ?? ""}"`;
    case "beneficio_canjeado":
      return `Canjeó el beneficio "${event.benefitName ?? ""}"`;
    case "mensaje":
      return MESSAGE_LABEL[event.messageKind ?? "otro"];
    case "reactivacion":
      return "Volvió después de una reactivación";
  }
}

function TimelineIcon({ kind }: { kind: TimelineKind }) {
  const className = "h-3.5 w-3.5";
  switch (kind) {
    case "registro":
      return <UserPlus className={className} />;
    case "escaneo":
      return <QrCode className={className} />;
    case "visita":
      return <Store className={className} />;
    case "feedback":
      return <MessageCircle className={className} />;
    case "desbloqueo":
      return <Gift className={className} />;
    case "canje":
      return <Check className={className} />;
    case "beneficio_ofrecido":
      return <Gift className={className} />;
    case "beneficio_canjeado":
      return <Check className={className} />;
    case "mensaje":
      return <Bell className={className} />;
    case "reactivacion":
      return <RefreshCw className={className} />;
  }
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8891A4]">
      {children}
    </h2>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-[#E8EAF0] bg-white px-4 py-3.5">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
        {label}
      </dt>
      <dd className="mt-1 text-[15px] font-semibold text-[#202333]">{value}</dd>
    </div>
  );
}
