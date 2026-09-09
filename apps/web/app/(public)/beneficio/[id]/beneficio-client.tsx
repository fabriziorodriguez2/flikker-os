"use client";

import BenefitCard from "@/components/public/benefit-card";
import PoweredByFlikker from "@/components/ui/powered-by-flikker";
import type { BenefitIssuanceView } from "./page";

/**
 * La pantalla de UNA emisión concreta — el link que manda Promociones.
 *
 * Es un wrapper de contexto sobre `BenefitCard`: acá el cliente llegó por un
 * link único, sin sesión y sin el resto de su espacio personal, así que la
 * card es todo el contenido.
 *
 * `reveal="none"`: el QR se muestra directo, sin paso intermedio. Se abre
 * este link justamente para mostrarlo en el mostrador — a diferencia del
 * check-in, donde la card convive con el resto de la pantalla y el sello
 * deslizable evita revelar el código de paso.
 *
 * Lo que NO se muestra, porque el endpoint no lo devuelve: vencimiento y en
 * qué visita se ganó. Inventarlos sería escribir datos que el backend no
 * tiene (`PublicService.getBenefitIssuance`).
 */
export default function BeneficioClient({
  issuance,
}: {
  issuance: BenefitIssuanceView;
}) {
  return (
    <div className="flk-customer flex min-h-dvh flex-col items-center justify-center bg-[#F5F6FA] px-4 py-8">
      <div className="w-full max-w-sm">
        <p className="mb-3 text-center text-xs font-bold uppercase tracking-[0.12em] text-[#8891A4]">
          {issuance.businessName}
        </p>

        <BenefitCard
          title={issuance.benefitTitle}
          description={issuance.description}
          terms={issuance.terms}
          code={issuance.redeemed ? null : issuance.redemptionCode}
          redeemed={issuance.redeemed}
          reveal="none"
          footer={
            issuance.redeemed
              ? "Si creés que es un error, mostrale este link al personal del local."
              : "Mostralo al personal del local para canjearlo."
          }
        />
      </div>
      <p className="mt-8 text-xs text-[#A0A8B8]">
        <PoweredByFlikker />
      </p>
    </div>
  );
}
