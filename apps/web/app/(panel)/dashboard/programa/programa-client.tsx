"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, QrCode, Stamp, Target } from "lucide-react";
import PageHeader from "@/components/ui/page-header";
import { useIsCheckinV2 } from "../../experience-context";
import { useIsOwnerOrAdmin } from "../../role-context";
import ProgramSummaryTab from "./program-summary-tab";
import ProgramConfiguracionTab, {
  type ConfigSection,
  isConfigSection,
} from "./program-configuracion-tab";
import type {
  LoyaltyAppearance,
  LoyaltyProgramOverview,
  ProgramBenefit,
  ProgramHistoryItem,
} from "./types";

/**
 * Programa = "todo lo que este negocio ofrece para incentivar que sus
 * clientes vuelvan". Dos herramientas independientes, no una sola:
 * Beneficios y una tarjeta de sellos OPCIONAL.
 *
 * Nueva regla de producto (simplificación de UX, pedido explícito):
 * Programa responde QUÉ ofrece el negocio. Notificaciones responde CUÁNDO
 * Flikker contacta. Nada de eso se duplica entre pantallas.
 *
 * Navegación: solo dos pestañas — Resumen (estado + actividad) y
 * Configuración (todo lo editable, agrupado en una subnavegación lateral:
 * Tarjeta digital, Página de inscripción, Términos y condiciones,
 * Incentivos, Premios — ver `program-configuracion-tab.tsx` para el porqué
 * de cada una). El Historial no desaparece, se ve desde Resumen ("Ver toda la
 * actividad"), y ProgramAuditEvent sigue siendo la misma fuente.
 */
type Tab = "resumen" | "configuracion";

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

/**
 * `?tab=`/`&section=` para linkear directo a una sección — ej.
 * `/dashboard/programa?tab=configuracion&section=beneficios` desde
 * Notificaciones o Inicio. `useSearchParams` pide un límite de Suspense.
 *
 * Compatibilidad: los links viejos (`?tab=beneficios`, `?tab=sellos`,
 * `?tab=historial`) de la estructura anterior se traducen acá — ningún link
 * que ya esté circulando (guardado, compartido) queda apuntando a una
 * pestaña que dejó de existir.
 */
export default function ProgramaClient() {
  return (
    <Suspense fallback={null}>
      <ProgramaClientContent />
    </Suspense>
  );
}

function resolveInitialTab(rawTab: string | null): Tab {
  if (rawTab === "configuracion") return "configuracion";
  if (rawTab === "beneficios" || rawTab === "sellos") return "configuracion";
  return "resumen";
}

/**
 * Compat con los `?section=` de la estructura anterior (sellos/diseno/
 * beneficios/feedback/bienvenida) — ningún link que ya esté circulando
 * (guardado, compartido desde Notificaciones/Inicio) queda apuntando a una
 * sección que dejó de existir.
 */
function resolveInitialSection(
  rawTab: string | null,
  rawSection: string | null,
): ConfigSection {
  if (isConfigSection(rawSection)) return rawSection;
  if (rawSection === "sellos" || rawSection === "diseno" || rawSection === "feedback") {
    return "tarjeta";
  }
  if (rawSection === "beneficios" || rawSection === "bienvenida") return "premios";
  if (rawTab === "beneficios") return "premios";
  if (rawTab === "sellos") return "tarjeta";
  return "tarjeta";
}

