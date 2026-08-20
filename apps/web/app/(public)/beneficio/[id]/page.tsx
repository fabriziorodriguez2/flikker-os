import { notFound } from "next/navigation";
import BeneficioClient from "./beneficio-client";

export interface BenefitIssuanceView {
  businessName: string;
  benefitTitle: string;
  description: string | null;
  terms: string | null;
  redemptionCode: string | null;
  redeemed: boolean;
}

const API_URL = process.env.API_URL ?? "http://localhost:3000";

async function getIssuance(id: string): Promise<BenefitIssuanceView | null> {
  try {
    const res = await fetch(
      `${API_URL}/public/benefit-issuances/${encodeURIComponent(id)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as BenefitIssuanceView;
  } catch {
    return null;
  }
}

/**
 * Pantalla del cliente para UNA emisión de Benefit — el link que manda
 * Promociones por WhatsApp. Solo lectura: muestra el beneficio y, si no fue
 * canjeado, su QR de canje (que apunta a `/redeem/{code}`, staff). Nunca
 * confirma nada acá.
 */
export default async function BeneficioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const issuance = await getIssuance(id);
  if (!issuance) notFound();

  return <BeneficioClient issuance={issuance} />;
}
