"use client";

import ProgramStampsSection from "./program-stamps-section";
import ProgramFeedbackBonusSection from "./program-feedback-bonus-section";
import ProgramDesignTab from "./program-design-tab";
import type { LoyaltyAppearance, LoyaltyProgramOverview, ProgramBenefit } from "./types";

/**
 * "Tarjeta digital" — todo lo que define la tarjeta de sellos en un solo
 * lugar: si está activa, cuántos sellos pide, qué recompensa entrega, el
 * bonus por feedback, y cómo se ve (con preview en vivo). Antes eran tres
 * secciones de sub-nav separadas (Tarjeta de sellos / Bonus por feedback /
 * Diseño) — se agrupan acá porque las tres son la MISMA decisión de producto
 * ("cómo es mi tarjeta"), no tres independientes.
 *
 * Solo aplica si el negocio usa sellos: con la tarjeta desactivada, el diseño
 * no tiene sentido (no hay tarjeta que mostrar), así que `ProgramStampsSection`
 * ya resuelve ese estado — el diseño con preview solo se monta cuando
 * `overview.enabled` es true, mismo criterio que usaba la sección vieja.
 */
export default function ProgramCardSection({
  overview,
  benefits,
  appearance,
  businessName,
  canMutate,
  onToggle,
  onSaveConfig,
  onSaveDesign,
  onReload,
}: {
  overview: LoyaltyProgramOverview;
  benefits: ProgramBenefit[];
  appearance: LoyaltyAppearance;
  businessName: string;
  canMutate: boolean;
  onToggle: (enabled: boolean) => Promise<void>;
  onSaveConfig: (patch: {
    stampsRequired: number;
    rewardBenefitId?: string;
    rewardTitle?: string;
    rewardType?: string;
    feedbackBonusEnabled?: boolean;
  }) => Promise<void>;
  onSaveDesign: (patch: Record<string, unknown>) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  return (
    <div className="space-y-5">
      <ProgramStampsSection
        overview={overview}
        benefits={benefits}
        canMutate={canMutate}
        onToggle={onToggle}
        onSaveConfig={onSaveConfig}
        onReload={onReload}
      />

      {overview.enabled ? (
        <ProgramFeedbackBonusSection
          overview={overview}
          canMutate={canMutate}
          onSaveConfig={onSaveConfig}
          onReload={onReload}
        />
      ) : null}

      {overview.enabled ? (
        <ProgramDesignTab
          appearance={appearance}
          businessName={businessName}
          rewardName={overview.reward?.name ?? "Tu recompensa"}
          stampsRequired={overview.stampsRequired ?? 5}
          canMutate={canMutate}
          onSave={onSaveDesign}
        />
      ) : null}
    </div>
  );
}