function ProgramaClientContent() {
  const isCheckinV2 = useIsCheckinV2();
  // Espeja `@Roles(OWNER, ADMIN)` de `loyalty-program.controller.ts` y
  // `benefits.controller.ts` — las dos superficies que Programa mutila. Antes
  // usaba `useCanMutate()` (deja pasar a OPERATOR), que mostraba controles
  // habilitados que el backend iba a rechazar con 403. El nombre de la
  // variable queda `canMutate` porque así se llama la prop en cada sección.
  const canMutate = useIsOwnerOrAdmin();
  const searchParams = useSearchParams();
  const initialTab = resolveInitialTab(searchParams.get("tab"));
  const initialSection = resolveInitialSection(
    searchParams.get("tab"),
    searchParams.get("section"),
  );

  const [overview, setOverview] = useState<LoyaltyProgramOverview | null>(null);
  const [benefits, setBenefits] = useState<ProgramBenefit[]>([]);
  const [appearance, setAppearance] = useState<LoyaltyAppearance | null>(null);
  const [history, setHistory] = useState<ProgramHistoryItem[]>([]);
  const [businessName, setBusinessName] = useState("");
  const [tab, setTab] = useState<Tab>(initialTab);
  const [configSection, setConfigSection] =
    useState<ConfigSection>(initialSection);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [overviewRes, benefitsRes, brandRes, historyRes] = await Promise.all([
        fetch("/api/proxy/loyalty-program/overview"),
        fetch("/api/proxy/benefits"),
        fetch("/api/proxy/businesses/current/brand"),
        fetch("/api/proxy/loyalty-program/history"),
      ]);
      const [overviewData, benefitsData, brandData, historyData] =
        await Promise.all([
          readJson(overviewRes),
          readJson(benefitsRes),
          readJson(brandRes),
          readJson(historyRes),
        ]);
      setOverview(overviewData as LoyaltyProgramOverview);
      setBenefits(benefitsData as ProgramBenefit[]);
      const brand = brandData as LoyaltyAppearance & { name?: string };
      setAppearance(brand);
      setBusinessName(brand.name ?? "");
      setHistory(historyData as ProgramHistoryItem[]);
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

  async function saveBrand(patch: Record<string, unknown>) {
    const res = await fetch("/api/proxy/businesses/current/brand", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await readJson(res);
    await load();
  }

  async function toggleStampsCard(enabled: boolean) {
    const res = await fetch("/api/proxy/loyalty-program/stamps-card", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    await readJson(res);
  }

  /** Capacidad independiente de sellos — ver `RetentionSettings.benefitsEnabled`. */
  async function toggleBenefitsCatalog(enabled: boolean) {
    const res = await fetch("/api/proxy/loyalty-program/benefits-enabled", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    await readJson(res);
  }

  async function saveStampsCardConfig(patch: {
    stampsRequired: number;
    rewardBenefitId?: string;
    rewardTitle?: string;
    rewardType?: string;
    feedbackBonusEnabled?: boolean;
  }) {
    const res = await fetch("/api/proxy/loyalty-program/stamps-card/config", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    await readJson(res);
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

  // Términos y condiciones — auditado: no hay campo de programa a nivel
  // negocio para esto, el que YA existe (y el que YA se muestra al cliente
  // en la landing de check-in) es `Benefit.terms`. Mismo PATCH que el resto
  // de la edición de un beneficio, sin endpoint nuevo.
  async function saveBenefitTerms(benefitId: string, terms: string) {
    const res = await fetch(`/api/proxy/benefits/${benefitId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ terms }),
    });
    await readJson(res);
    await load();
  }

  function goToConfig(section: ConfigSection) {
    setTab("configuracion");
    setConfigSection(section);
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
            El programa de beneficios y sellos funciona con el check-in
            digital. Escribinos para activarlo en tu negocio.
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

  return (
    <div className="mx-auto max-w-5xl space-y-5 xl:max-w-6xl">
      <PageHeader
        title="Programa"
        subtitle="Todo lo que tu negocio ofrece para que tus clientes vuelvan."
        actions={
          <Link
            href="/dashboard/qr"
            className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[#5C6BC0] px-4 text-sm font-semibold text-white hover:bg-[#4f5eb0]"
          >
            <QrCode className="h-4 w-4" aria-hidden="true" />
            Invitar clientes
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E8EAF0] bg-white px-3 py-1.5 text-xs font-semibold text-[#4A56A6]">
          <Stamp className="h-3.5 w-3.5" aria-hidden="true" />
          Sellos por visita
        </span>
        {overview.stampsRequired ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#E8EAF0] bg-white px-3 py-1.5 text-xs font-semibold text-[#4A56A6]">
            <Target className="h-3.5 w-3.5" aria-hidden="true" />
            Meta {overview.stampsRequired} sellos
          </span>
        ) : null}
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
            overview.enabled
              ? "bg-[#EAF6EE] text-[#1D9E75]"
              : "bg-[#F0F1F6] text-[#8891A4]"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              overview.enabled ? "bg-[#1D9E75]" : "bg-[#B0B8C9]"
            }`}
            aria-hidden="true"
          />
          {overview.enabled ? "Activo" : "Inactivo"}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
            overview.benefitsEnabled
              ? "bg-[#EAF6EE] text-[#1D9E75]"
              : "bg-[#F0F1F6] text-[#8891A4]"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              overview.benefitsEnabled ? "bg-[#1D9E75]" : "bg-[#B0B8C9]"
            }`}
            aria-hidden="true"
          />
          Beneficios {overview.benefitsEnabled ? "visibles" : "ocultos"}
        </span>
      </div>

      <div className="flex w-fit overflow-hidden rounded-[10px] border border-[#E8EAF0] bg-white text-sm font-semibold">
        <button
          type="button"
          onClick={() => setTab("resumen")}
          className={`px-4 py-2 transition-colors ${
            tab === "resumen"
              ? "bg-[#5C6BC0] text-white"
              : "bg-white text-[#8891A4] hover:bg-[#F5F6FA] hover:text-[#1A202C]"
          }`}
        >
          Resumen
        </button>
        <button
          type="button"
          onClick={() => setTab("configuracion")}
          className={`border-l border-[#E8EAF0] px-4 py-2 transition-colors ${
            tab === "configuracion"
              ? "bg-[#5C6BC0] text-white"
              : "bg-white text-[#8891A4] hover:bg-[#F5F6FA] hover:text-[#1A202C]"
          }`}
        >
          Configuración
        </button>
      </div>

      {tab === "resumen" ? (
        <ProgramSummaryTab
          overview={overview}
          history={history}
          onGoToConfig={goToConfig}
        />
      ) : null}

      {tab === "configuracion" ? (
        <ProgramConfiguracionTab
          section={configSection}
          onSectionChange={setConfigSection}
          overview={overview}
          benefits={benefits}
          appearance={appearance}
          businessName={businessName}
          canMutate={canMutate}
          onToggleStamps={toggleStampsCard}
          onSaveStampsConfig={saveStampsCardConfig}
          onSaveDesign={saveBrand}
          onCreateBenefit={createBenefit}
          onDeleteBenefit={deleteBenefit}
          onSetBenefitUse={setBenefitUse}
          onToggleBenefits={toggleBenefitsCatalog}
          onSaveBenefitTerms={saveBenefitTerms}
          onReload={load}
        />
      ) : null}
    </div>
  );
}
