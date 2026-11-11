"use client";

import { CheckCircle2, Clock, Gift } from "lucide-react";
import CustomerShell from "@/components/public/customer-shell";
import BottomNav from "@/components/public/bottom-nav";
import { MiFlikkerMark } from "@/components/public/mi-flikker-header";
import RedemptionReveal from "@/components/public/redemption-reveal";
import type { BenefitIssuanceView } from "./page";

/** One real issuance, with the existing shared redemption renderer. */
export default function BeneficioClient({
  issuance,
}: {
  issuance: BenefitIssuanceView;
}) {
  const available = !issuance.redeemed && !issuance.expired;
  const label = issuance.redeemed
    ? "Canjeado"
    : issuance.expired
      ? "Vencido"
      : "Disponible";
  const Icon = issuance.redeemed
    ? CheckCircle2
    : issuance.expired
      ? Clock
      : Gift;
  return (
    <CustomerShell
      wallet
      compact
      footer={false}
      back={{ href: "/mi-flikker?tab=premios", label: "Volver a Premios" }}
    >
      <div className="pb-[calc(6rem+env(safe-area-inset-bottom))]">
        <header className="mb-5">
          <MiFlikkerMark />
          <h1 className="mt-4 text-[25px] font-bold leading-tight tracking-[-0.04em]">
            Tu premio
          </h1>
          <p className="mt-1 text-xs text-[#777780]">{issuance.businessName}</p>
        </header>
        <section
          className="overflow-hidden rounded-[20px] bg-white shadow-[0_4px_16px_#19191F08]"
          aria-label="Detalle del premio"
        >
          <div className="flex items-start gap-3 bg-[#6348E7] p-5 text-white">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#6348E7]">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <span
                className={`inline-block rounded-full px-2 py-1 text-[10px] font-bold ${available ? "bg-[#E0F4E9] text-[#176745]" : "bg-white/20 text-white"}`}
              >
                {label}
              </span>
              <h2 className="mt-2 break-words text-[22px] font-bold leading-tight tracking-[-0.025em]">
                {issuance.benefitTitle}
              </h2>
            </div>
          </div>
          <div className="px-5 py-6">
            {issuance.description ? (
              <p className="mb-4 break-words text-sm leading-relaxed text-[#777780]">
                {issuance.description}
              </p>
            ) : null}
            {available && issuance.redemptionCode ? (
              <RedemptionReveal
                code={issuance.redemptionCode}
                redeemPath={`/redeem/${encodeURIComponent(issuance.redemptionCode)}`}
              />
            ) : null}
            {issuance.redeemed ? (
              <p className="text-sm leading-relaxed text-[#777780]">
                Este premio ya fue canjeado. Si creés que es un error, mostrale
                este link al personal del local.
              </p>
            ) : issuance.expired ? (
              <p className="text-sm leading-relaxed text-[#777780]">
                Este beneficio ya no se puede usar
                {issuance.expiresAt
                  ? `: venció el ${new Date(issuance.expiresAt).toLocaleDateString("es-UY")}`
                  : ""}
                . Tus sellos siguen donde estaban.
              </p>
            ) : null}
            {issuance.terms ? (
              <div className="mt-5 border-t border-[#ECEBF0] pt-4">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#777780]">
                  Condiciones
                </h3>
                <p className="mt-2 whitespace-pre-line break-words text-xs leading-relaxed text-[#777780]">
                  {issuance.terms}
                </p>
              </div>
            ) : null}
          </div>
        </section>
      </div>
      <BottomNav active="premios" />
    </CustomerShell>
  );
}
