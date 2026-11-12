"use client";

import { useCallback, useEffect, useState } from "react";
import { OctagonPause, Play, ShieldCheck } from "lucide-react";
import Button from "@/components/ui/button";
import InlineNotice from "@/components/ui/inline-notice";
import SectionCard from "@/components/ui/section-card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useRole } from "../../../role-context";
import {
  FIELD_HINTS,
  FIELD_LABELS,
  FIELD_ORDER,
  budgetLine,
  formatMoney,
  incentiveBudgetChange,
  initialForm,
  parseForm,
  pauseReasonLabel,
  weeklyReachText,
  type ParsedPolicyValues,
  type PolicyForm,
  type PolicyView,
} from "./policy-view";

const BASE = "/api/proxy/policy";

async function readJson<T>(res: Response): Promise<T> {
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "message" in body
        ? String((body as { message: unknown }).message)
        : "No pudimos completar la acción.";
    throw new Error(message);
  }
  return body as T;
}

/**
 * Configuración → Políticas. El kill switch va arriba y siempre visible;
 * el formulario arranca con el preset Equilibrado (editable) y nada se
 * aplica hasta que el dueño lo acepta. Solo el dueño acepta, edita y
 * reanuda; un admin puede pausar.
 */
export default function PolicyClient() {
  const toast = useToast();
  const { role } = useRole();
  const isOwner = role === "OWNER";
  const canPause = role === "OWNER" || role === "ADMIN";
  const [view, setView] = useState<PolicyView | null>(null);
  const [form, setForm] = useState<PolicyForm | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "pause" | "resume" | null>(null);
  /** Cambio del presupuesto de incentivos esperando la confirmación del dueño. */
  const [pending, setPending] = useState<{ message: string; values: ParsedPolicyValues } | null>(null);

  const apply = useCallback((next: PolicyView) => {
    setView(next);
    setForm(initialForm(next));
    setConfirmed(false);
    setPending(null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await readJson<PolicyView>(await fetch(BASE));
        if (!cancelled) apply(next);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "No pudimos cargar la política.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apply]);

  async function run(kind: "save" | "pause" | "resume", request: () => Promise<Response>, ok: string) {
    setBusy(kind);
    setFormError(null);
    try {
      apply(await readJson<PolicyView>(await request()));
      toast.success(ok);
    } catch (err) {
      const message = err instanceof Error ? err.message : "No pudimos completar la acción.";
      if (kind === "save") setFormError(message);
      else toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  function save() {
    if (!view || !form) return;
    const parsed = parseForm(form);
    if (!parsed.ok) {
      setFormError(parsed.error);
      return;
    }
    if (!view.accepted && !confirmed) {
      setFormError("Confirmá la moneda y la zona horaria del negocio para aceptar.");
      return;
    }
    // Cambiar cuánto se puede gastar en incentivos pide una confirmación aparte.
    const change = incentiveBudgetChange(view, parsed.values);
    if (change) {
      setFormError(null);
      setPending({ message: change, values: parsed.values });
      return;
    }
    submit(parsed.values);
  }

  function submit(values: ParsedPolicyValues) {
    if (!view) return;
    setPending(null);
    const body = view.accepted
      ? { ...values, expectedVersion: view.version }
      : {
          ...values,
          confirmedCurrency: view.business.currency,
          confirmedTimezone: view.business.timezone,
          policyVersion: view.policyVersion,
        };
    void run(
      "save",
      () =>
        fetch(view.accepted ? BASE : `${BASE}/accept`, {
          method: view.accepted ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
      view.accepted ? "Política actualizada." : "Política aceptada.",
    );
  }

  if (loadError) {
    return <InlineNotice tone="danger" title="No pudimos cargar la política">{loadError}</InlineNotice>;
  }
  if (!view || !form) {
    return (
      <div
        className="h-40 animate-pulse rounded-[var(--panel-radius-card)] bg-[color:var(--panel-surface-muted)]"
        aria-label="Cargando política"
      />
    );
  }

  const currency = view.confirmed.currency ?? view.business.currency;
  const reconfirm = view.blockers.some((b) => b.code === "POLICY_RECONFIRM_REQUIRED" || b.code === "POLICY_OUTDATED");

  return (
    <div className="space-y-6">
      {/* Kill switch: siempre arriba, siempre visible. */}
      <section
        aria-label="Interruptor de envíos"
        className={`flex flex-wrap items-center justify-between gap-4 rounded-[var(--panel-radius-card)] border p-5 ${
          view.paused
            ? "border-[color:var(--panel-danger-border)] bg-[color:var(--panel-danger-bg)]"
            : "border-[color:var(--panel-border)] bg-[color:var(--panel-surface)]"
        }`}
      >
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-[color:var(--panel-text)]">
            {view.paused ? (
              <OctagonPause className="h-4 w-4 text-[color:var(--panel-danger-text)]" aria-hidden="true" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-[color:var(--panel-success-text)]" aria-hidden="true" />
            )}
            {view.paused
              ? "Envíos y cambios con costo: PAUSADOS"
              : view.accepted
                ? "Política activa"
                : "Política sin aceptar"}
          </p>
          <p className="mt-1 text-sm text-[color:var(--panel-text-secondary)]">
            {view.paused
              ? `${pauseReasonLabel(view.pausedReason)} No sale ninguna promoción ni mensaje de Autopilot, y Intelligence no puede aplicar cambios con costo.`
              : view.accepted
                ? "Promociones, Autopilot e Intelligence respetan estos topes. Pausar frena todo al instante."
                : "Mientras no la aceptes, Promociones y Autopilot siguen funcionando como siempre e Intelligence no puede aplicar cambios con impacto."}
          </p>
        </div>
        {view.paused ? (
          isOwner ? (
            <Button
              variant="primary"
              onClick={() =>
                void run("resume", () => fetch(`${BASE}/resume`, { method: "POST" }), "Envíos reanudados.")
              }
              loading={busy === "resume"}
              disabled={busy !== null}
            >
              <Play className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Reanudar
            </Button>
          ) : (
            <span className="text-xs text-[color:var(--panel-text-muted)]">Solo el dueño puede reanudar.</span>
          )
        ) : canPause && view.accepted ? (
          <Button
            variant="danger"
            onClick={() =>
              void run("pause", () => fetch(`${BASE}/pause`, { method: "POST" }), "Envíos pausados.")
            }
            loading={busy === "pause"}
            disabled={busy !== null}
          >
            <OctagonPause className="mr-1.5 h-4 w-4" aria-hidden="true" />
            Pausar todo
          </Button>
        ) : null}
      </section>

      {view.missing.includes("MESSAGE_UNIT_COST") ? (
        <InlineNotice tone="warning" title="Falta el costo por mensaje">
          Flikker todavía no cargó cuánto cuesta cada mensaje de tu negocio. Hasta que lo haga, ninguna
          promoción gobernada por la política puede salir.
        </InlineNotice>
      ) : null}
      {reconfirm ? (
        <InlineNotice tone="warning" title="Volvé a aceptar la política">
          {view.blockers
            .filter((b) => b.code === "POLICY_RECONFIRM_REQUIRED" || b.code === "POLICY_OUTDATED")
            .map((b) => b.message)
            .join(" ")}
        </InlineNotice>
      ) : null}

      <SectionCard title="Este mes" description="Uso real, contado desde los envíos y premios del mes.">
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <Fact
            term="Mensajería"
            value={budgetLine(currency, view.usage.messagingSpentThisMonth, view.values.messagingBudgetMonthly)}
            hint={`${view.usage.messagesSentThisMonth} mensajes de marketing`}
          />
          <Fact
            term="Incentivos comprometidos"
            value={
              view.incentives.budgetSet
                ? budgetLine(currency, view.usage.incentiveLiabilityThisMonth, view.values.incentiveBudgetMonthly)
                : `${formatMoney(currency, view.usage.incentiveLiabilityThisMonth)} · sin presupuesto`
            }
            hint={
              view.usage.issuancesWithUnknownCost > 0
                ? `${view.usage.issuancesWithUnknownCost} premios sin costo estimado`
                : "Canjeados o todavía canjeables"
            }
          />
          <Fact
            term="Con WhatsApp autorizado"
            value={`${view.usage.customersWithWhatsappConsent} de ${view.weeklyReach.registeredCustomers} clientes`}
            hint="Solo a ellos les pueden llegar promociones"
          />
          <Fact
            term="Alcance esta semana"
            value={
              view.weeklyReach.mode === "ADAPTIVE"
                ? `${view.weeklyReach.contactedThisWeek} contactados · sin tope por %`
                : view.weeklyReach.capThisWeek === null
                  ? `${view.weeklyReach.contactedThisWeek} contactados`
                  : `${view.weeklyReach.contactedThisWeek} de ${view.weeklyReach.capThisWeek} clientes`
            }
            hint={
              view.weeklyReach.mode === "ADAPTIVE"
                ? `Base chica (menos de ${view.weeklyReach.threshold} clientes): decide Intelligence`
                : "Clientes distintos, todos los motores juntos"
            }
          />
          <Fact
            term="Costo por mensaje"
            value={
              view.messageUnitCost === null
                ? "Sin cargar"
                : `${view.messageUnitCostCurrency ?? currency} ${view.messageUnitCost}`
            }
            hint="Lo carga Flikker"
          />
        </dl>
      </SectionCard>

      <IncentivesCard view={view} currency={currency} />

      <SectionCard
        title={view.accepted ? "Topes de tu negocio" : "Preset Equilibrado (editable)"}
        description="Reglas duras: nadie las saltea, ni la pantalla, ni Intelligence, ni un reintento. Son máximos, no metas: Intelligence puede usar menos. Una campaña puede usar hasta el % indicado de cada presupuesto."
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <p className="text-sm text-[color:var(--panel-text-secondary)]">{weeklyReachText(view)}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FIELD_ORDER.map((key) => (
              <label key={key} className="block min-w-0 text-sm">
                <span className="mb-1.5 block font-medium text-[color:var(--panel-text-secondary)]">
                  {FIELD_LABELS[key]}
                  {key === "messagingBudgetMonthly" || key === "incentiveBudgetMonthly" ? ` (${currency})` : ""}
                </span>
                <Input
                  inputMode="decimal"
                  value={form[key]}
                  placeholder={key === "incentiveBudgetMonthly" ? "Sin definir" : undefined}
                  disabled={!isOwner || busy !== null}
                  onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                />
                {FIELD_HINTS[key] ? (
                  <span className="mt-1 block text-xs text-[color:var(--panel-text-muted)]">{FIELD_HINTS[key]}</span>
                ) : null}
              </label>
            ))}
          </div>

          {!view.accepted && isOwner ? (
            <label className="flex items-start gap-2 text-sm text-[color:var(--panel-text-secondary)]">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              <span>
                Confirmo que mi negocio trabaja en <strong>{view.business.currency}</strong> y en la zona horaria{" "}
                <strong>{view.business.timezone}</strong>. Si no es así, corregilo primero en Configuración → Negocio.
              </span>
            </label>
          ) : null}

          {formError ? (
            <p className="text-sm text-[color:var(--panel-danger-text)]" role="alert">
              {formError}
            </p>
          ) : null}

          {pending ? (
            <div
              role="alertdialog"
              aria-label="Confirmar presupuesto de incentivos"
              className="space-y-3 rounded-[var(--panel-radius-card)] border border-[color:var(--panel-border)] bg-[color:var(--panel-surface-muted)] p-4"
            >
              <p className="text-sm text-[color:var(--panel-text)]">{pending.message}</p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="primary" onClick={() => submit(pending.values)} disabled={busy !== null}>
                  Confirmar cambio
                </Button>
                <Button type="button" variant="secondary" onClick={() => setPending(null)} disabled={busy !== null}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : isOwner ? (
            <Button type="submit" variant="primary" loading={busy === "save"} disabled={busy !== null}>
              {view.accepted ? "Guardar cambios" : "Aceptar política"}
            </Button>
          ) : (
            <p className="text-xs text-[color:var(--panel-text-muted)]">Solo el dueño puede aceptar o cambiar la política.</p>
          )}
        </form>
      </SectionCard>
    </div>
  );
}

/**
 * En qué se va el presupuesto de beneficios: lo comprometido (canjeado o
 * todavía canjeable), lo ya consumido, lo reservado por envíos en curso, por
 * incentivo y por campaña de Intelligence.
 */
function IncentivesCard({ view, currency }: { view: PolicyView; currency: string }) {
  const { incentives } = view;
  const money = (v: number) => formatMoney(currency, v);
  return (
    <SectionCard
      title="Beneficios e incentivos"
      description="El presupuesto lo definís vos. Intelligence busca el mejor resultado dentro de él: gastarlo todo no es el objetivo."
    >
      <div className="space-y-5">
        {!incentives.budgetSet ? (
          <InlineNotice tone="info" title="Todavía no definiste un presupuesto de incentivos">
            Hasta que lo definas, Intelligence solo diseña acciones sin beneficios con costo (recordatorios,
            novedades, invitaciones) y no compromete gastos. Podés cargarlo en los topes de abajo, incluso en 0.
          </InlineNotice>
        ) : null}

        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <Fact
            term="Comprometido este mes"
            value={budgetLine(currency, incentives.committed + incentives.inFlight, view.values.incentiveBudgetMonthly)}
            hint="Canjeado, todavía canjeable o reservado por envíos en curso"
          />
          <Fact term="Consumido" value={money(incentives.consumed)} hint="Beneficios ya canjeados" />
          <Fact
            term="Reservado ahora"
            value={money(incentives.inFlight)}
            hint="Campañas saliendo en este momento"
          />
        </dl>

        {incentives.byIncentive.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="flk-table w-full min-w-[560px] text-left text-sm">
              <thead className="text-[12px] uppercase tracking-[0.08em] text-[color:var(--panel-text-muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Incentivo</th>
                  <th className="px-4 py-3 font-semibold">Entregados</th>
                  <th className="px-4 py-3 font-semibold">Canjeados</th>
                  <th className="px-4 py-3 font-semibold">Comprometido</th>
                  <th className="px-4 py-3 font-semibold">Consumido</th>
                </tr>
              </thead>
              <tbody>
                {incentives.byIncentive.map((row) => (
                  <tr key={row.label} className="border-t border-[color:var(--panel-border)]">
                    <td className="px-4 py-3 font-semibold text-[color:var(--panel-text)]">
                      {row.label}
                      {row.unknownCost > 0 ? (
                        <span className="ml-2 text-xs font-normal text-[color:var(--panel-text-muted)]">
                          ({row.unknownCost} sin costo estimado)
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{row.issued}</td>
                    <td className="px-4 py-3">{row.redeemed}</td>
                    <td className="px-4 py-3">{money(row.committedCost)}</td>
                    <td className="px-4 py-3">{money(row.consumedCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-[color:var(--panel-text-muted)]">Este mes todavía no se entregó ningún beneficio.</p>
        )}

        <div>
          <p className="text-sm font-semibold text-[color:var(--panel-text)]">Campañas de Intelligence en curso</p>
          {incentives.campaigns.length === 0 ? (
            <p className="mt-1 text-sm text-[color:var(--panel-text-muted)]">Ninguna en este momento.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {incentives.campaigns.map((c) => (
                <li key={c.id} className="flex flex-wrap justify-between gap-2">
                  <span className="min-w-0 text-[color:var(--panel-text)]">{c.title}</span>
                  <span className="text-[color:var(--panel-text-secondary)]">
                    {c.estimatedCost === null ? "Costo sin estimar" : `Costo estimado ${money(c.estimatedCost)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <p className="text-xs text-[color:var(--panel-text-muted)]">
          Para limitar gastos, bajá el presupuesto (0 = sin costos de incentivos). Para frenar todo al instante, usá
          &ldquo;Pausar todo&rdquo; arriba.
        </p>
      </div>
    </SectionCard>
  );
}

function Fact({ term, value, hint }: { term: string; value: string; hint: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[color:var(--panel-text-muted)]">{term}</dt>
      <dd className="mt-1 break-words font-semibold text-[color:var(--panel-text)]">{value}</dd>
      <dd className="mt-0.5 text-xs text-[color:var(--panel-text-muted)]">{hint}</dd>
    </div>
  );
}
