"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CreditCard,
  Gift,
  Loader2,
  MessageCircle,
  Repeat2,
  Star,
  Store,
  UsersRound,
} from "lucide-react";
import { relativeDay } from "./customers/loyalty-ui";
import QuickActions from "./quick-actions";

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
      key:
        | "sellos_por_vencer"
        | "cerca_del_premio"
        | "cumpleanos"
        | "te_extranamos";
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

  const { kpis, activity, setupAlert, setupTasks } = data;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-8 pb-10 lg:space-y-9">
      {/* ── 1. Header ─────────────────────────────────────────────────── */}
      <header className="pt-1 md:pt-2">
        <h1 className="font-display text-[30px] font-semibold leading-[1.15] tracking-[-0.03em] text-[#202333] md:text-[36px]">
          Hola, {firstName}
        </h1>
        <p className="mt-2.5 text-[15px] leading-6 text-[#697187]">
          Así está funcionando tu negocio con Flikker.
        </p>
      </header>

      {/* ── 2. Alerta: tarjeta digital no configurada ────────────────────
          Solo si hay sellos activos Y el diseño sigue en default — nunca
          "activá sellos", nunca Apple/Google Wallet (Flikker no los ofrece). */}
      {setupAlert ? (
        <section className="rounded-[18px] border border-[#5C6BC0]/25 bg-[#F6F6FE] px-5 py-5 shadow-[0_8px_28px_rgba(92,107,192,0.06)] sm:px-7 sm:py-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px] bg-white text-[#5C6BC0] shadow-sm ring-1 ring-[#E8EAF5]">
                <CreditCard className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold leading-6 text-[#202333]">
                  {setupAlert.title}
                </p>
                <p className="mt-1 text-sm leading-6 text-[#626A80]">
                  {setupAlert.description}
                </p>
              </div>
            </div>
            <Link
              href={setupAlert.href}
              className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-[11px] bg-[#5C6BC0] px-5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(92,107,192,0.2)] hover:bg-[#4f5eb0]"
            >
              Configurar
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      ) : null}

      {/* ── 3. Primeros pasos ─────────────────────────────────────────── */}
      {setupTasks.length > 0 ? (
        <section className="rounded-[18px] border border-[#E5E7EF] bg-white px-5 py-6 shadow-[0_8px_30px_rgba(17,22,59,0.035)] sm:px-7 sm:py-7">
          <p className="text-base font-semibold text-[#202333]">
            Primeros pasos
          </p>
          <p className="mt-1.5 text-sm leading-6 text-[#7B8499]">
            Seguí estos pasos para terminar de poner Flikker en marcha.
          </p>
          <ul className="mt-5 divide-y divide-[#F0F1F6]">
            {setupTasks.map((task, index) => (
              <li key={task.id}>
                <Link
                  href={task.href}
                  className="group -mx-2 flex items-center gap-4 rounded-[12px] px-2 py-4 transition-colors hover:bg-[#F7F7FB] sm:-mx-3 sm:px-3"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#F1F3F8] text-xs font-semibold text-[#737C90] ring-1 ring-[#E6E8EF]"
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold leading-6 text-[#202333] group-hover:text-[#5C6BC0]">
                        {task.title}
                      </span>
                      {task.optional ? (
                        <span className="rounded-full bg-[#F1F3FA] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#8891A4]">
                          Opcional
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-[#7F879C] sm:text-[13px]">
                      {task.description}
                    </span>
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[#E5E7EF] bg-white text-[#5C6BC0] shadow-sm transition-transform group-hover:translate-x-0.5">
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── 4. KPIs ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Clientes activos"
          value={kpis.activeCustomers}
          hint={`En ${data.periodDays} días`}
          icon={UsersRound}
          tone="violet"
        />
        <Kpi
          label="Volvieron"
          value={kpis.returningCustomers}
          hint="Dos visitas o más"
          icon={Repeat2}
          tone="green"
        />
        <Kpi
          label="Beneficios canjeados"
          value={kpis.benefitsRedeemed}
          hint={`En ${data.periodDays} días`}
          icon={BadgeCheck}
          tone="blue"
        />
        <Kpi
          label="Reseñas nuevas"
          value={kpis.newReviews}
          hint={`En ${data.periodDays} días`}
          icon={Star}
          tone="orange"
        />
      </div>

      {/* ── 5. Actividad reciente ─────────────────────────────────────── */}
      <section className="overflow-hidden rounded-[18px] border border-[#E5E7EF] bg-white shadow-[0_8px_30px_rgba(17,22,59,0.035)]">
        <div className="flex items-center justify-between gap-4 border-b border-[#F0F1F6] px-5 py-5 sm:px-7">
          <div>
            <h2 className="text-base font-semibold text-[#202333]">
              Actividad reciente
            </h2>
            <p className="mt-1 text-sm text-[#7F879C]">
              Los movimientos más recientes de tus clientes.
            </p>
          </div>
          {activity.length > 0 ? (
            <Link
              href="/dashboard/customers"
              className="shrink-0 text-sm font-semibold text-[#5C6BC0] hover:underline"
            >
              Ver todos
            </Link>
          ) : null}
        </div>

        {activity.length === 0 ? (
          <div className="flex min-h-52 flex-col items-center justify-center px-6 py-10 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-[#F3F4F8] text-[#7F879C]">
              <UsersRound className="h-5 w-5" aria-hidden="true" />
            </span>
            <p className="mt-4 text-sm font-semibold text-[#202333]">
              Todavía no hay actividad reciente
            </p>
            <p className="mt-1.5 max-w-md text-sm leading-6 text-[#7F879C]">
              Cuando tus clientes empiecen a escanear el QR, lo vas a ver acá.
            </p>
          </div>
        ) : (
          <div>
            <ul className="divide-y divide-[#EFF1F7]">
              {activity.map((event) => (
                <li
                  key={event.id}
                  className="flex items-center gap-4 px-5 py-4 sm:px-7 sm:py-[18px]"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[#F1F3FA] text-[#5C6BC0]">
                    <ActivityIcon kind={event.kind} />
                  </span>
                  <p className="min-w-0 flex-1 text-sm leading-6 text-[#202333]">
                    {activityText(event)}
                  </p>
                  <span className="shrink-0 text-xs text-[#8891A4]">
                    {relativeDay(event.at)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-[#202333]">
            Acciones rápidas
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#7F879C]">
            Atajos para las tareas más frecuentes de tu negocio.
          </p>
        </div>
        <QuickActions hideCampaign />
      </section>

    </div>
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
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  icon: typeof UsersRound;
  tone: "violet" | "green" | "blue" | "orange";
}) {
  const tones = {
    violet: "bg-[#F0ECFF] text-[#6C4EF6]",
    green: "bg-[#E8F8F1] text-[#168966]",
    blue: "bg-[#E9F2FF] text-[#3478D4]",
    orange: "bg-[#FFF3DF] text-[#D47B12]",
  };

  return (
    <div className="flex min-h-[156px] flex-col rounded-[18px] border border-[#E5E7EF] bg-white px-5 py-5 shadow-[0_8px_28px_rgba(17,22,59,0.035)] sm:px-6">
      <div className="flex items-start justify-between gap-3">
        <p className="pt-1 text-xs font-semibold uppercase tracking-[0.09em] text-[#7F879C]">
          {label}
        </p>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] ${tones[tone]}`}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-5 text-[32px] font-semibold leading-none tracking-[-0.025em] text-[#202333]">
        {value}
      </p>
      <p className="mt-2 text-xs leading-5 text-[#8C94A7]">{hint}</p>
    </div>
  );
}
