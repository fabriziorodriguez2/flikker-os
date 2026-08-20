"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { CheckCircle2, Gift } from "lucide-react";
import type { BenefitIssuanceView } from "./page";

/**
 * El QR representa ESTA emisión concreta (su propio `redemptionCode`), no
 * el Benefit en general — mismo mecanismo que ya usa el check-in
 * (`/redeem/{code}`), solo que acá el cliente llega directo por el link
 * único que le mandó la promoción, sin tener que abrir su espacio
 * personal completo.
 */
export default function BeneficioClient({
  issuance,
}: {
  issuance: BenefitIssuanceView;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (issuance.redeemed || !issuance.redemptionCode) return;
    let cancelled = false;
    const redeemUrl = `${window.location.origin}/redeem/${issuance.redemptionCode}`;
    void QRCode.toDataURL(redeemUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 220,
    }).then((url) => {
      if (!cancelled) setQrDataUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [issuance.redeemed, issuance.redemptionCode]);

  return (
    <div className="flex min-h-full items-center justify-center bg-[#F5F6FA] p-4">
      <div className="w-full max-w-sm rounded-[16px] border border-[#E8EAF0] bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#EEF0FB] text-[#5C6BC0]">
          <Gift className="h-6 w-6" aria-hidden="true" />
        </div>
        <p className="mt-3 text-xs font-semibold text-[#8891A4]">
          {issuance.businessName}
        </p>
        <h1 className="mt-1 text-lg font-bold text-[#1A202C]">
          {issuance.benefitTitle}
        </h1>
        {issuance.description ? (
          <p className="mt-2 text-sm text-[#4A5568]">{issuance.description}</p>
        ) : null}
        {issuance.terms ? (
          <p className="mt-2 text-xs text-[#8891A4]">{issuance.terms}</p>
        ) : null}

        {issuance.redeemed ? (
          <div className="mt-6 flex flex-col items-center gap-2 text-[#12805c]">
            <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
            <p className="text-sm font-semibold">Ya canjeaste este beneficio</p>
          </div>
        ) : (
          <div className="mt-6">
            <p className="text-xs text-[#8891A4]">
              Mostrá este código en el local para canjearlo
            </p>
            {qrDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrDataUrl}
                alt="QR para canjear tu beneficio"
                className="mx-auto mt-3 h-[180px] w-[180px] rounded-[12px] border border-[#E8EAF0] p-2"
              />
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
