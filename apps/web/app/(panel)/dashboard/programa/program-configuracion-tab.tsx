"use client";

import { Gift, Heart, Palette, Stamp } from "lucide-react";
import ProgramStampsSection from "./program-stamps-section";
import ProgramDesignTab from "./program-design-tab";
import ProgramBenefitsTab from "./program-benefits-tab";
import ProgramFeedbackBonusSection from "./program-feedback-bonus-section";
import ProgramWelcomeGiftSection from "./program-welcome-gift-section";
import type { LoyaltyAppearance, LoyaltyProgramOverview, ProgramBenefit } from "./types";

/**
 * "Configuración" — layout de subnavegación lateral + panel principal
 * (inspirado estructuralmente en referencias del estilo Fiddelik, con el
 * design system de Flikker, sin copiar branding ajeno).
 *
 * Cinco secciones, cada una dueña de UNA sola decisión — nunca datos
 * generales del negocio (eso sigue viviendo en Configuración del panel, no
 * acá):
 *  1. Tarjeta de sellos — sellos necesarios + LA recompensa que la completa.
 *  2. Diseño de tarjeta — cómo se ve, con preview real.
 *  3. Beneficios — el catálogo completo, único lugar donde se administra.
 *  4. Bonus por feedback — el sello extra por responder feedback privado.
 *  5. Regalo de bienvenida — qué se entrega en la primera visita.
 */
export type ConfigSection =
  | "sellos"
  | "diseno"
  | "beneficios"
  | "feedback"
  | "bienvenida";

const SECTIONS: { key: ConfigSection; label: string; icon: typeof Stamp }[] = [
  { key: "sellos", label: "Tarjeta de sellos", icon: Stamp },
  { key: "diseno", label: "Diseño de tarjeta", icon: Palette },
  { key: "beneficios", label: "Beneficios", icon: Gift },
  { key: "feedback", label: "Bonus por feedback", icon: Heart },
  { key: "bienvenida", label: "Regalo de bienvenida", icon: Gift },
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
  onReload: () => Promise<void>;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
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
              className={`flex shrink-0 items-center gap-2.5 rounded-[10px] px-3.5 py-2.5 text-left text-sm font-semibold transition-colors lg:shrink lg:w-full ${
                active
                  ? "bg-[#EEF0FB] text-[#4A56A6]"
                  : "text-[#7B8295] hover:bg-[#F5F6FA] hover:text-[#1A202C]"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="whitespace-nowrap lg:whitespace-normal">
                {option.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* ── Panel principal ──────────────────────────────────────────── */}
      <div className="min-w-0">
        {section === "sellos" ? (
          <ProgramStampsSection
            overview={overview}
            benefits={benefits}
            canMutate={canMutate}
            onToggle={onToggleStamps}
            onSaveConfig={onSaveStampsConfig}
            onReload={onReload}
          />
        ) : null}

        {section === "diseno" ? (
          <ProgramDesignTab
            appearance={appearance}
            businessName={businessName}
            rewardName={overview.reward?.name ?? "Tu recompensa"}
            stampsRequired={overview.stampsRequired ?? 5}
            canMutate={canMutate}
            onSave={onSaveDesign}
          />
        ) : null}

        {section === "beneficios" ? (
          <ProgramBenefitsTab
            benefits={benefits}
            welcomeBenefitId={overview.welcomeGift?.benefitId ?? null}
            canMutate={canMutate}
            onCreate={onCreateBenefit}
            onDelete={onDeleteBenefit}
            onSetUse={onSetBenefitUse}
            onReload={onReload}
          />
        ) : null}

        {section === "feedback" ? (
          <ProgramFeedbackBonusSection
            overview={overview}
            canMutate={canMutate}
            onSaveConfig={onSaveStampsConfig}
            onReload={onReload}
          />
        ) : null}

        {section === "bienvenida" ? (
          <ProgramWelcomeGiftSection
            benefits={benefits}
            welcomeGift={overview.welcomeGift}
            canMutate={canMutate}
            onSetUse={onSetBenefitUse}
            onReload={onReload}
          />
        ) : null}
      </div>
    </div>
  );
}
