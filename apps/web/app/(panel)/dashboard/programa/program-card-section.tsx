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
      },
      benefit: null,
      benefitText: null,
      welcomeMessage: null,
    };

    return (
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-[16px] border border-[#E8EAF0] bg-white p-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF0FB] text-[#5C6BC0]">
            <Gift className="h-5 w-5" aria-hidden="true" />
          </span>
          <h2 className="mt-4 font-display text-base font-bold text-[#1A202C]">
            Tu programa es de beneficios
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-[#8891A4]">
            Todavía no configuraste una tarjeta de sellos — tu catálogo de{" "}
            <button
              type="button"
              onClick={onGoToPremios}
              className="font-semibold text-[#5C6BC0] hover:underline"
            >
              Beneficios
            </button>{" "}
            es tu programa. Podés sumar sellos más adelante si querés premiar
            las visitas frecuentes.
          </p>
          {canMutate ? (
            <div className="mx-auto mt-5 max-w-sm">
              <ProgramStampsSection
                overview={overview}
                benefits={benefits}
                canMutate={canMutate}
                onToggle={onToggle}
                onSaveConfig={onSaveConfig}
                onReload={onReload}
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
            Así ve tu cliente su beneficio, sin tarjeta de sellos de por medio —
            con datos de ejemplo.
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
