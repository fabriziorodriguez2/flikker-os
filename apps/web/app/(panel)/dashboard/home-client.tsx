"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Gift,
  Loader2,
  MessageCircle,
  Megaphone,
  QrCode,
  Store,
} from "lucide-react";
import { relativeDay } from "./customers/loyalty-ui";

/**
 * Inicio — la portada del producto.
 *
 * En diez segundos el dueño tiene que poder responder: cómo va su programa,
 * si sus clientes vuelven, qué recompensas se usan, cómo van sus reseñas y si
 * Flikker necesita algo de él. Nada más. No es un tablero de métricas: cada
 * bloque resume una sección y manda a ella.
 *
 * Ningún número se calcula acá ni en el backend de Inicio: vienen de los
 * servicios dueños de cada concepto (Clientes, Notificaciones, Reseñas), para
 * que la portada nunca muestre un total distinto del de la sección.
 */

interface HomeOverview {
  periodDays: number;
  kpis: {
    activeCustomers: number;
    returningCustomers: number;
    rewardsRedeemed: number;
    newReviews: number;
  };
  program: {
    stampsRequired: number | null;
    rewardName: string;
    participating: number;
    available: number;
  } | null;
  automations: {
    items: { key: "cerca_del_premio" | "te_extranamos"; enabled: boolean }[];
    activeCount: number;
    testMode: boolean;
  } | null;
  reviews: {
    connected: boolean;
    rating: number | null;
    newInPeriod: number;
    toReviewCount: number;
  };
  activity: {
    id: string;
    at: string;
    kind: "sello" | "feedback" | "desbloqueo" | "canje";
    customer: { id: string; name: string } | null;
    rewardName: string | null;
  }[];
}

const AUTOMATION_LABEL: Record<string, string> = {
  cerca_del_premio: "Cerca del premio",
  te_extranamos: "Te extrañamos",
};

/** Tareas pendientes, en el orden en que conviene hacerlas. */
const SETUP_TASKS: Record<string, { label: string; href: string }> = {
  programa: { label: "Crear tu programa", href: "/dashboard/programa" },
  qr: { label: "Tener tu QR listo", href: "/dashboard/qr" },
  google: { label: "Conectar Google", href: "/dashboard/reviews" },
  automatizaciones: {
    label: "Activar automatizaciones",
    href: "/dashboard/notificaciones",
  },
  "primer-cliente": {
    label: "Recibir tu primer cliente",
    href: "/dashboard/qr",
  },
};

