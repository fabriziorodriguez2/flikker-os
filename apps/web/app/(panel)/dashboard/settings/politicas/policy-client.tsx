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
  FIELD_LABELS,
  FIELD_ORDER,
  budgetLine,
  initialForm,
  parseForm,
  pauseReasonLabel,
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

  const apply = useCallback((next: PolicyView) => {
    setView(next);
    setForm(initialForm(next));
    setConfirmed(false);
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
    const body = view.accepted
      ? { ...parsed.values, expectedVersion: view.version }
      : {
          ...parsed.values,
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
        <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Fact
            term="Mensajería"
            value={budgetLine(currency, view.usage.messagingSpentThisMonth, view.values.messagingBudgetMonthly)}
            hint={`${view.usage.messagesSentThisMonth} mensajes de marketing`}
          />
          <Fact
            term="Incentivos comprometidos"
            value={budgetLine(currency, view.usage.incentiveLiabilityThisMonth, view.values.incentiveBudgetMonthly)}
            hint={
              view.usage.issuancesWithUnknownCost > 0
                ? `${view.usage.issuancesWithUnknownCost} premios sin costo estimado`
                : "Canjeados o todavía canjeables"
            }
          />
          <Fact
            term="Con WhatsApp autorizado"
            value={`${view.usage.customersWithWhatsappConsent} clientes`}
            hint="Solo a ellos les pueden llegar promociones"
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

      <SectionCard
        title={view.accepted ? "Topes de tu negocio" : "Preset Equilibrado (editable)"}
        description="Reglas duras: nadie las saltea, ni la pantalla, ni Intelligence, ni un reintento. Una campaña puede usar hasta el % indicado de las dos bolsas juntas sin pasarse de ninguna."
      >
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
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
                  disabled={!isOwner || busy !== null}
                  onChange={(event) => setForm({ ...form, [key]: event.target.value })}
                />
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

          {isOwner ? (
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

function Fact({ term, value, hint }: { term: string; value: string; hint: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-[color:var(--panel-text-muted)]">{term}</dt>
      <dd className="mt-1 break-words font-semibold text-[color:var(--panel-text)]">{value}</dd>
      <dd className="mt-0.5 text-xs text-[color:var(--panel-text-muted)]">{hint}</dd>
    </div>
  );
}
