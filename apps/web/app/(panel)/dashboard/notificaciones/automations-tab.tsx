"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CakeSlice,
  Clock3,
  Lock,
  Mail,
  RefreshCw,
  Sparkles,
  TimerReset,
  UserRoundSearch,
} from "lucide-react";
import RouteProgressBar from "@/components/ui/route-progress-bar";
import { useToast } from "@/components/ui/toast";
import { useIsOwnerOrAdmin } from "../../role-context";

/**
 * Automáticas — los mensajes que Flikker manda solo.
 *
 * Acá solo se decide CUÁNDO: prender/apagar cada automatización y el
 * horario permitido de envío. Qué se ofrece (beneficios, incentivos,
 * premios) es de Programa — esta pantalla no repite ni una versión de
 * solo lectura de esa configuración.
 *
 * Solo se muestran las automatizaciones que EXISTEN de verdad, y solo cuando
 * tienen sentido para ESTE negocio:
 *  - "Sellos por vencer" — solo si el negocio usa tarjeta de sellos. Avisa
 *    antes de que se pierda un premio ya ganado.
 *  - "Casi llegás" — solo si el negocio tiene tarjeta de sellos activa.
 *    Mostrarla apagada igual sería confuso: no es que esté desactivada, es
 *    que no aplica.
 *  - "Cumpleaños" — siempre visible, bloqueada con badge PRO hasta que el
 *    negocio tenga Pro o un trial Pro vigente.
 *  - "Te extrañamos" — siempre puede mostrarse. No depende de sellos ni de
 *    beneficios.
 * Hubo una candidata más ("recordar recompensa disponible") que no se
 * incluye porque el motor no tiene con qué ejecutarla: su único objetivo de
 * progreso recluta tarjetas en curso y excluye las ya desbloqueadas. Un
 * checkbox que no hace nada es peor que uno que falta.
 *
 * Canales: solo se muestra el badge de WhatsApp, y solo en las
 * automatizaciones que de verdad salen por ahí. "Sellos por vencer" y
 * "Cumpleaños" no tienen WhatsApp real detrás — mostrarles ese badge sería
 * mentir, así que directamente no llevan ninguno.
 */

type AutomationState =
  | "activo"
  | "inactivo"
  | "modo_prueba"
  | "sin_canal"
  | "preparando"
  | "desactivado";

type Channel = "whatsapp" | "email";

type EvidenceState = "INSUFFICIENT_DATA" | "PRELIMINARY" | "ENOUGH_DATA";

interface FunnelStats {
  contacted: number;
  returned: number;
  recoveryRate: number;
  averageDaysToReturn: number | null;
  evidenceState: EvidenceState;
}

interface ReactivationFunnel {
  overall: FunnelStats;
  byArm: { reminderOnly: FunnelStats; withBenefit: FunnelStats } | null;
}

interface Overview {
  automations: {
    key: "sellos_por_vencer" | "cerca_del_premio" | "cumpleanos" | "te_extranamos";
    enabled: boolean;
    state: AutomationState;
    plan: "free" | "pro";
    locked: boolean;
    channels: Channel[];
  }[];
  status: {
    activeCount: number;
    testMode: boolean;
    engineEnabled: boolean;
    /** El único estado de canal que existe de verdad — ver `## Canal`. */
    channel: "activo" | "no_conectado";
    /** Pro o trial Pro vigente. */
    proAccess: boolean;
  };
  // `benefits`/`benefitsAutomation`/`results` también vienen en la
  // respuesta (Inicio los reusa), pero esta pantalla ya no los muestra: qué
  // se ofrece es de Programa, no de Notificaciones. Se ignoran a propósito,
  // no se borraron del backend.
  /** La métrica principal real de "Te extrañamos" — null si no hay datos. */
  reactivationFunnel: ReactivationFunnel | null;
}

interface FunnelSummary {
  summaryText: string;
  generatedAt: string;
}

interface Settings {
  sendingHourStart: number;
  sendingHourEnd: number;
  allowedSendingDays: number[];
}

