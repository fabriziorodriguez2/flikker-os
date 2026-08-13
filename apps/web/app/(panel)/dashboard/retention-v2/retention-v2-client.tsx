"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import { useCanMutate } from "../../role-context";
import { useIsCheckinV2 } from "../../experience-context";
import SettingsSection from "./settings-section";
import AdvancedSettingsSection from "./advanced-settings-section";
import PilotSummarySection from "./pilot-summary-section";
import RewardGoalsSettingsSection from "./reward-goals-settings-section";
import AiSettingsSection from "./ai-settings-section";
import OptimizationSettingsSection from "./optimization-settings-section";
import IncentivesSection from "./incentives-section";
import ExperimentsSection from "./experiments-section";
import DryRunPanel from "./dry-run-panel";
import ResultsSection from "./results-section";
import type {
  DryRunReport,
  RetentionExperiment,
  RetentionIncentive,
  RetentionSettingsView,
} from "./types";

async function readJson(res: Response) {
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(data.message) ? data.message.join(", ") : data.message;
    throw new Error(message ?? "Algo salió mal.");
  }
  return res.json();
}

export default function RetentionV2Client() {
  const canMutate = useCanMutate();
  const isCheckinV2 = useIsCheckinV2();

  const [settings, setSettings] = useState<RetentionSettingsView | null>(null);
  const [incentives, setIncentives] = useState<RetentionIncentive[]>([]);
  const [experiments, setExperiments] = useState<RetentionExperiment[]>([]);
  const [dryRunReport, setDryRunReport] = useState<DryRunReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Piloto V2 — Retención principal queda ultra simple; todo lo técnico
  // (experimentos, optimización, ticket/margen/límites, incentivos) vive
  // colapsado acá y se abre solo si el dueño lo busca.
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const [settingsRes, incentivesRes, experimentsRes] = await Promise.all([
        fetch("/api/proxy/retention-v2/settings"),
        fetch("/api/proxy/retention-v2/incentives"),
        fetch("/api/proxy/retention-v2/experiments"),
      ]);
      const [settingsData, incentivesData, experimentsData] = await Promise.all([
        readJson(settingsRes) as Promise<RetentionSettingsView>,
        readJson(incentivesRes) as Promise<RetentionIncentive[]>,
        readJson(experimentsRes) as Promise<RetentionExperiment[]>,
      ]);
      setSettings(settingsData);
      setIncentives(incentivesData);
      setExperiments(experimentsData);

      if (settingsData.dryRunEnabled) {
        const reportRes = await fetch("/api/proxy/retention-v2/dry-run/report");
        if (reportRes.ok) {
          setDryRunReport((await reportRes.json()) as DryRunReport);
        }
      } else {
        setDryRunReport(null);
      }
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "No pudimos cargar Retención.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isCheckinV2) void load();
    else setLoading(false);
  }, [isCheckinV2]);

  async function saveSettings(patch: Record<string, unknown>) {
    const res = await fetch("/api/proxy/retention-v2/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = (await readJson(res)) as RetentionSettingsView;
    setSettings(data);
    if (data.dryRunEnabled) {
      const reportRes = await fetch("/api/proxy/retention-v2/dry-run/report");
      if (reportRes.ok) setDryRunReport((await reportRes.json()) as DryRunReport);
    } else {
      setDryRunReport(null);
    }
  }

  async function updateIncentive(id: string, payload: Record<string, unknown>) {
    const res = await fetch(`/api/proxy/retention-v2/incentives/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await readJson(res);
    await load();
  }

  async function createExperiment(payload: { name: string; objective: string }) {
    const res = await fetch("/api/proxy/retention-v2/experiments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    // Piloto V2 — devuelve el experimento creado (antes se descartaba) para
    // que la plantilla rápida de dos brazos pueda encadenar addVariant sin
    // esperar el refetch completo de `load()`.
    const created = (await readJson(res)) as RetentionExperiment;
    await load();
    return created;
  }

  async function addVariant(experimentId: string, payload: Record<string, unknown>) {
    const res = await fetch(`/api/proxy/retention-v2/experiments/${experimentId}/variants`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await readJson(res);
    await load();
  }

  async function runLifecycle(experimentId: string, action: "start" | "pause" | "finish") {
    const res = await fetch(`/api/proxy/retention-v2/experiments/${experimentId}/${action}`, {
      method: "POST",
    });
    await readJson(res);
    await load();
  }

  if (!isCheckinV2) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Retención"
          subtitle="Esta función solo está disponible para negocios en Check-in V2."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Retención"
        subtitle="Configurá cuándo y cómo Flikker contacta automáticamente a los clientes que se están alejando."
      />

      {loading ? (
        <div className="flex h-32 items-center justify-center text-sm text-[#8891A4]">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Cargando…
        </div>
      ) : loadError ? (
        <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
          {loadError}
        </div>
      ) : settings ? (
        <>
          <PilotSummarySection
            dryRunEnabled={settings.dryRunEnabled}
            dryRunReport={dryRunReport}
          />

          <SettingsSection settings={settings} canMutate={canMutate} onSave={saveSettings} />

          <RewardGoalsSettingsSection
            settings={settings}
            incentives={incentives}
            canMutate={canMutate}
            onSaveSettings={saveSettings}
            onToggleIncentiveEligible={(id, value) =>
              updateIncentive(id, { rewardGoalEligible: value })
            }
          />

          <DryRunPanel
            report={dryRunReport}
            dryRunEnabled={settings.dryRunEnabled}
          />

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
            Configuración avanzada
          </button>

          {showAdvanced ? (
            <div className="space-y-6">
              <AdvancedSettingsSection
                settings={settings}
                canMutate={canMutate}
                onSave={saveSettings}
              />

              <AiSettingsSection
                settings={settings}
                canMutate={canMutate}
                onSaveSettings={saveSettings}
              />

              <OptimizationSettingsSection
                settings={settings}
                canMutate={canMutate}
                onSaveSettings={saveSettings}
              />

              <IncentivesSection
                incentives={incentives}
                canMutate={canMutate}
                onUpdate={updateIncentive}
              />

              <ExperimentsSection
                experiments={experiments}
                incentives={incentives}
                canMutate={canMutate}
                onCreate={createExperiment}
                onAddVariant={addVariant}
                onLifecycle={runLifecycle}
              />

              <ResultsSection canMutate={canMutate} />
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
