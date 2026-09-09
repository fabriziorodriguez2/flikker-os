import { notFound, redirect } from "next/navigation";
import QrLandingClient from "./qr-landing-client";

export interface QrBenefit {
  type: string;
  title: string;
  description: string | null;
  terms: string | null;
}

export interface QrInfo {
  businessName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  googleBusinessProfileUrl: string | null;
  benefitText: string | null;
  benefit: QrBenefit | null;
}

/**
 * Un QR histórico apuntando a un negocio que ya pasó a Check-in V2 devuelve
 * solo esto — nunca los campos de `QrInfo`. Es la señal para redirigir antes
 * de montar el formulario legacy, sin ejecutar `PublicService` legacy ni
 * crear un Customer/Visit por fuera del flujo V2 real.
 */
interface QrRedirect {
  redirectPath: string;
}

type QrResponse = QrInfo | QrRedirect;

function isRedirect(info: QrResponse): info is QrRedirect {
  return "redirectPath" in info;
}

const API_URL = process.env.API_URL ?? "http://localhost:3000";

async function getQrInfo(businessId: string): Promise<QrResponse | null> {
  try {
    const res = await fetch(`${API_URL}/public/qr/${encodeURIComponent(businessId)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json() as Promise<QrResponse>;
  } catch {
    return null;
  }
}

export default async function QrLandingPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const info = await getQrInfo(businessId);
  if (!info) notFound();
  if (isRedirect(info)) redirect(info.redirectPath);

  return <QrLandingClient businessId={businessId} info={info} />;
}
