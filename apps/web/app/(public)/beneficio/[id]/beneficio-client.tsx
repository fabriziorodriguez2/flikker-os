"use client";

import BenefitCard from "@/components/public/benefit-card";
import CustomerShell from "@/components/public/customer-shell";
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
    <CustomerShell
      business={{ name: issuance.businessName }}
      showWordmark
    >
      <div className="w-full">
        <BenefitCard
          title={issuance.benefitTitle}
          description={issuance.description}
          terms={issuance.terms}
          code={issuance.redeemed ? null : issuance.redemptionCode}
          redeemed={issuance.redeemed}
          reveal="none"
          /*
            Sin `footer` en el caso disponible: `BenefitCard` ya escribe
            "Mostralo al personal para canjearlo" debajo del código, y repetirlo
            acá dejaba la misma instrucción dos veces seguidas. El caso canjeado
            sí lleva pie propio, porque ahí no hay código y la salida del
            cliente es otra.
          */
          footer={
            issuance.redeemed
              ? "Si creés que es un error, mostrale este link al personal del local."
              : undefined
          }
        />
      </div>
    </CustomerShell>
  );
}
