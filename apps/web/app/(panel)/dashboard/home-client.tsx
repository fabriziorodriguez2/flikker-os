"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  CreditCard,
  Gift,
  Loader2,
  MessageCircle,
  Store,
} from "lucide-react";
import { relativeDay } from "./customers/loyalty-ui";

/**
 * Inicio — la portada del producto. Rediseño (pedido explícito, referencia
 * estructural: captura de Fiddelik) — más operativo, más denso, menos cards
 * gigantes. Jerarquía: header → alerta si falta configurar la tarjeta →
 * Primeros pasos → KPIs → actividad reciente → resúmenes secundarios
 * (Programa/Reseñas/Automatizaciones), estos últimos compactos, no
 * protagonistas.
 *
 * Ningún número se calcula acá ni en el backend de Inicio: vienen de los
 * servicios dueños de cada concepto (Clientes, Notificaciones, Reseñas,
 * Programa), para que la portada nunca muestre un total distinto del de la
 * sección. `setupAlert`/`setupTasks` tampoco son la excepción — son la
 * MISMA conclusión que ya calculaba el backend, solo que ahora vienen en
 * `overview()` en vez de un segundo round-trip.
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

interface SetupAlert {
  type: "digital_card_not_configured";
  title: string;
  description: string;
  href: string;
}

interface SetupTask {
  id: string;
  title: string;
  description: string;
  href: string;
  optional?: boolean;
}

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
  setupAlert: SetupAlert | null;
  setupTasks: SetupTask[];
}

const AUTOMATION_LABEL: Record<string, string> = {
  cerca_del_premio: "Cerca del premio",
  te_extranamos: "Te extrañamos",
};

/**
 * Chequeo mínimo, no una validación exhaustiva de schema: solo lo que hace
 * falta para que el render de más abajo nunca reciba `undefined` donde
 * espera un array. Si esto no alcanza, es preferible mostrar "no pudimos
 * cargar" y dejar reintentar, no un error de React a mitad de pantalla.
 */
function isHomeOverview(value: unknown): value is HomeOverview {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<HomeOverview>;
  return (
    Array.isArray(v.activity) &&
    Array.isArray(v.setupTasks) &&
    typeof v.kpis === "object" &&
    v.kpis !== null &&
    typeof v.program === "object" &&
    v.program !== null &&
    typeof v.reviews === "object" &&
    v.reviews !== null
  );
}

