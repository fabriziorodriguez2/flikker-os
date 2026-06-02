import { notFound } from "next/navigation";
import QrLandingClient from "./qr-landing-client";

export interface QrInfo {
  businessName: string;
  logoUrl: string | null;
  primaryColor: string | null;
  googleBusinessProfileUrl: string | null;
  benefitText: string | null;
}

const API_URL = process.env.API_URL ?? "http://localhost:3000";

async function getQrInfo(businessId: string): Promise<QrInfo | null> {
  try {
    const res = await fetch(`${API_URL}/public/qr/${encodeURIComponent(businessId)}`, {
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json() as Promise<QrInfo>;
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

  return <QrLandingClient businessId={businessId} info={info} />;
}
