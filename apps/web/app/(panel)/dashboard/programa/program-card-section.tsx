"use client";

import { Gift } from "lucide-react";
import {
  BenefitRewardCard,
  Shell,
} from "@/app/(public)/check-in/[token]/checkin-client";
import type { CheckinLanding } from "@/app/(public)/check-in/[token]/page";
import PhoneFrame from "@/components/ui/phone-frame";
import ProgramStampsSection from "./program-stamps-section";
import ProgramFeedbackBonusSection from "./program-feedback-bonus-section";
import ProgramDesignTab from "./program-design-tab";
import type {
  LoyaltyAppearance,
  LoyaltyProgramOverview,
  ProgramBenefit,
} from "./types";

/**
 * "Tarjeta digital" — todo lo que define la tarjeta de sellos en un solo
 * lugar: si está activa, cuántos sellos pide, qué recompensa entrega, el
 * bonus por feedback, y cómo se ve (con preview en vivo). Antes eran tres
 * secciones de sub-nav separadas (Tarjeta de sellos / Bonus por feedback /
 * Diseño) — se agrupan acá porque las tres son la MISMA decisión de producto
 * ("cómo es mi tarjeta"), no tres independientes.
 *
 * Auditado antes de tocar esto (pedido explícito): no hay ningún campo
 * persistido que diga "este negocio eligió solo Beneficios" — el wizard de
 * onboarding nunca guarda esa elección, solo sus efectos. Pero esos efectos
 * SÍ alcanzan para derivarlo sin agregar un campo nuevo: `overview.reward`
 * (la recompensa de la tarjeta) sobrevive un apagado temporal a propósito
 * (ver el comentario de `setStampsCardEnabled` en el backend) — así que
 * `!overview.enabled && !overview.reward` es, con los datos que YA existen,
 * exactamente "nunca configuró una recompensa de tarjeta": un negocio
 * genuinamente Beneficios-only, no uno que pausó los sellos. Ese caso no
 * muestra el formulario de activación (sería la "tarjeta falsa" que se pidió
 * evitar) — apunta a Premios, que es donde vive su programa real.
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
  onGoToPremios,
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
  onGoToPremios: () => void;
}) {
  const neverConfiguredStamps = !overview.enabled && !overview.reward;

  if (neverConfiguredStamps) {
    const previewBenefit = benefits.find((b) => b.active) ?? benefits[0];
    const previewLanding: CheckinLanding = {
      source: { name: "Preview", type: "qr" },
      business: {
        businessName: businessName || "Tu negocio",
        logoUrl: appearance.logoUrl,
        primaryColor: appearance.primaryColor,
        checkinBackgroundColor: null,
        googleBusinessProfileUrl: null,
        loyaltyCardColor: appearance.loyaltyCardColor,
        loyaltyCardTextColor: appearance.loyaltyCardTextColor,
        loyaltyCardBackgroundImage: appearance.loyaltyCardBackgroundImage,
        loyaltyStampAreaColor: appearance.loyaltyStampAreaColor,
        loyaltyStampColor: appearance.loyaltyStampColor,
        loyaltyStampIcon: appearance.loyaltyStampIcon,
        loyaltyShowBusinessName: appearance.loyaltyShowBusinessName,
        loyaltyStampBackgroundPattern: appearance.loyaltyStampBackgroundPattern,
        loyaltyStampBackgroundOpacity: appearance.loyaltyStampBackgroundOpacity,
      },
      benefit: null,
      benefitText: null,
      welcomeMessage: null,
    };

    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="overflow-hidden rounded-[16px] border border-[#E8EAF0] bg-white">
          <div className="border-b border-[#E8EAF0] p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-[11px] bg-[#EEF0FB] text-[#5C6BC0]">
                  <Gift className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-base font-bold text-[#1A202C]">
                    Tarjeta de sellos
                  </h2>
                  <p className="mt-0.5 text-xs font-semibold text-[#8891A4]">
                    Desactivada
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-[#F2F3F6] px-3 py-1.5 text-xs font-semibold text-[#666D7E]">
                Solo beneficios
              </span>
            </div>
            <p className="mt-4 max-w-xl text-sm leading-6 text-[#6F7689]">
              Tus clientes pueden recibir beneficios sin usar una tarjeta.
              Activá sellos si también querés premiar visitas frecuentes.
            </p>
            <button
              type="button"
              onClick={onGoToPremios}
              className="mt-3 text-xs font-semibold text-[#5C6BC0] hover:underline"
            >
              Ver beneficios activos
            </button>
          </div>
          {canMutate ? (
            <div className="p-5 sm:p-6">
              <ProgramStampsSection
                overview={overview}
                benefits={benefits}
                canMutate={canMutate}
                onToggle={onToggle}
                onSaveConfig={onSaveConfig}
                onReload={onReload}
                compactDisabled
              />
            </div>
          ) : null}
        </section>

        <aside className="lg:sticky lg:top-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#8891A4]">
            Vista previa
          </p>
          <PhoneFrame>
            <Shell landing={previewLanding} fill={false}>
              <div className="w-full max-w-sm">
                <BenefitRewardCard
                  benefit={{
                    type: previewBenefit?.type ?? "gift",
                    title: previewBenefit?.title ?? "Tu beneficio",
                    description: previewBenefit?.description ?? null,
                    terms: previewBenefit?.terms ?? null,
                    redemption: { code: "ABC123", redeemed: false },
                  }}
                  brand={appearance.primaryColor ?? "#5C6BC0"}
                />
              </div>
            </Shell>
          </PhoneFrame>
          <p className="mt-3 text-xs text-[#8891A4]">
            Así ve tu cliente el beneficio disponible, dentro del shell real de
            Flikker.
          </p>
        </aside>
      </div>
    );
  }

  return (
    <>
      {overview.enabled ? (
        <ProgramDesignTab
          appearance={appearance}
          businessName={businessName}
          rewardName={overview.reward?.name ?? "Tu recompensa"}
          stampsRequired={overview.stampsRequired ?? 5}
          canMutate={canMutate}
          onSave={onSaveDesign}
        >
          <ProgramStampsSection
            overview={overview}
            benefits={benefits}
            canMutate={canMutate}
            onToggle={onToggle}
            onSaveConfig={onSaveConfig}
            onReload={onReload}
          />
          <ProgramFeedbackBonusSection
            overview={overview}
            canMutate={canMutate}
            onSaveConfig={onSaveConfig}
            onReload={onReload}
          />
        </ProgramDesignTab>
      ) : (
        <ProgramStampsSection
          overview={overview}
          benefits={benefits}
          canMutate={canMutate}
          onToggle={onToggle}
          onSaveConfig={onSaveConfig}
          onReload={onReload}
        />
      )}
    </>
  );
}