const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export default function AutomationsTab() {
  const canManage = useIsOwnerOrAdmin();
  const toast = useToast();

  const [data, setData] = useState<Overview | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, settingsRes] = await Promise.all([
        fetch("/api/proxy/notifications/overview"),
        fetch("/api/proxy/notifications/settings"),
      ]);
      if (!overviewRes.ok) throw new Error("No pudimos cargar tus notificaciones.");
      setData((await overviewRes.json()) as Overview);
      if (settingsRes.ok) setSettings((await settingsRes.json()) as Settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/proxy/notifications/automations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("No pudimos guardar el cambio.");
      setData((await res.json()) as Overview);
      // Cada toggle manda una sola clave booleana; decir "activada/
      // desactivada" es más útil que un "Cambios guardados" genérico.
      const values = Object.values(body);
      const toggled = values.length === 1 ? values[0] : undefined;
      toast.success(
        typeof toggled === "boolean"
          ? toggled
            ? "Automatización activada"
            : "Automatización desactivada"
          : "Cambios guardados",
      );
    } catch (e) {
      const detail = e instanceof Error ? e.message : "Error inesperado.";
      setError(detail);
      toast.error(detail);
    } finally {
      setSaving(false);
    }
  }

  async function patchSettings(body: Record<string, unknown>) {
    try {
      const res = await fetch("/api/proxy/notifications/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // Antes un guardado fallido era invisible: sin `else`, la ventana de
      // envío quedaba en pantalla como si se hubiera guardado.
      if (!res.ok) throw new Error("No pudimos guardar la configuración.");
      setSettings((await res.json()) as Settings);
      toast.success("Cambios guardados");
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "No pudimos guardar la configuración.",
      );
    }
  }

  if (loading) {
    return <RouteProgressBar />;
  }

  if (error && !data) {
    return (
      <div className="space-y-3">
        <p className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="flk-glossy-secondary inline-flex h-10 items-center rounded-[10px] border border-[#E3E5F0] bg-white px-4 text-sm font-semibold text-[#202333] hover:border-[#5C6BC0]"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!data) return null;

  const sellosPorVencer = data.automations.find(
    (a) => a.key === "sellos_por_vencer",
  );
  const progreso = data.automations.find((a) => a.key === "cerca_del_premio");
  const cumpleanos = data.automations.find((a) => a.key === "cumpleanos");
  const reactivacion = data.automations.find((a) => a.key === "te_extranamos");

  return (
    <div className="space-y-3">
      {error ? (
        <p className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
          {error}
        </p>
      ) : null}

      {(() => {
        const hasBlockedByChannel = data.automations.some(
          (a) => a.state === "sin_canal",
        );
        return (
          <>
            {data.status.activeCount === 0 ? (
              <p className="rounded-[11px] border border-[#E8EAF0] bg-white px-4 py-3 text-sm text-[#8891A4]">
                Activá una automatización para que Flikker empiece a ayudarte.
              </p>
            ) : null}
            {data.status.testMode ? (
              <p className="rounded-[11px] bg-[#FFF7EE] px-4 py-3 text-sm leading-5 text-[#8A520D]">
                <strong>Modo de prueba.</strong> Flikker está detectando a
                quién contactaría, pero todavía no envía mensajes.
              </p>
            ) : null}
            {hasBlockedByChannel ? (
              <p className="rounded-[11px] bg-[#FFF7EE] px-4 py-3 text-sm leading-5 text-[#8A520D]">
                <strong>Los mensajes están temporalmente pausados.</strong>{" "}
                Tus automatizaciones siguen configuradas y se reanudarán
                cuando vuelva la mensajería.
              </p>
            ) : null}
          </>
        );
      })()}

      {/*
        ── A. Sellos por vencer ─────────────────────────────────────────
        Solo existe como concepto si el negocio usa tarjeta de sellos — sin
        `sellosPorVencer` en `automations`, ni se muestra.
      */}
      {sellosPorVencer ? (
        <AutomationCard
          icon={TimerReset}
          title="Sellos por vencer"
          description="Avisale si ganó un premio con su tarjeta y todavía no lo canjeó, antes de que venza."
          example="“Tu premio vence en 3 días.”"
          enabled={sellosPorVencer.enabled}
          locked={sellosPorVencer.locked}
          channels={sellosPorVencer.channels}
          disabled={!canManage || saving}
          onToggle={(value) => void patch({ sellosPorVencer: value })}
        />
      ) : null}

      {/*
        ── B. Casi llegás ────────────────────────────────────────────────
        Solo existe como concepto si el negocio usa tarjeta de sellos — sin
        `progreso` en `automations` (sellos apagados), ni se muestra: no es
        "Desactivado", es una automatización que no aplica a este negocio.
      */}
      {progreso ? (
        <AutomationCard
          icon={Clock3}
          title="Casi llegás"
          description="Recordale al cliente cuando esté cerca de completar su tarjeta."
          example="“Te falta 1 sello para tus 3 medialunas gratis.”"
          enabled={progreso.enabled}
          channels={progreso.channels}
          disabled={!canManage || saving}
          onToggle={(value) => void patch({ cercaDelPremio: value })}
        />
      ) : null}

      {/* ── C. Cumpleaños ────────────────────────────────────────────── */}
      {cumpleanos ? (
        <AutomationCard
          icon={CakeSlice}
          title="Cumpleaños"
          description="Un saludo al cliente el día de su cumpleaños."
          example="“¡Feliz cumpleaños de parte de tu negocio! 🎉”"
          enabled={cumpleanos.enabled}
          locked={cumpleanos.locked}
          channels={cumpleanos.channels}
          disabled={!canManage || saving}
          onToggle={(value) => void patch({ cumpleanos: value })}
        />
      ) : null}

      {/*
        ── D. Te extrañamos ─────────────────────────────────────────────
        Solo activar/desactivar. Qué beneficio ofrece (si ofrece alguno) y
        el límite mensual se configuran en Programa — acá ni se leen ni se
        repiten.
      */}
      <AutomationCard
        icon={UserRoundSearch}
        title="Te extrañamos"
        channels={reactivacion?.channels ?? ["whatsapp"]}
        description="Flikker detecta clientes que solían venir y hace tiempo que no aparecen."
        enabled={reactivacion?.enabled ?? false}
        disabled={!canManage || saving}
        onToggle={(value) => void patch({ teExtranamos: value })}
      />

      {data.reactivationFunnel ? (
        <ReactivationFunnelCard funnel={data.reactivationFunnel} />
      ) : null}

      {/* ── Horario de envío ─────────────────────────────────────────── */}
      {settings ? (
        <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5 sm:p-6">
          <p className="text-sm font-semibold text-[#202333]">
            Horario de envío
          </p>
          <p className="mt-1 text-xs leading-5 text-[#8891A4]">
            Cuándo puede Flikker mandar estos mensajes.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#202333]">
            <span>Entre las</span>
            <HourSelect
              value={settings.sendingHourStart}
              disabled={!canManage}
              onChange={(v) => void patchSettings({ sendingHourStart: v })}
            />
            <span>y las</span>
            <HourSelect
              value={settings.sendingHourEnd}
              disabled={!canManage}
              onChange={(v) => void patchSettings({ sendingHourEnd: v })}
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {DAY_NAMES.map((name, index) => {
              const day = index + 1;
              const active = settings.allowedSendingDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  disabled={!canManage}
                  onClick={() =>
                    void patchSettings({
                      allowedSendingDays: active
                        ? settings.allowedSendingDays.filter((d) => d !== day)
                        : [...settings.allowedSendingDays, day].sort(),
                    })
                  }
                  className={`h-9 w-12 rounded-[9px] border text-xs font-semibold transition-colors disabled:opacity-60 ${
                    active
                      ? "border-[#5C6BC0] bg-[#EEF0FB] text-[#4A56A6]"
                      : "border-[#E3E5F0] bg-white text-[#8891A4]"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      {!canManage ? (
        <p className="text-xs text-[#8891A4]">
          Solo el dueño o un administrador pueden cambiar estas opciones.
        </p>
      ) : null}
    </div>
  );
}

function AutomationCard({
  icon: Icon,
  title,
  description,
  example,
  enabled,
  disabled,
  locked = false,
  channels = [],
  onToggle,
}: {
  icon: typeof Clock3;
  title: string;
  description: string;
  example?: string;
  enabled: boolean;
  disabled: boolean;
  /** Función Pro sin acceso — el toggle se reemplaza por el badge + link. */
  locked?: boolean;
  /** Canales reales devueltos por el backend. Nunca Push ni Wallet. */
  channels?: Channel[];
  onToggle: (value: boolean) => void;
}) {
  return (
    <section className="rounded-[14px] border border-[#E8EAF0] bg-white px-4 py-3.5 shadow-[0_1px_4px_rgba(17,22,59,0.035)] sm:px-5">
      <div className="flex items-center gap-3.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#F5F6FA] text-[#7F879C]">
          <Icon className="h-4 w-4" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-[#202333]">{title}</h3>
            {locked ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#F1EDFF] px-2 py-0.5 text-[10px] font-semibold text-[#7258D6]">
                <Lock className="h-3 w-3" /> PRO
              </span>
            ) : enabled ? (
              <span
                className="rounded-full bg-[#EAF7EF] px-2 py-0.5 text-[10px] font-semibold text-[#147A5B]"
              >
                Activo
              </span>
            ) : null}
            <ChannelBadges channels={channels} />
          </div>
          <p className="mt-1 text-xs leading-5 text-[#8891A4]">
            {description}
          </p>
          {example ? (
            <p className="mt-0.5 hidden text-xs italic text-[#B0B8C9] lg:block">{example}</p>
          ) : null}
        </div>

        {locked ? (
          <Link
            href="/dashboard/settings/suscripcion"
            className="shrink-0 text-xs font-semibold text-[#6D4AFF] hover:underline"
          >
            Ver planes
          </Link>
        ) : (
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label={title}
            disabled={disabled}
            onClick={() => onToggle(!enabled)}
            className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              enabled ? "bg-[#6D4AFF]" : "bg-[#DDE1EC]"
            }`}
          >
            <span
              className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                enabled ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        )}
      </div>
    </section>
  );
}

function pct(value: number): string {
  return `${(value * 100).toLocaleString("es-UY", { maximumFractionDigits: 1 })}%`;
}

const EVIDENCE_LABEL: Record<EvidenceState, string> = {
  INSUFFICIENT_DATA: "Todavía no hay suficientes datos",
  PRELIMINARY: "Dato preliminar",
  ENOUGH_DATA: "Dato confirmado",
};

/**
 * "X contactados → Y volvieron → Z% de recuperación" — la métrica principal
 * real de "Te extrañamos". Los números siempre vienen del backend
 * (`ReactivationFunnelService`, atribución real de Retention V2 + Visits);
 * esta card nunca calcula nada, solo los muestra. El resumen de IA vive
 * separado (`ReactivationSummaryBlock`) y nunca bloquea estos números si
 * falla o todavía está cargando.
 */
function ReactivationFunnelCard({ funnel }: { funnel: ReactivationFunnel }) {
  const { overall } = funnel;

  if (overall.contacted === 0) {
    return (
      <section className="rounded-[14px] border border-[#E8EAF0] bg-white px-4 py-3.5 shadow-[0_1px_4px_rgba(17,22,59,0.035)] sm:px-5">
        <p className="text-sm font-semibold text-[#202333]">
          Resultados de &ldquo;Te extrañamos&rdquo;
        </p>
        <p className="mt-1 text-xs leading-5 text-[#8891A4]">
          Todavía no contactamos a ningún cliente — en cuanto se envíe el
          primer recordatorio, vas a ver acá cuántos volvieron.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[14px] border border-[#E8EAF0] bg-white px-4 py-3.5 shadow-[0_1px_4px_rgba(17,22,59,0.035)] sm:px-5">
      <p className="text-sm font-semibold text-[#202333]">
        Resultados de &ldquo;Te extrañamos&rdquo;
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[#202333]">
        <span className="text-lg font-bold">{overall.contacted}</span>
        <span className="text-[#8891A4]">contactados</span>
        <span aria-hidden="true" className="text-[#B0B8C9]">
          →
        </span>
        <span className="text-lg font-bold">{overall.returned}</span>
        <span className="text-[#8891A4]">volvieron</span>
        <span aria-hidden="true" className="text-[#B0B8C9]">
          →
        </span>
        <span className="text-lg font-bold text-[#147A5B]">
          {pct(overall.recoveryRate)}
        </span>
        <span className="text-[#8891A4]">de recuperación</span>
      </div>

      {overall.averageDaysToReturn !== null ? (
        <p className="mt-1.5 text-xs text-[#8891A4]">
          En promedio, vuelven a los{" "}
          {Math.round(overall.averageDaysToReturn)} días.
        </p>
      ) : null}

      {funnel.byArm ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <ArmStat label="Solo recordatorio" stats={funnel.byArm.reminderOnly} />
          <ArmStat label="Con beneficio" stats={funnel.byArm.withBenefit} />
        </div>
      ) : (
        <p className="mt-3 text-xs text-[#8891A4]">
          {EVIDENCE_LABEL.INSUFFICIENT_DATA} para comparar recordatorio-solo
          vs. con beneficio.
        </p>
      )}

      <ReactivationSummaryBlock />
    </section>
  );
}

function ArmStat({ label, stats }: { label: string; stats: FunnelStats }) {
  return (
    <div className="rounded-[10px] bg-[#F5F6FA] px-3 py-2.5">
      <p className="text-xs font-semibold text-[#202333]">{label}</p>
      <p className="mt-0.5 text-sm text-[#5F6780]">
        {stats.contacted} contactados · {pct(stats.recoveryRate)} volvió
      </p>
    </div>
  );
}

/**
 * Párrafo de IA que solo resume los números de arriba — nunca los calcula
 * (`validateChatbotDataAnswer` en el backend garantiza que no mencione un
 * número que no esté en el payload). Se pide aparte (endpoint propio,
 * cacheado 24h) para que nunca demore ni bloquee la card de números reales.
 */
function ReactivationSummaryBlock() {
  const [summary, setSummary] = useState<FunnelSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/proxy/notifications/reactivation-funnel/summary");
      if (res.ok) setSummary((await res.json()) as FunnelSummary | null);
    } catch {
      // Silencioso a propósito: el resumen es un adorno, nunca bloquea los
      // números reales de arriba, que ya se mostraron igual.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch(
        "/api/proxy/notifications/reactivation-funnel/summary/refresh",
        { method: "POST" },
      );
      if (res.ok) setSummary((await res.json()) as FunnelSummary | null);
    } catch {
      // Igual que arriba.
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-[#F0F1F5]" />
    );
  }

  if (!summary) return null;

  return (
    <div className="mt-3 flex items-start gap-2 rounded-[10px] bg-[#F5F3FF] px-3 py-2.5">
      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#6D4AFF]" aria-hidden="true" />
      <p className="flex-1 text-xs leading-5 text-[#4A3F7A]">{summary.summaryText}</p>
      <button
        type="button"
        onClick={() => void refresh()}
        disabled={refreshing}
        aria-label="Actualizar resumen"
        className="shrink-0 rounded-full p-1 text-[#6D4AFF] hover:bg-white/60 disabled:opacity-50"
      >
        <RefreshCw
          className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

/**
 * Badges de los canales que devuelve el backend. Flikker usa WhatsApp y
 * email; nunca se muestran Push ni Wallet por imitar la referencia.
 */
function ChannelBadges({ channels }: { channels: Channel[] }) {
  return (
    <>
      {channels.includes("whatsapp") ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#EAF7EF] px-2 py-0.5 text-[10px] font-semibold text-[#147A5B]">
          <WhatsAppIcon /> WhatsApp
        </span>
      ) : null}
      {channels.includes("email") ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-[#EEF4FF] px-2 py-0.5 text-[10px] font-semibold text-[#4565B2]">
          <Mail className="h-3 w-3" aria-hidden="true" /> Email
        </span>
      ) : null}
    </>
  );
}

/** Mismo ícono que usa el botón de soporte del sidebar — un solo trazo, consistente en todo Flikker. */
function WhatsAppIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-3 w-3 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3.5 20.5l1.4-4.3a8.5 8.5 0 1 1 15.6-4.6Z" />
    </svg>
  );
}

function HourSelect({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-9 rounded-[9px] border border-[#E3E5F0] bg-white px-2 text-sm text-[#202333] outline-none focus:border-[#5C6BC0] disabled:opacity-60"
    >
      {Array.from({ length: 24 }, (_, h) => (
        <option key={h} value={h}>
          {String(h).padStart(2, "0")}:00
        </option>
      ))}
    </select>
  );
}