export default function HomeClient({ firstName }: { firstName: string }) {
  const [data, setData] = useState<HomeOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/proxy/home/overview");
      if (!res.ok) throw new Error("No pudimos cargar tu inicio.");
      const raw: unknown = await res.json();
      // Nunca confiar ciegamente en el `as HomeOverview` de antes: si el
      // backend está caído, recién arrancó, o devuelve un shape viejo (dev
      // desincronizado), esto evita un crash de render por leer `.length`
      // de un campo inexistente — se ve como "no pudimos cargar", no una
      // pantalla rota.
      if (!isHomeOverview(raw)) {
        throw new Error(
          "No pudimos cargar tu inicio — probá recargar en unos segundos.",
        );
      }
      setData(raw);
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

  const { kpis, program, automations, reviews, activity, setupAlert, setupTasks } =
    data;

  return (
    <div className="space-y-6">
      {/* ── 1. Header ─────────────────────────────────────────────────── */}
      <header>
        <h1 className="font-display text-[27px] font-semibold leading-tight tracking-[-0.025em] text-[#202333] md:text-[30px]">
          Hola, {firstName}
        </h1>
        <p className="mt-1.5 text-sm leading-5 text-[#7F879C]">
          Así está funcionando tu negocio con Flikker.
        </p>
      </header>

      {/* ── 2. Alerta: tarjeta digital no configurada ────────────────────
          Solo si hay sellos activos Y el diseño sigue en default — nunca
          "activá sellos", nunca Apple/Google Wallet (Flikker no los ofrece). */}
      {setupAlert ? (
        <section className="rounded-[16px] border border-[#5C6BC0]/30 bg-[#F4F5FD] px-5 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[#5C6BC0]">
                <CreditCard className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#202333]">
                  {setupAlert.title}
                </p>
                <p className="mt-0.5 text-sm leading-5 text-[#5F6780]">
                  {setupAlert.description}
                </p>
              </div>
            </div>
            <Link
              href={setupAlert.href}
              className="inline-flex h-10 shrink-0 items-center rounded-[10px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0]"
            >
              Configurar
            </Link>
          </div>
        </section>
      ) : null}

      {/* ── 3. Primeros pasos ─────────────────────────────────────────── */}
      {setupTasks.length > 0 ? (
        <section className="rounded-[16px] border border-[#E8EAF0] bg-white px-5 py-4 sm:px-6">
          <p className="text-sm font-semibold text-[#202333]">
            Primeros pasos
          </p>
          <p className="mt-0.5 text-xs text-[#8891A4]">
            Seguí estos pasos para terminar de poner Flikker en marcha.
          </p>
          <ul className="mt-3 space-y-0.5">
            {setupTasks.map((task) => (
              <li key={task.id}>
                <Link
                  href={task.href}
                  className="group -mx-2 flex items-start gap-2.5 rounded-[10px] px-2 py-2 transition-colors hover:bg-[#F5F6FA]"
                >
                  <span
                    aria-hidden="true"
                    className="mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-[#C8D0E0]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-[#202333] group-hover:text-[#5C6BC0]">
                        {task.title}
                      </span>
                      {task.optional ? (
                        <span className="rounded-full bg-[#F1F3FA] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8891A4]">
                          Opcional
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-[#8891A4]">
                      {task.description}
                    </span>
                  </span>
                  <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-[#5C6BC0] opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── 4. KPIs ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Clientes activos"
          value={kpis.activeCustomers}
          hint={`En ${data.periodDays} días`}
        />
        <Kpi
          label="Volvieron"
          value={kpis.returningCustomers}
          hint="Dos visitas o más"
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

      {/* ── 5. Actividad reciente ─────────────────────────────────────── */}
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
                  className="flex items-center gap-3.5 px-5 py-3"
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
              Ver todos los clientes
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </>
        )}
      </section>

      {/* ── 6. Resúmenes secundarios (compactos, no protagonistas) ──────── */}
      <div className="grid gap-3 lg:grid-cols-3">
        <SecondaryCard title="Programa" href="/dashboard/programa?tab=configuracion">
          {program.mode === "stamps" ? (
            <p className="text-sm text-[#5F6780]">
              {program.stampsRequired ?? "—"} sellos → {program.rewardName}
            </p>
          ) : (
            <p className="text-sm text-[#5F6780]">
              {program.benefitsCount}{" "}
              {program.benefitsCount === 1 ? "beneficio" : "beneficios"}
            </p>
          )}
        </SecondaryCard>

        <SecondaryCard title="Reseñas" href="/dashboard/reviews">
          {reviews.connected ? (
            <p className="text-sm text-[#5F6780]">
              {reviews.rating !== null ? `${reviews.rating} ★` : "Sin calificación"}
              {reviews.newInPeriod > 0
                ? ` · ${reviews.newInPeriod} ${reviews.newInPeriod === 1 ? "nueva" : "nuevas"}`
                : ""}
            </p>
          ) : (
            <p className="text-sm text-[#8A520D]">Google pendiente</p>
          )}
        </SecondaryCard>

        {automations ? (
          <SecondaryCard title="Automatizaciones" href="/dashboard/notificaciones">
            <ul className="space-y-1">
              {automations.items.map((item) => (
                <li
                  key={item.key}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-[#5F6780]">
                    {AUTOMATION_LABEL[item.key]}
                  </span>
                  <AutomationStateBadge state={item.state} />
                </li>
              ))}
            </ul>
          </SecondaryCard>
        ) : null}
      </div>
    </div>
  );
}

function SecondaryCard({
  title,
  href,
  children,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-[#202333]">{title}</h2>
        <Link
          href={href}
          className="shrink-0 text-xs font-semibold text-[#5C6BC0] hover:underline"
        >
          Ver {title.toLowerCase()}
        </Link>
      </div>
      <div className="mt-2">{children}</div>
    </section>
  );
}

/**
 * §3/§11 (fase anterior) — mismo vocabulario que ya usa Notificaciones: un
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
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${className}`}
    >
      {label}
    </span>
  );
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
    <div className="rounded-[14px] border border-[#E8EAF0] bg-white px-4 py-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
        {label}
      </p>
      <p className="mt-1 font-display text-2xl font-semibold tracking-[-0.02em] text-[#202333]">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] leading-4 text-[#B0B8C9]">{hint}</p>
    </div>
  );
}