export default function HomeClient({ firstName }: { firstName: string }) {
  const [data, setData] = useState<HomeOverview | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [overviewRes, setupRes] = await Promise.all([
        fetch("/api/proxy/home/overview"),
        fetch("/api/proxy/home/setup"),
      ]);
      if (!overviewRes.ok) throw new Error("No pudimos cargar tu inicio.");
      setData((await overviewRes.json()) as HomeOverview);
      if (setupRes.ok) setPending((await setupRes.json()) as string[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="space-y-3">
        <p className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
          {error}
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

  if (!data) {
    return (
      <div className="flex h-48 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[#5C6BC0]" />
      </div>
    );
  }

  const { kpis, program, automations, reviews, activity } = data;

  return (
    <div className="space-y-7">
      <header>
        <h1 className="font-display text-[27px] font-semibold leading-tight tracking-[-0.025em] text-[#202333] md:text-[30px]">
          Hola, {firstName}
        </h1>
        <p className="mt-1.5 text-sm leading-5 text-[#7F879C]">
          Así está funcionando tu negocio con Flikker.
        </p>
      </header>

      {/* ── Checklist — solo si falta algo ────────────────────────────── */}
      {pending.length > 0 ? (
        <section className="rounded-[16px] border border-[#5C6BC0]/25 bg-[#F4F5FD] px-5 py-4">
          <p className="text-sm font-semibold text-[#202333]">
            Para terminar de poner Flikker en marcha
          </p>
          <ul className="mt-3 space-y-2">
            {pending.map((key) => {
              const task = SETUP_TASKS[key];
              if (!task) return null;
              return (
                <li key={key}>
                  <Link
                    href={task.href}
                    className="inline-flex items-center gap-2.5 text-sm text-[#5F6780] hover:text-[#202333]"
                  >
                    <span
                      aria-hidden="true"
                      className="h-4 w-4 shrink-0 rounded-full border-2 border-[#C8D0E0]"
                    />
                    {task.label}
                    <ArrowRight className="h-3.5 w-3.5 text-[#5C6BC0]" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* ── KPIs ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Clientes activos"
          value={kpis.activeCustomers}
          hint={`Vinieron en ${data.periodDays} días`}
        />
        <Kpi
          label="Volvieron"
          value={kpis.returningCustomers}
          hint="Vinieron dos veces o más"
        />
        <Kpi
          label="Recompensas canjeadas"
          value={kpis.rewardsRedeemed}
          hint={`En ${data.periodDays} días`}
        />
        <Kpi
          label="Reseñas nuevas"
          value={kpis.newReviews}
          hint={`En ${data.periodDays} días`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Programa ────────────────────────────────────────────────── */}
        <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-[#202333]">
              Tu programa
            </h2>
            {program ? (
              <span className="rounded-full bg-[#EAF7EF] px-2.5 py-1 text-[11px] font-semibold text-[#147A5B]">
                Activo
              </span>
            ) : null}
          </div>

          {program ? (
            <>
              <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="rounded-full bg-[#EEF0FB] px-3 py-1.5 font-semibold text-[#4A56A6]">
                  {program.stampsRequired ?? "—"} sellos
                </span>
                <ArrowRight className="h-4 w-4 text-[#C8D0E0]" />
                <span className="rounded-full bg-[#EEF0FB] px-3 py-1.5 font-semibold text-[#4A56A6]">
                  {program.rewardName}
                </span>
              </p>

              <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
                <Mini label="Participando" value={program.participating} />
                <Mini label="Disponibles" value={program.available} />
                <Mini label="Canjeadas" value={kpis.rewardsRedeemed} />
              </dl>
            </>
          ) : (
            <p className="mt-3 text-sm leading-6 text-[#7F879C]">
              Todavía no configuraste tu programa de sellos.
            </p>
          )}

          <Cta href="/dashboard/programa">Ver programa</Cta>
        </section>

        {/* ── Reseñas ─────────────────────────────────────────────────── */}
        <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-[#202333]">
              Reseñas
            </h2>
            {!reviews.connected ? (
              <span className="rounded-full bg-[#FFF7EE] px-2.5 py-1 text-[11px] font-semibold text-[#8A520D]">
                Google pendiente
              </span>
            ) : null}
          </div>

          {reviews.connected ? (
            <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
              <Mini
                label="Calificación"
                value={reviews.rating !== null ? `${reviews.rating} ★` : "—"}
              />
              <Mini label="Nuevas" value={reviews.newInPeriod} />
            </dl>
          ) : (
            <p className="mt-3 text-sm leading-6 text-[#7F879C]">
              Conectá Google para ver tus reseñas y que tus clientes puedan
              compartir su experiencia.
            </p>
          )}

          {reviews.toReviewCount > 0 ? (
            <p className="mt-4 rounded-[10px] bg-[#FFFBF6] px-3.5 py-2.5 text-sm text-[#8A520D]">
              {reviews.toReviewCount}{" "}
              {reviews.toReviewCount === 1
                ? "comentario para revisar"
                : "comentarios para revisar"}
            </p>
          ) : null}

          <Cta href="/dashboard/reviews">
            {reviews.connected ? "Ver reseñas" : "Conectar Google"}
          </Cta>
        </section>
      </div>

      {/* ── Automatizaciones ──────────────────────────────────────────── */}
      {automations ? (
        <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold text-[#202333]">
              Automatizaciones
            </h2>
            {automations.testMode ? (
              <span className="rounded-full bg-[#FFF7EE] px-2.5 py-1 text-[11px] font-semibold text-[#8A520D]">
                Modo de prueba
              </span>
            ) : null}
          </div>

          <ul className="mt-4 space-y-2">
            {automations.items.map((item) => (
              <li
                key={item.key}
                className="flex items-center justify-between gap-4 text-sm"
              >
                <span className="text-[#202333]">
                  {AUTOMATION_LABEL[item.key]}
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    item.enabled
                      ? "bg-[#EAF7EF] text-[#147A5B]"
                      : "bg-[#F3F4F8] text-[#6B7280]"
                  }`}
                >
                  {item.enabled ? "Activo" : "Desactivado"}
                </span>
              </li>
            ))}
          </ul>

          <Cta href="/dashboard/notificaciones">Ver notificaciones</Cta>
        </section>
      ) : null}

      {/* ── Actividad reciente ────────────────────────────────────────── */}
      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8891A4]">
          Actividad reciente
        </h2>

        {activity.length === 0 ? (
          <p className="mt-3 rounded-[16px] border border-dashed border-[#DDE1EC] bg-white px-5 py-8 text-center text-sm text-[#8891A4]">
            Cuando tus clientes empiecen a escanear el QR, lo vas a ver acá.
          </p>
        ) : (
          <>
            <ul className="mt-3 divide-y divide-[#EFF1F7] overflow-hidden rounded-[16px] border border-[#E8EAF0] bg-white">
              {activity.map((event) => (
                <li
                  key={event.id}
                  className="flex items-center gap-3.5 px-5 py-3.5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F1F3FA] text-[#5C6BC0]">
                    <ActivityIcon kind={event.kind} />
                  </span>
                  <p className="min-w-0 flex-1 text-sm text-[#202333]">
                    {activityText(event)}
                  </p>
                  <span className="shrink-0 text-xs text-[#8891A4]">
                    {relativeDay(event.at)}
                  </span>
                </li>
              ))}
            </ul>
            <Link
              href="/dashboard/customers"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#5C6BC0] hover:underline"
            >
              Ver clientes
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </>
        )}
      </section>

      {/*
        Solo dos accesos rápidos, y a propósito: "Ver programa", "Ver reseñas"
        y "Ver clientes" ya están unos centímetros más arriba como CTA de su
        card. Repetirlos acá sería ruido.
      */}
      <div className="flex flex-wrap gap-2.5">
        <QuickAction href="/dashboard/qr" icon={<QrCode className="h-4 w-4" />}>
          Descargar QR
        </QuickAction>
        <QuickAction
          href="/dashboard/notificaciones"
          icon={<Megaphone className="h-4 w-4" />}
        >
          Crear promoción
        </QuickAction>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 items-center gap-2 rounded-[11px] border border-[#E3E5F0] bg-white px-4 text-sm font-semibold text-[#202333] transition-colors hover:border-[#5C6BC0]"
    >
      {icon}
      {children}
    </Link>
  );
}

/** Texto de un evento. El backend manda la clave; la frase se arma acá. */
function activityText(event: HomeOverview["activity"][number]): string {
  const who = event.customer?.name ?? "Un cliente";
  switch (event.kind) {
    case "sello":
      return `${who} sumó un sello`;
    case "feedback":
      return `${who} completó el feedback`;
    case "desbloqueo":
      return `${who} desbloqueó ${event.rewardName ?? "su recompensa"}`;
    case "canje":
      return `${who} canjeó ${event.rewardName ?? "su recompensa"}`;
  }
}

function ActivityIcon({
  kind,
}: {
  kind: HomeOverview["activity"][number]["kind"];
}) {
  const className = "h-4 w-4";
  switch (kind) {
    case "sello":
      return <Store className={className} />;
    case "feedback":
      return <MessageCircle className={className} />;
    case "desbloqueo":
      return <Gift className={className} />;
    case "canje":
      return <Check className={className} />;
  }
}

function Kpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-[14px] border border-[#E8EAF0] bg-white px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
        {label}
      </p>
      <p className="mt-1.5 font-display text-2xl font-semibold tracking-[-0.02em] text-[#202333]">
        {value}
      </p>
      <p className="mt-1 text-[11px] leading-4 text-[#B0B8C9]">{hint}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
        {label}
      </dt>
      <dd className="mt-0.5 font-display text-lg font-semibold text-[#202333]">
        {value}
      </dd>
    </div>
  );
}

function Cta({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-[#5C6BC0] hover:underline"
    >
      {children}
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}
