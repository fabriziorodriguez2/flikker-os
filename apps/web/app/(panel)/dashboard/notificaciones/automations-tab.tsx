"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Loader2, Sparkles } from "lucide-react";
import { useIsOwnerOrAdmin } from "../../role-context";

/**
 * Automáticas — los mensajes que Flikker manda solo.
 *
 * Solo se muestran las automatizaciones que EXISTEN de verdad, y solo cuando
 * tienen sentido para ESTE negocio. Hoy son dos como máximo:
 *  - "Te extrañamos" — siempre puede mostrarse. No depende de tarjeta de
 *    sellos ni de tener beneficios: sin nada de eso, manda un recordatorio
 *    simple.
 *  - "Cerca del premio" — solo si el negocio tiene tarjeta de sellos activa
 *    (`overview.automations` directamente no la incluye si no). Mostrarla
 *    apagada igual sería confuso: no es que esté desactivada, es que no
 *    aplica.
 * Hubo una tercera candidata ("recordar recompensa disponible") que no se
 * incluye porque el motor no tiene con qué ejecutarla: su único objetivo de
 * progreso recluta tarjetas en curso y excluye las ya desbloqueadas. Un
 * checkbox que no hace nada es peor que uno que falta.
 */

interface Overview {
  automations: { key: "cerca_del_premio" | "te_extranamos"; enabled: boolean }[];
  status: {
    activeCount: number;
    testMode: boolean;
    engineEnabled: boolean;
    /** El único estado de canal que existe de verdad — ver `## Canal`. */
    channel: "activo" | "no_conectado";
  };
  benefits: { id: string; name: string; authorized: boolean }[];
  /**
   * El único presupuesto que el dueño ve — nunca el tope monetario, que
   * sigue siendo configuración avanzada de Platform Admin.
   */
  benefitsAutomation: {
    status: "sin_autorizar" | "necesita_limite" | "listo" | "limite_alcanzado";
    monthlyLimit: number | null;
    usedThisMonth: number;
  };
  results: {
    // Dos métricas, no tres: "Detectados" salía del mismo número que
    // "Contactados", y dos KPIs que siempre coinciden hacen creer que son
    // cosas distintas.
    contacted: number;
    returned: number;
    signal: "aprendiendo" | "mejora" | "sin_diferencia";
  };
}

interface Settings {
  sendingHourStart: number;
  sendingHourEnd: number;
  allowedSendingDays: number[];
  minimumDaysBetweenMessages: number;
  maximumMessagesPer30Days: number;
}

const SIGNAL_COPY: Record<Overview["results"]["signal"], string> = {
  aprendiendo: "Flikker todavía está aprendiendo",
  mejora: "Hay señal de mejora",
  sin_diferencia: "Todavía no hay una diferencia clara",
};

const DAY_NAMES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

/**
 * No hay un default de producto existente para reutilizar (el panel
 * avanzado de Platform Admin tampoco sugiere ninguno — el input llega
 * vacío). 10/mes es un valor conservador para el volumen típico de un
 * negocio chico recién arrancando — se usa solo como sugerencia inicial al
 * autorizar el primer beneficio; el dueño lo puede cambiar en cualquier
 * momento.
 */
const SUGGESTED_MONTHLY_LIMIT = 10;

