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
import LoyaltyCard from "@/components/public/loyalty-card";
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

/**
 * Beneficios y la tarjeta de sellos son dos herramientas independientes
 * (ver /dashboard/programa): Inicio nunca asume que la tarjeta está activa.
 * `mode` lo dice siempre — "benefits" cubre tanto "solo beneficios" como
 * "todavía nada configurado", sin dejar un hueco vacío de tarjeta.
 */
type HomeProgram =
  | {
      mode: "stamps";
      stampsRequired: number | null;
      rewardName: string;
      participating: number;
      available: number;
      isDefaultDesign: boolean;
      businessName: string;
      appearance: {
        cardColor: string | null;
        stampColor: string | null;
        stampIcon: string | null;
        logoUrl: string | null;
      };
    }
  | {
      mode: "benefits";
      benefitsCount: number;
      authorizedForReactivationCount: number;
    };

type AutomationItemState =
  | "activo"
  | "modo_prueba"
  | "sin_canal"
  | "preparando"
  | "desactivado";

interface HomeOverview {
  periodDays: number;
  kpis: {
    activeCustomers: number;
    returningCustomers: number;
    /** Fase de Programa nuevo: cualquier origen (tarjeta, retención, promoción). */
    benefitsRedeemed: number;
    newReviews: number;
  };
  program: HomeProgram;
  automations: {
    items: {
      key: "cerca_del_premio" | "te_extranamos";
      enabled: boolean;
      state: AutomationItemState;
    }[];
    activeCount: number;
    testMode: boolean;
    /**
     * Independiente del estado de la automatización en sí — "Te extrañamos"
     * puede estar `activo` mientras esto dice `necesita_limite`. Reenviado
     * tal cual de Notificaciones, sin recalcular nada acá.
     */
    benefitsAutomation: {
      status: "sin_autorizar" | "necesita_limite" | "listo" | "limite_alcanzado";
      monthlyLimit: number | null;
      usedThisMonth: number;
    };
    authorizedBenefitsCount: number;
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
    kind:
      | "visita"
      | "feedback"
      | "desbloqueo"
      | "canje"
      | "beneficio_recibido"
      | "beneficio_canjeado";
    customer: { id: string; name: string } | null;
    rewardName: string | null;
  }[];
}

const AUTOMATION_LABEL: Record<string, string> = {
  cerca_del_premio: "Cerca del premio",
  te_extranamos: "Te extrañamos",
};

/**
 * Tareas pendientes de DESPUÉS del onboarding, no otro wizard — el
 * onboarding ya resolvió negocio, estrategia inicial y (opcionalmente)
 * sellos. Por eso ninguna tarea acá es "activá sellos" ni "configurá
 * automatizaciones": esas ya se decidieron (o quedaron con su default).
 *
 * `optional: true` se muestra con una etiqueta aparte — Flikker funciona
 * igual sin esa tarea, no es una condición para que el negocio ande.
 */
const SETUP_TASKS: Record<
  string,
  { label: string; href: string; optional?: boolean }
