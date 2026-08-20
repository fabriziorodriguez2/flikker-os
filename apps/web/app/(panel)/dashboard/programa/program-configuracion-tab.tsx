"use client";

import {
  ChevronRight,
  CreditCard,
  FileText,
  Gift,
  Percent,
  UserPlus,
} from "lucide-react";
import ProgramCardSection from "./program-card-section";
import ProgramRegistrationSection from "./program-registration-section";
import ProgramTermsSection from "./program-terms-section";
import ProgramIncentivesSection from "./program-incentives-section";
import ProgramBenefitsTab from "./program-benefits-tab";
import type { LoyaltyAppearance, LoyaltyProgramOverview, ProgramBenefit } from "./types";

/**
 * "Configuración" — layout de subnavegación lateral + panel principal
 * (inspirado estructuralmente en referencias del estilo Fiddelik, con el
 * design system de Flikker, sin copiar branding ajeno).
 *
 * Cinco secciones, la IA acordada explícitamente para esta pantalla:
 *  1. Tarjeta digital — sellos, recompensa, bonus por feedback y diseño con
 *     preview en vivo. Todo "cómo es mi tarjeta" en un solo lugar.
 *  2. Página de inscripción — el encabezado de la landing pública de check-in.
 *  3. Términos y condiciones — las bases legales del beneficio elegido.
 *  4. Incentivos — reglas especiales/bonus además del programa base (%/$
 *     time-boxed + presupuesto mensual de reactivación automática).
 *  5. Beneficios (antes "Premios", mismo `key` interno por compatibilidad
 *     con deep-links viejos) — el catálogo completo de beneficios, único
 *     lugar donde se administra (incluye elegir regalo de bienvenida y
 *     recompensa de tarjeta por ítem — no hace falta una sección aparte).
 */
export type ConfigSection =
  | "tarjeta"
  | "inscripcion"
  | "terminos"
  | "incentivos"
  | "premios";

const SECTIONS: {
  key: ConfigSection;
  label: string;
  description: string;
  icon: typeof CreditCard;
}[] = [
  {
    key: "tarjeta",
    label: "Tarjeta digital",
    description: "Diseño y colores de la tarjeta",
    icon: CreditCard,
  },
  {
    key: "inscripcion",
    label: "Página de inscripción",
    description: "Apariencia del formulario",
    icon: UserPlus,
  },
  {
    key: "terminos",
    label: "Términos y condiciones",
    description: "Bases legales del programa",
    icon: FileText,
  },
  {
    key: "incentivos",
    label: "Incentivos",
    description: "Reglas y presupuesto automático",
    icon: Percent,
  },
  {
    key: "premios",
    label: "Beneficios",
    description: "Catálogo de recompensas y ofertas",
    icon: Gift,
  },
];

export function isConfigSection(value: string | null): value is ConfigSection {
  return value !== null && SECTIONS.some((s) => s.key === value);
}

export default function ProgramConfiguracionTab({
  section,
  onSectionChange,
  overview,
  benefits,
  appearance,
  businessName,
  canMutate,
  onToggleStamps,
  onSaveStampsConfig,
  onSaveDesign,
  onCreateBenefit,
  onDeleteBenefit,
  onSetBenefitUse,
  onSetBenefitActive,
  onToggleBenefits,
  onSaveBenefitTerms,
  onReload,
}: {
  section: ConfigSection;
  onSectionChange: (section: ConfigSection) => void;
  overview: LoyaltyProgramOverview;
  benefits: ProgramBenefit[];
  appearance: LoyaltyAppearance;
  businessName: string;
  canMutate: boolean;
  onToggleStamps: (enabled: boolean) => Promise<void>;
  onSaveStampsConfig: (patch: {
    stampsRequired: number;
    rewardBenefitId?: string;
    rewardTitle?: string;
    rewardType?: string;
    feedbackBonusEnabled?: boolean;
  }) => Promise<void>;
  onSaveDesign: (patch: Record<string, unknown>) => Promise<void>;
  onCreateBenefit: (payload: {
    type: string;
    title: string;
    description?: string;
  }) => Promise<void>;
  onDeleteBenefit: (benefitId: string) => Promise<void>;
  onSetBenefitUse: (
    benefitId: string,
    use: "rewardCard" | "welcomeGift" | "reactivation",
    value: boolean,
  ) => Promise<void>;
  onSetBenefitActive: (benefitId: string, active: boolean) => Promise<void>;
  onToggleBenefits: (enabled: boolean) => Promise<void>;
  onSaveBenefitTerms: (benefitId: string, terms: string) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
      {/* ── Subnavegación ─────────────────────────────────────────────── */}
      <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0">
        {SECTIONS.map((option) => {
          const Icon = option.icon;
          const active = section === option.key;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onSectionChange(option.key)}
              className={`flex shrink-0 items-center gap-2.5 rounded-[10px] px-3.5 py-2.5 text-left transition-colors lg:shrink lg:w-full ${
                active
                  ? "bg-[#EEF0FB] text-[#4A56A6]"
                  : "text-[#7B8295] hover:bg-[#F5F6FA] hover:text-[#1A202C]"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block whitespace-nowrap text-sm font-semibold lg:whitespace-normal">
                  {option.label}
                </span>
                <span
                  className={`block truncate text-xs font-normal lg:whitespace-normal ${
                    active ? "text-[#7C86C9]" : "text-[#A6ACBC]"
                  }`}
                >
                  {option.description}
                </span>
              </span>
              {active ? (
                <ChevronRight
                  className="hidden h-4 w-4 shrink-0 lg:block"
                  aria-hidden="true"
                />
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* ── Panel principal ──────────────────────────────────────────── */}
      <div className="min-w-0">
        {section === "tarjeta" ? (
          <ProgramCardSection
            overview={overview}
            benefits={benefits}
            appearance={appearance}
            businessName={businessName}
            canMutate={canMutate}
            onToggle={onToggleStamps}
            onSaveConfig={onSaveStampsConfig}
            onSaveDesign={onSaveDesign}
            onReload={onReload}
            onGoToPremios={() => onSectionChange("premios")}
          />
        ) : null}

        {section === "inscripcion" ? (
          <ProgramRegistrationSection
            appearance={appearance}
            businessName={businessName}
            canMutate={canMutate}
            onSave={onSaveDesign}
          />
        ) : null}

        {section === "terminos" ? (
          <ProgramTermsSection
            overview={overview}
            benefits={benefits}
            canMutate={canMutate}
            onSave={onSaveBenefitTerms}
          />
        ) : null}

        {section === "incentivos" ? (
          <ProgramIncentivesSection canMutate={canMutate} />
        ) : null}

        {section === "premios" ? (
          <ProgramBenefitsTab
            benefits={benefits}
            welcomeBenefitId={overview.welcomeGift?.benefitId ?? null}
            canMutate={canMutate}
            benefitsEnabled={overview.benefitsEnabled}
            trialExpired={overview.plan.benefitsTrialExpired}
            onCreate={onCreateBenefit}
            onDelete={onDeleteBenefit}
            onSetUse={onSetBenefitUse}
            onSetActive={onSetBenefitActive}
            onToggleBenefits={onToggleBenefits}
            onReload={onReload}
          />
        ) : null}
      </div>
    </div>
  );
}