export default function AutomationsTab() {
  const canManage = useIsOwnerOrAdmin();

  const [data, setData] = useState<Overview | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  // Input controlado del límite mensual — se sincroniza con el valor real
  // cada vez que llega uno nuevo, pero el dueño puede escribir libremente
  // antes de guardar.
  const [limitDraft, setLimitDraft] = useState("");

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

  useEffect(() => {
    if (data?.benefitsAutomation.monthlyLimit != null) {
      setLimitDraft(String(data.benefitsAutomation.monthlyLimit));
    }
  }, [data?.benefitsAutomation.monthlyLimit]);

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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
    } finally {
      setSaving(false);
    }
  }

  async function patchSettings(body: Record<string, unknown>) {
    const res = await fetch("/api/proxy/notifications/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) setSettings((await res.json()) as Settings);
  }

  /**
   * Autorizar/desautorizar un beneficio. Si esta es la primera autorización
   * y todavía no hay ningún límite configurado, el límite viaja en la MISMA
   * llamada — el backend exige exactamente eso (nunca dejar un beneficio
   * autorizado sin forma de emitirse), y así el dueño nunca ve un error por
   * un paso que no sabía que faltaba.
   */
  function toggleBenefit(id: string, checked: boolean, authorizedIds: string[]) {
    const nextIds = checked
      ? [...authorizedIds, id]
      : authorizedIds.filter((x) => x !== id);
    const body: Record<string, unknown> = { benefitIds: nextIds };
    if (nextIds.length > 0 && data?.benefitsAutomation.monthlyLimit == null) {
      const suggested = limitDraft.trim()
        ? Number(limitDraft)
        : SUGGESTED_MONTHLY_LIMIT;
      body.automaticIncentiveMonthlyLimit = suggested;
      setLimitDraft(String(suggested));
    }
    void patch(body);
  }

  function saveLimit() {
    const n = Number(limitDraft);
    if (!Number.isInteger(n) || n < 1) return;
    void patch({ automaticIncentiveMonthlyLimit: n });
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[#5C6BC0]" />
      </div>
    );
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
          className="inline-flex h-10 items-center rounded-[10px] border border-[#E3E5F0] bg-white px-4 text-sm font-semibold text-[#202333] hover:border-[#5C6BC0]"
        >
          Reintentar
        </button>
      </div>
    );
  }

  if (!data) return null;

  const progreso = data.automations.find((a) => a.key === "cerca_del_premio");
  const reactivacion = data.automations.find((a) => a.key === "te_extranamos");
  const authorizedIds = data.benefits.filter((b) => b.authorized).map((b) => b.id);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-[#202333]">
          Notificaciones automáticas
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#7F879C]">
          Flikker puede contactar a tus clientes en momentos importantes, sin
          que tengas que hacerlo manualmente.
        </p>
      </div>

      {error ? (
        <p className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
          {error}
        </p>
      ) : null}

      {/* ── Estado general ────────────────────────────────────────────── */}
      <div className="rounded-[16px] border border-[#E8EAF0] bg-white px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
              Automatizaciones
            </p>
            <p className="mt-1 font-display text-xl font-semibold text-[#202333]">
              {data.status.activeCount === 0
                ? "Ninguna activa"
                : data.status.activeCount === 1
                  ? "1 activa"
                  : `${data.status.activeCount} activas`}
            </p>
          </div>
          {data.status.activeCount > 0 && !data.status.testMode ? (
            <p className="flex items-center gap-1.5 text-sm text-[#147A5B]">
              <Sparkles className="h-4 w-4" />
              Flikker está trabajando en segundo plano.
            </p>
          ) : null}
        </div>

        {/*
          `dryRunEnabled` dicho como producto. Importa mostrarlo: sin esto el
          dueño vería 0 mensajes enviados y pensaría que algo se rompió.
        */}
        {data.status.testMode ? (
          <p className="mt-3 rounded-[10px] bg-[#FFF7EE] px-3.5 py-2.5 text-sm leading-5 text-[#8A520D]">
            <strong>Modo de prueba.</strong> Flikker está detectando a quién
            contactaría, pero todavía no envía mensajes.
          </p>
        ) : null}

        {/*
          El canal es la única condición real de "puede mandar WhatsApp" (ver
          `## Canal`). Sin esto un dueño con todo bien configurado vería 0
          mensajes y pensaría que rompió algo — acá se le explica por qué.
        */}
        {data.status.channel === "no_conectado" ? (
          <p className="mt-3 rounded-[10px] bg-[#FDEEEE] px-3.5 py-2.5 text-sm leading-5 text-[#B3261E]">
            <strong>Flikker no puede enviar mensajes por ahora.</strong> Tus
            automatizaciones quedan configuradas, pero no van a salir mensajes
            hasta que se resuelva. Escribinos si necesitás ayuda.
          </p>
        ) : null}
      </div>

      {data.status.activeCount === 0 ? (
        <p className="rounded-[16px] border border-dashed border-[#DDE1EC] bg-white px-5 py-6 text-sm text-[#8891A4]">
          Todavía no activaste notificaciones automáticas. Activá alguna de las
          de abajo para que Flikker empiece a ayudarte.
        </p>
      ) : null}

      {/*
        ── A. Cerca del premio ─────────────────────────────────────────
        Solo existe como concepto si el negocio usa tarjeta de sellos — sin
        `progreso` en `automations` (sellos apagados), ni se muestra: no es
        "Desactivado", es una automatización que no aplica a este negocio.
      */}
      {progreso ? (
        <AutomationCard
          title="Cerca del premio"
          description="Recordale al cliente cuando esté cerca de completar su tarjeta."
          example="“Te falta 1 sello para tus 3 medialunas gratis.”"
          enabled={progreso.enabled}
          disabled={!canManage || saving}
          onToggle={(value) => void patch({ cercaDelPremio: value })}
        />
      ) : null}

      {/* ── B. Te extrañamos ──────────────────────────────────────────── */}
      <AutomationCard
        title="Te extrañamos"
        description="Flikker detecta clientes que solían venir y hace tiempo que no aparecen."
        enabled={reactivacion?.enabled ?? false}
        disabled={!canManage || saving}
        onToggle={(value) => void patch({ teExtranamos: value })}
      >
        {reactivacion?.enabled ? (
          <div className="mt-5 space-y-5 border-t border-[#EFF1F7] pt-5">
            <div>
              <p className="text-sm font-semibold text-[#202333]">
                ¿Cómo querés intentar recuperarlos?
              </p>
              <label className="mt-2.5 flex cursor-pointer items-start gap-2.5 text-sm">
                <input
                  type="radio"
                  checked={authorizedIds.length === 0}
                  onChange={() => void patch({ benefitIds: [] })}
                  disabled={!canManage || saving}
                  className="mt-0.5 h-4 w-4 accent-[#5C6BC0]"
                />
                <span className="text-[#202333]">
                  Solo enviar un recordatorio
                </span>
              </label>
            </div>

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-[#202333]">
                  Beneficios que Flikker puede usar
                </p>
                <BenefitsStatusBadge status={data.benefitsAutomation.status} />
              </div>
              {data.benefits.length > 0 ? (
                <div className="mt-2.5 space-y-2">
                  {data.benefits.map((benefit) => (
                    <label
                      key={benefit.id}
                      className="flex cursor-pointer items-center gap-2.5 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={benefit.authorized}
                        disabled={!canManage || saving}
                        onChange={(e) =>
                          toggleBenefit(benefit.id, e.target.checked, authorizedIds)
                        }
                        className="h-4 w-4 accent-[#5C6BC0]"
                      />
                      <span className="text-[#202333]">{benefit.name}</span>
                    </label>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-[#8891A4]">
                  Todavía no tenés beneficios para ofrecer.
                </p>
              )}
              <p className="mt-3 text-xs leading-5 text-[#8891A4]">
                Si no seleccionás ninguno, Flikker igual puede enviar
                recordatorios sin beneficio. Nunca va a ofrecer uno que no
                hayas autorizado.
              </p>
              {/* El catálogo es de Programa. Acá solo se autoriza. */}
              <Link
                href="/dashboard/programa"
                className="mt-2 inline-block text-xs font-semibold text-[#5C6BC0] hover:underline"
              >
                Crear beneficio en Programa →
              </Link>
            </div>

            {/*
              §10/§11 — el límite solo importa (y solo se muestra) una vez
              que hay al menos un beneficio autorizado. Con 0 autorizados,
              "solo recordatorios" ya lo dice todo — un límite acá sería un
              requisito inventado para algo que no lo necesita.
            */}
            {authorizedIds.length > 0 ? (
              <div>
                <p className="text-sm font-semibold text-[#202333]">
                  Límite mensual de beneficios automáticos
                </p>
                <p className="mt-1 text-xs leading-5 text-[#8891A4]">
                  ¿Cuántos beneficios como máximo puede ofrecer Flikker por
                  mes?
                </p>
                <div className="mt-2.5 flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={limitDraft}
                    disabled={!canManage || saving}
                    onChange={(e) => setLimitDraft(e.target.value)}
                    className="h-10 w-24 rounded-[9px] border border-[#E3E5F0] bg-white px-3 text-sm text-[#202333] outline-none focus:border-[#5C6BC0] disabled:opacity-60"
                  />
                  {String(data.benefitsAutomation.monthlyLimit ?? "") !==
                  limitDraft.trim() ? (
                    <button
                      type="button"
                      disabled={!canManage || saving}
                      onClick={saveLimit}
                      className="inline-flex h-10 items-center rounded-[9px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0] disabled:opacity-60"
                    >
                      Guardar
                    </button>
                  ) : null}
                </div>
                {data.benefitsAutomation.monthlyLimit != null ? (
                  <p className="mt-2 text-xs leading-5 text-[#8891A4]">
                    Flikker nunca entregará más de{" "}
                    {data.benefitsAutomation.monthlyLimit} beneficios
                    automáticos por mes. Los recordatorios sin beneficio no
                    cuentan para este límite.
                  </p>
                ) : null}
                {data.benefitsAutomation.status === "limite_alcanzado" ? (
                  <p className="mt-2 rounded-[10px] bg-[#FFF7EE] px-3.5 py-2.5 text-xs leading-5 text-[#8A520D]">
                    Ya se alcanzó el límite de este mes (
                    {data.benefitsAutomation.usedThisMonth}/
                    {data.benefitsAutomation.monthlyLimit}). Los recordatorios
                    sin beneficio siguen saliendo con normalidad.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-[#8891A4]">
                Flikker está usando solo recordatorios.
              </p>
            )}

            {/* ── Resultados ────────────────────────────────────────── */}
            <div className="rounded-[12px] bg-[#F7F8FC] px-4 py-3.5">
              <div className="flex flex-wrap gap-x-8 gap-y-2">
                <Metric label="Contactados" value={data.results.contacted} />
                <Metric label="Volvieron" value={data.results.returned} />
              </div>
              <p className="mt-3 text-sm font-semibold text-[#5F6780]">
                {data.results.contacted === 0
                  ? "Flikker todavía necesita más visitas para aprender el ritmo de tus clientes."
                  : SIGNAL_COPY[data.results.signal]}
              </p>
            </div>
          </div>
        ) : null}
      </AutomationCard>

      {/* ── Configuración ─────────────────────────────────────────────── */}
      {settings ? (
        <div className="rounded-[16px] border border-[#E8EAF0] bg-white">
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            aria-expanded={showSettings}
            className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
          >
            <span className="text-sm font-semibold text-[#202333]">
              Configuración de notificaciones
            </span>
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-[#8891A4] transition-transform ${showSettings ? "rotate-180" : ""}`}
            />
          </button>

          {showSettings ? (
            <div className="space-y-5 border-t border-[#EFF1F7] px-5 py-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
                  Horario permitido
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#202333]">
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
                              ? settings.allowedSendingDays.filter(
                                  (d) => d !== day,
                                )
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
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
                  Cuánto se le escribe a un cliente
                </p>
                <p className="mt-2 text-sm leading-6 text-[#5F6780]">
                  Como máximo{" "}
                  <strong>
                    {settings.maximumMessagesPer30Days}{" "}
                    {settings.maximumMessagesPer30Days === 1
                      ? "mensaje"
                      : "mensajes"}
                  </strong>{" "}
                  cada 30 días, y nunca dos seguidos con menos de{" "}
                  <strong>{settings.minimumDaysBetweenMessages} días</strong> de
                  diferencia.
                </p>
              </div>
            </div>
          ) : null}
        </div>
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
  title,
  description,
  example,
  enabled,
  disabled,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  example?: string;
  enabled: boolean;
  disabled: boolean;
  onToggle: (value: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h3 className="font-display text-lg font-semibold text-[#202333]">
              {title}
            </h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                enabled
                  ? "bg-[#EAF7EF] text-[#147A5B]"
                  : "bg-[#F3F4F8] text-[#6B7280]"
              }`}
            >
              {enabled ? "Activo" : "Desactivado"}
            </span>
          </div>
          <p className="mt-1.5 max-w-lg text-sm leading-6 text-[#7F879C]">
            {description}
          </p>
          {example ? (
            <p className="mt-2 text-sm italic text-[#B0B8C9]">{example}</p>
          ) : null}
        </div>

        {/* Toggle grande: tiene que poder usarse con el pulgar. */}
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={title}
          disabled={disabled}
          onClick={() => onToggle(!enabled)}
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            enabled ? "bg-[#5C6BC0]" : "bg-[#DDE1EC]"
          }`}
        >
          <span
            className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
              enabled ? "translate-x-7" : "translate-x-1"
            }`}
          />
        </button>
      </div>
      {children}
    </section>
  );
}

/**
 * §11 — un estado separado del "Activo/Preparando" de la automatización en
 * sí: "Te extrañamos" puede estar mandando reminders perfectamente mientras
 * esto dice "Necesitan límite" — son dos preguntas distintas.
 */
function BenefitsStatusBadge({
  status,
}: {
  status: Overview["benefitsAutomation"]["status"];
}) {
  if (status === "sin_autorizar") return null;
  const copy: Record<
    Exclude<Overview["benefitsAutomation"]["status"], "sin_autorizar">,
    { label: string; className: string }
  > = {
    listo: { label: "Listos", className: "bg-[#EAF7EF] text-[#147A5B]" },
    necesita_limite: {
      label: "Necesitan límite",
      className: "bg-[#FDEEEE] text-[#B3261E]",
    },
    limite_alcanzado: {
      label: "Límite alcanzado",
      className: "bg-[#FFF7EE] text-[#8A520D]",
    },
  };
  const { label, className } = copy[status];
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${className}`}
    >
      {label}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#8891A4]">
        {label}
      </p>
      <p className="mt-0.5 font-display text-lg font-semibold text-[#202333]">
        {value}
      </p>
    </div>
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
