"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  FlaskConical,
  Loader2,
  Plus,
} from "lucide-react";
import {
  SCENARIO_LABEL,
  STATUS_LABEL,
  formatDateTime,
  type OptimizationMode,
  type SimulationRunListItem,
  type SimulationScenario,
  type SimulationStatusResponse,
} from "./types";

async function readJson(res: Response) {
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      message?: string | string[];
    };
    const message = Array.isArray(data.message)
      ? data.message.join(", ")
      : data.message;
    throw new Error(message ?? "Algo salió mal.");
  }
  return res.json();
}

const SCENARIOS = Object.keys(SCENARIO_LABEL) as SimulationScenario[];

interface CreateForm {
  scenario: SimulationScenario;
  days: string;
  customerCount: string;
  seed: string;
  withAi: boolean;
  optimizationMode: OptimizationMode | "";
  checkinComplianceRate: string;
  aiFailureRate: string;
  messageFailureRate: string;
  rewardRedemptionRate: string;
}

const EMPTY_FORM: CreateForm = {
  scenario: "BASELINE_HEALTHY",
  days: "",
  customerCount: "",
  seed: "",
  withAi: false,
  optimizationMode: "",
  checkinComplianceRate: "",
  aiFailureRate: "",
  messageFailureRate: "",
  rewardRedemptionRate: "",
};

function statusBadgeClass(status: SimulationRunListItem["status"]): string {
  switch (status) {
    case "COMPLETED":
      return "bg-[#EEF7E8] text-[#639922]";
    case "FAILED":
      return "bg-[#C0392B]/10 text-[#C0392B]";
    case "CANCELLED":
      return "bg-[#F5F6FA] text-[#8891A4]";
    case "RUNNING":
      return "bg-[#EEF0FB] text-[#5C6BC0]";
    default:
      return "bg-[#FDF3E7] text-[#B7791F]";
  }
}