> = {
  google: { label: "Conectá Google", href: "/dashboard/reviews" },
  "personalizar-tarjeta": {
    label: "Personalizá tu tarjeta",
    href: "/dashboard/programa?tab=sellos",
  },
  beneficio: {
    label: "Creá tu primer beneficio",
    href: "/dashboard/programa?tab=beneficios",
    optional: true,
  },
  // Fase de presupuesto: un beneficio autorizado sin límite mensual nunca
  // se emite — esto SÍ bloquea a ese beneficio en particular, no es opcional.
  "limite-beneficios": {
    label: "Definí el límite mensual de beneficios",
    href: "/dashboard/notificaciones",
  },
  // Caso de borde: en el flujo normal el onboarding ya creó el QR
  // principal. Esto solo aparece si esa fuente se borró después.
  qr: { label: "No tenés un QR activo", href: "/dashboard/qr" },
  "primer-cliente": {
    label: "Recibí tu primer cliente",
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
                    {task.optional ? (
                      <span className="rounded-full bg-[#F1F3FA] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8891A4]">
                        Opcional
                      </span>
                    ) : null}
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
          label="Beneficios canjeados"
          value={kpis.benefitsRedeemed}
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
        {program.mode === "stamps" ? (
          <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-[#202333]">
                Tu tarjeta de sellos
              </h2>
              <span className="rounded-full bg-[#EAF7EF] px-2.5 py-1 text-[11px] font-semibold text-[#147A5B]">
                Activa
              </span>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-[180px_1fr] sm:items-center">
              {/* Preview compacta — el mismo componente que ve el cliente, solo
                  para mirar. Editar se hace en Programa, nunca acá. */}
              <div className="mx-auto w-full max-w-[220px] scale-[0.92] sm:mx-0">
                <LoyaltyCard
                  rewardName={program.rewardName}
                  progress={Math.min(2, program.stampsRequired ?? 5)}
                  target={program.stampsRequired ?? 5}
                  appearance={{
                    cardColor: program.appearance.cardColor,
                    stampColor: program.appearance.stampColor,
                    stampIcon: program.appearance.stampIcon,
                    logoUrl: program.appearance.logoUrl,
                    businessName: program.businessName,
                  }}
                />
              </div>

              <div>
                <dl className="flex flex-wrap gap-x-8 gap-y-3">
                  <Mini label="Participando" value={program.participating} />
                  <Mini label="Disponibles" value={program.available} />
                  <Mini label="Canjeadas" value={kpis.benefitsRedeemed} />
                </dl>

                {program.isDefaultDesign ? (
                  <Cta href="/dashboard/programa?tab=sellos">
                    Personalizar tarjeta
                  </Cta>
                ) : (
                  <Cta href="/dashboard/programa?tab=sellos">
                    Configurar sellos
                  </Cta>
                )}
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5 sm:p-6">
            <h2 className="font-display text-lg font-semibold text-[#202333]">
              Tus beneficios
            </h2>

            <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3">
              <Mini label="Creados" value={program.benefitsCount} />
              <Mini
                label="Autorizados para reactivación"
                value={program.authorizedForReactivationCount}
              />
            </dl>

            {program.benefitsCount === 0 ? (
              <p className="mt-4 text-sm leading-6 text-[#7F879C]">
                Todavía no creaste ningún beneficio. No hace falta para que
                Flikker funcione — podés hacerlo cuando quieras.
              </p>
            ) : null}

            <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1">
              <Cta href="/dashboard/programa?tab=beneficios">Ver programa</Cta>
              {program.benefitsCount === 0 ? (
                <Cta href="/dashboard/programa?tab=beneficios">
                  Crear beneficio
                </Cta>
              ) : null}
            </div>
          </section>
        )}

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
              <li key={item.key} className="text-sm">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[#202333]">
                    {AUTOMATION_LABEL[item.key]}
                  </span>
                  <AutomationStateBadge state={item.state} />
                </div>
                {/* Beneficios — independiente del estado de arriba: "Te
                    extrañamos" puede estar Activo con esto en "Necesita
                    límite" (§3/§11). Nunca se muestra para "Cerca del
                    premio", que no tiene beneficios propios. */}
                {item.key === "te_extranamos" ? (
                  <p className="mt-1 text-xs leading-5 text-[#8891A4]">
                    {benefitsAutomationCopy(automations)}
                  </p>
                ) : null}
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

/**
 * §3/§11 — el mismo vocabulario de estado que ya usa Notificaciones: un
 * negocio recién creado no debe leerse como "Activo" con 0 infraestructura
 * (`preparando`), y "sin canal"/"modo de prueba" nunca deben mostrarse
 * engañosamente como si el mensaje realmente estuviera saliendo.
 */
function AutomationStateBadge({ state }: { state: AutomationItemState }) {
  const copy: Record<string, { label: string; className: string }> = {
    activo: { label: "Activo", className: "bg-[#EAF7EF] text-[#147A5B]" },
    modo_prueba: {
      label: "Modo de prueba",
      className: "bg-[#FFF7EE] text-[#8A520D]",
    },
    sin_canal: {
      label: "Sin canal",
      className: "bg-[#FDEEEE] text-[#B3261E]",
    },
    preparando: {
      label: "Preparando",
      className: "bg-[#F1F3FA] text-[#5C6BC0]",
    },
    desactivado: {
      label: "Desactivado",
      className: "bg-[#F3F4F8] text-[#6B7280]",
    },
  };
  const { label, className } = copy[state] ?? copy.desactivado;
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

/** §3 — sub-línea de beneficios bajo "Te extrañamos", nunca recalculada acá. */
function benefitsAutomationCopy(
  automations: NonNullable<HomeOverview["automations"]>,
): string {
  const { status, monthlyLimit, usedThisMonth } = automations.benefitsAutomation;
  switch (status) {
    case "sin_autorizar":
      return "Solo recordatorios, sin beneficio.";
    case "necesita_limite":
      return "Tiene beneficios autorizados, pero necesita un límite mensual.";
    case "limite_alcanzado":
      return `Límite de beneficios alcanzado este mes (${usedThisMonth}/${monthlyLimit ?? "—"}). Los recordatorios siguen saliendo.`;
    case "listo":
      return automations.authorizedBenefitsCount > 0
        ? `${automations.authorizedBenefitsCount} ${automations.authorizedBenefitsCount === 1 ? "beneficio disponible" : "beneficios disponibles"}.`
        : "Solo recordatorios, sin beneficio.";
  }
}

/** Texto de un evento. El backend manda la clave; la frase se arma acá. */
function activityText(event: HomeOverview["activity"][number]): string {
  const who = event.customer?.name ?? "Un cliente";
  switch (event.kind) {
    case "visita":
      return `${who} visitó el negocio`;
    case "feedback":
      return `${who} completó el feedback`;
    case "desbloqueo":
      return `${who} desbloqueó ${event.rewardName ?? "su recompensa"}`;
    case "canje":
      return `${who} canjeó ${event.rewardName ?? "su recompensa"}`;
    case "beneficio_recibido":
      return `${who} recibió ${event.rewardName ?? "un beneficio"}`;
    case "beneficio_canjeado":
      return `${who} canjeó ${event.rewardName ?? "un beneficio"}`;
  }
}

function ActivityIcon({
  kind,
}: {
  kind: HomeOverview["activity"][number]["kind"];
}) {
  const className = "h-4 w-4";
  switch (kind) {
    case "visita":
      return <Store className={className} />;
    case "feedback":
      return <MessageCircle className={className} />;
    case "desbloqueo":
      return <Gift className={className} />;
    case "canje":
      return <Check className={className} />;
    case "beneficio_recibido":
      return <Gift className={className} />;
    case "beneficio_canjeado":
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
