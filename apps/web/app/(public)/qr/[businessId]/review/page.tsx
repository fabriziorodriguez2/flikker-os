import { notFound } from "next/navigation";
import type { QrInfo } from "../page";
import QrReviewClient from "./review-client";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

async function getQrInfo(businessId: string): Promise<QrInfo | null> {
  try {
    const res = await fetch(
      `${API_URL}/public/qr/${encodeURIComponent(businessId)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return res.json() as Promise<QrInfo>;
  } catch {
    return null;
  }
}

export default async function QrReviewPage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  const info = await getQrInfo(businessId);
  if (!info || !info.googleBusinessProfileUrl) notFound();

  return <QrReviewClient info={info} />;
}