export default function SimulationsPage() {
  const [status, setStatus] = useState<SimulationStatusResponse | null>(null);
  const [runs, setRuns] = useState<SimulationRunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const [statusRes, runsRes] = await Promise.all([
        fetch("/api/proxy/platform/simulations/status"),
        fetch("/api/proxy/platform/simulations"),
      ]);
      setStatus((await readJson(statusRes)) as SimulationStatusResponse);
      setRuns((await readJson(runsRes)) as SimulationRunListItem[]);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "No pudimos cargar las simulaciones.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function createRun(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const body: Record<string, unknown> = { scenario: form.scenario };
      if (form.days.trim()) body.days = Number(form.days);
      if (form.customerCount.trim()) body.customerCount = Number(form.customerCount);
      if (form.seed.trim()) body.seed = Number(form.seed);
      if (form.withAi) body.withAi = true;
      if (form.optimizationMode) body.optimizationMode = form.optimizationMode;
      if (form.checkinComplianceRate.trim())
        body.checkinComplianceRate = Number(form.checkinComplianceRate);
      if (form.aiFailureRate.trim()) body.aiFailureRate = Number(form.aiFailureRate);
      if (form.messageFailureRate.trim())
        body.messageFailureRate = Number(form.messageFailureRate);
      if (form.rewardRedemptionRate.trim())
        body.rewardRedemptionRate = Number(form.rewardRedemptionRate);

      const res = await fetch("/api/proxy/platform/simulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const created = (await readJson(res)) as SimulationRunListItem;
      setForm(EMPTY_FORM);
      setShowForm(false);
      window.location.href = `/platform/simulations/${created.id}`;
    } catch (e) {
      setCreateError(
        e instanceof Error ? e.message : "No pudimos crear la simulación.",
      );
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <span className="inline-flex rounded-full bg-[#EEF0FB] px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[#5C6BC0]">
            Herramienta interna
          </span>
          <h1 className="mt-3 font-display text-[28px] font-bold leading-tight text-[#1A202C]">
            Simulation Center
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#8891A4]">
            Corre escenarios ficticios sobre una base aislada para validar si
            Flikker V2 se comporta bien antes de activar un piloto real. Nunca
            toca datos ni clientes reales.
          </p>
        </div>

        {status?.available ? (
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#5C6BC0] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#4e5db0]"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nueva simulación
          </button>
        ) : null}
      </section>

      {loading ? (
        <div className="flex h-24 items-center justify-center rounded-xl border border-[#E8EAF0] bg-white text-sm text-[#8891A4]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Cargando…
        </div>
      ) : loadError ? (
        <div className="rounded-xl border border-[#C0392B]/20 bg-[#C0392B]/10 p-5 text-sm text-[#C0392B]">
          {loadError}
        </div>
      ) : !status?.available ? (
        <div className="flex items-start gap-3 rounded-xl border border-[#FDF3E7] bg-[#FDF3E7] p-5 text-sm text-[#B7791F]">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">Entorno de simulación no configurado.</p>
            <p className="mt-1">
              {status?.unavailableReason === "DATABASE_NOT_CONFIGURED"
                ? "Falta SIMULATION_DATABASE_URL — nunca se usa la base de datos productiva como reemplazo."
                : "SIMULATION_ENABLED no está en \"true\"."}
            </p>
          </div>
        </div>
      ) : (
        <>
          {showForm ? (
            <section className="rounded-xl border border-[#E8EAF0] bg-white p-5">
              <h2 className="text-base font-bold text-[#1A202C]">
                Nueva simulación
              </h2>
              {createError ? (
                <p className="mt-3 rounded-lg border border-[#C0392B]/20 bg-[#C0392B]/10 px-4 py-3 text-sm text-[#C0392B]">
                  {createError}
                </p>
              ) : null}
              <form onSubmit={(e) => void createRun(e)} className="mt-4 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-sm">
                    <span className="mb-1 block font-semibold text-[#1A202C]">
                      Escenario
                    </span>
                    <select
                      value={form.scenario}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          scenario: e.target.value as SimulationScenario,
                        }))
                      }
                      className="h-10 w-full rounded-lg border border-[#E8EAF0] px-3 text-sm"
                    >
                      {SCENARIOS.map((s) => (
                        <option key={s} value={s}>
                          {SCENARIO_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-sm">
                    <span className="mb-1 block font-semibold text-[#1A202C]">
                      Días (opcional)
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={status.maxDays}
                      placeholder={`hasta ${status.maxDays}`}
                      value={form.days}
                      onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}
                      className="h-10 w-full rounded-lg border border-[#E8EAF0] px-3 text-sm"
                    />
                  </label>

                  <label className="text-sm">
                    <span className="mb-1 block font-semibold text-[#1A202C]">
                      Clientes (opcional)
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={status.maxCustomers}
                      placeholder={`hasta ${status.maxCustomers}`}
                      value={form.customerCount}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, customerCount: e.target.value }))
                      }
                      className="h-10 w-full rounded-lg border border-[#E8EAF0] px-3 text-sm"
                    />
                  </label>

                  <label className="text-sm">
                    <span className="mb-1 block font-semibold text-[#1A202C]">
                      Seed (opcional)
                    </span>
                    <input
                      type="number"
                      placeholder="por defecto del escenario"
                      value={form.seed}
                      onChange={(e) => setForm((f) => ({ ...f, seed: e.target.value }))}
                      className="h-10 w-full rounded-lg border border-[#E8EAF0] px-3 text-sm"
                    />
                  </label>

                  <label className="text-sm">
                    <span className="mb-1 block font-semibold text-[#1A202C]">
                      Modo de optimización
                    </span>
                    <select
                      value={form.optimizationMode}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          optimizationMode: e.target.value as OptimizationMode | "",
                        }))
                      }
                      className="h-10 w-full rounded-lg border border-[#E8EAF0] px-3 text-sm"
                    >
                      <option value="">Por defecto del escenario</option>
                      <option value="OFF">Apagado</option>
                      <option value="ASSISTED">Asistido</option>
                      <option value="AUTOMATIC">Automático</option>
                    </select>
                  </label>

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.withAi}
                      onChange={(e) => setForm((f) => ({ ...f, withAi: e.target.checked }))}
                      className="h-4 w-4"
                    />
                    <span className="font-semibold text-[#1A202C]">
                      Incluir validación de IA (fake, nunca real)
                    </span>
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdvanced((v) => !v)}
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[#5C6BC0]"
                >
                  {showAdvanced ? (
                    <ChevronUp className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  )}
                  Avanzado — inyección de fallas
                </button>

                {showAdvanced ? (
                  <div className="grid gap-4 rounded-lg bg-[#F5F6FA] p-4 sm:grid-cols-3">
                    <label className="text-sm">
                      <span className="mb-1 block font-semibold text-[#1A202C]">
                        % check-in (0–1)
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={form.checkinComplianceRate}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, checkinComplianceRate: e.target.value }))
                        }
                        className="h-10 w-full rounded-lg border border-[#E8EAF0] px-3 text-sm"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block font-semibold text-[#1A202C]">
                        % falla IA (0–1)
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={form.aiFailureRate}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, aiFailureRate: e.target.value }))
                        }
                        className="h-10 w-full rounded-lg border border-[#E8EAF0] px-3 text-sm"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block font-semibold text-[#1A202C]">
                        % falla WhatsApp (0–1)
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={form.messageFailureRate}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, messageFailureRate: e.target.value }))
                        }
                        className="h-10 w-full rounded-lg border border-[#E8EAF0] px-3 text-sm"
                      />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block font-semibold text-[#1A202C]">
                        % redención de recompensa (0–1)
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={form.rewardRedemptionRate}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, rewardRedemptionRate: e.target.value }))
                        }
                        className="h-10 w-full rounded-lg border border-[#E8EAF0] px-3 text-sm"
                      />
                    </label>
                  </div>
                ) : null}

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={creating}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#5C6BC0] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#4e5db0] disabled:opacity-60"
                  >
                    {creating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FlaskConical className="h-4 w-4" aria-hidden="true" />
                    )}
                    {creating ? "Creando…" : "Correr simulación"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="inline-flex h-10 items-center rounded-lg border border-[#E8EAF0] bg-white px-4 text-sm font-semibold text-[#1A202C] hover:bg-[#F5F6FA]"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          <section className="overflow-x-auto rounded-xl border border-[#E8EAF0] bg-white">
            {runs.length === 0 ? (
              <p className="p-6 text-sm text-[#8891A4]">
                Todavía no corriste ninguna simulación.
              </p>
            ) : (
              <table className="flk-table w-full min-w-[820px] text-left text-sm">
                <thead>
                  <tr>
                    <th>Escenario</th>
                    <th>Estado</th>
                    <th>Progreso</th>
                    <th>Días</th>
                    <th>Clientes</th>
                    <th>Seed</th>
                    <th>Creada</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td>
                        <Link
                          href={`/platform/simulations/${run.id}`}
                          className="font-semibold text-[#5C6BC0] hover:underline"
                        >
                          {SCENARIO_LABEL[run.scenario]}
                        </Link>
                      </td>
                      <td>
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusBadgeClass(run.status)}`}
                        >
                          {STATUS_LABEL[run.status]}
                        </span>
                      </td>
                      <td>
                        {run.status === "RUNNING"
                          ? `${run.progress}% · día ${run.currentVirtualDay}/${run.days}`
                          : run.status === "COMPLETED" || run.status === "FAILED"
                            ? "100%"
                            : "—"}
                      </td>
                      <td>{run.days}</td>
                      <td>{run.customerCount}</td>
                      <td>{run.seed}</td>
                      <td>{formatDateTime(run.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}
    </div>
  );
}
