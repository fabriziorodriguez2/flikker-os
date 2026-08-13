"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import { useIsCheckinV2 } from "../../experience-context";
import { useCanMutate } from "../../role-context";
import ProgramSummaryTab from "./program-summary-tab";
import ProgramConfigTab from "./program-config-tab";
import ProgramBenefitsTab from "./program-benefits-tab";
import ProgramDesignTab from "./program-design-tab";
import type {
  LoyaltyAppearance,
  LoyaltyProgramOverview,
  ProgramBenefit,
} from "./types";

type Tab = "resumen" | "configuracion" | "beneficios" | "diseno";

const TABS: { key: Tab; label: string }[] = [
  { key: "resumen", label: "Resumen" },
  { key: "configuracion", label: "Configuración" },
  { key: "beneficios", label: "Beneficios" },
  { key: "diseno", label: "Diseño" },
];

async function readJson(res: Response) {
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "message" in data
        ? String((data as { message: unknown }).message)
        : "Error inesperado";
    throw new Error(message);
  }
  return data;
}

export default function ProgramaClient() {
  const isCheckinV2 = useIsCheckinV2();
  const canMutate = useCanMutate();

  const [overview, setOverview] = useState<LoyaltyProgramOverview | null>(null);
  const [benefits, setBenefits] = useState<ProgramBenefit[]>([]);
  const [appearance, setAppearance] = useState<LoyaltyAppearance | null>(null);
  const [businessName, setBusinessName] = useState("");
  const [tab, setTab] = useState<Tab>("resumen");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [overviewRes, benefitsRes, brandRes] = await Promise.all([
        fetch("/api/proxy/loyalty-program/overview"),
        fetch("/api/proxy/benefits"),
        fetch("/api/proxy/businesses/current/brand"),
      ]);
      const [overviewData, benefitsData, brandData] = await Promise.all([
        readJson(overviewRes),
        readJson(benefitsRes),
        readJson(brandRes),
      ]);
      setOverview(overviewData as LoyaltyProgramOverview);
      setBenefits(benefitsData as ProgramBenefit[]);
      const brand = brandData as LoyaltyAppearance & { name?: string };
      setAppearance(brand);
      setBusinessName(brand.name ?? "");
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : "No pudimos cargar el programa.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isCheckinV2) void load();
    else setLoading(false);
  }, [isCheckinV2, load]);

  async function saveSettings(patch: Record<string, unknown>) {
    const res = await fetch("/api/proxy/retention-v2/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await readJson(res);
  }

  async function saveBrand(patch: Record<string, unknown>) {
    const res = await fetch("/api/proxy/businesses/current/brand", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await readJson(res);
    await load();
  }

  /**
   * Los tres usos escriben en lugares distintos a propósito — marcar uno
   * nunca toca a los otros dos.
   */
  async function setBenefitUse(
    benefitId: string,
    use: "rewardCard" | "welcomeGift" | "reactivation",
    value: boolean,
  ) {
    if (use === "welcomeGift") {
      // Endpoint propio, NO `activate`: el regalo de bienvenida se entrega
      // una sola vez en el registro, mientras que `active` significa
      // "visible en cada check-in". Son cosas distintas.
      const res = value
        ? await fetch(`/api/proxy/benefits/${benefitId}/welcome-gift`, {
            method: "POST",
          })
        : await fetch("/api/proxy/benefits/welcome-gift/current", {
            method: "DELETE",
          });
      if (!res.ok && res.status !== 204) await readJson(res);
      return;
    }
    const body =
      use === "rewardCard"
        ? { rewardGoalEnabled: value }
        : { recoveryEnabled: value };
    const res = await fetch(`/api/proxy/benefits/${benefitId}/retention-bridge`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await readJson(res);
  }

  async function createBenefit(payload: {
    type: string;
    title: string;
    description?: string;
  }) {
    const res = await fetch("/api/proxy/benefits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await readJson(res);
  }

  async function deleteBenefit(benefitId: string) {
    const res = await fetch(`/api/proxy/benefits/${benefitId}`, {
      method: "DELETE",
    });
    if (!res.ok && res.status !== 204) await readJson(res);
  }

  // LEGACY: el endpoint responde 404 por CheckinV2Guard. Se muestra un
  // estado controlado, nunca una pantalla rota.
  if (!isCheckinV2) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader
          title="Programa"
          subtitle="Esta función todavía no está disponible para tu negocio."
        />
        <div className="rounded-[16px] border border-[#E8EAF0] bg-white p-6">
          <p className="text-sm text-[#8891A4]">
            El programa de sellos funciona con el check-in digital. Escribinos
            para activarlo en tu negocio.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl">
        <div className="flex h-40 items-center justify-center text-[#8891A4]">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando…
        </div>
      </div>
    );
  }

  if (loadError || !overview || !appearance) {
    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <PageHeader title="Programa" />
        <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-[#C0392B]">
          {loadError ?? "No pudimos cargar el programa."}
        </div>
      </div>
    );
  }

  const stampsRequired = overview.stampsRequired ?? 5;
  const rewardName = overview.reward?.name ?? "Tu recompensa";

  return (
    <div className="mx-auto max-w-5xl space-y-5 xl:max-w-6xl">
      <PageHeader
        title="Programa"
        subtitle="Tus clientes juntan sellos en cada visita y se llevan una recompensa."
        actions={
          <span
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
              overview.enabled
                ? "bg-[#EAF6EE] text-[#1D9E75]"
                : "bg-[#F5F6FA] text-[#8891A4]"
            }`}
          >
            {overview.enabled ? "Activo" : "Inactivo"}
          </span>
        }
      />

      {overview.reward && overview.stampsRequired ? (
        <p className="rounded-[14px] border border-[#5C6BC0]/20 bg-[#EEF0FB] px-5 py-4 text-base font-bold text-[#1A202C]">
          {overview.stampsRequired} sellos → {overview.reward.name}
        </p>
      ) : null}

      <div className="flex w-fit overflow-hidden rounded-[10px] border border-[#E8EAF0] bg-white text-sm font-semibold">
        {TABS.map((option, i) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setTab(option.key)}
            className={`px-4 py-2 transition-colors ${
              i > 0 ? "border-l border-[#E8EAF0]" : ""
            } ${
              tab === option.key
                ? "bg-[#5C6BC0] text-white"
                : "bg-white text-[#8891A4] hover:bg-[#F5F6FA] hover:text-[#1A202C]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {tab === "resumen" ? <ProgramSummaryTab overview={overview} /> : null}

      {tab === "configuracion" ? (
        <ProgramConfigTab
          overview={overview}
          benefits={benefits}
          canMutate={canMutate}
          onSaveSettings={saveSettings}
          onSetBenefitUse={setBenefitUse}
          onReload={load}
        />
      ) : null}

      {tab === "beneficios" ? (
        <ProgramBenefitsTab
          benefits={benefits}
          welcomeBenefitId={overview.welcomeGift?.benefitId ?? null}
          canMutate={canMutate}
          onCreate={createBenefit}
          onDelete={deleteBenefit}
          onSetUse={setBenefitUse}
          onReload={load}
        />
      ) : null}

      {tab === "diseno" ? (
        <ProgramDesignTab
          appearance={appearance}
          businessName={businessName}
          rewardName={rewardName}
          stampsRequired={stampsRequired}
          canMutate={canMutate}
          onSave={saveBrand}
        />
      ) : null}
    </div>
  );
}
