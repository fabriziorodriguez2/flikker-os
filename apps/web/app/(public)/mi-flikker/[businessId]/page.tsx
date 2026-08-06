import PlaceDetailClient from "./place-detail-client";

export default async function MiFlikkerPlacePage({
  params,
}: {
  params: Promise<{ businessId: string }>;
}) {
  const { businessId } = await params;
  return <PlaceDetailClient businessId={businessId} />;
}
