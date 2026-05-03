const API_URL = process.env.API_URL ?? "http://localhost:3000";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await params;
  const upstream = await fetch(
    `${API_URL}/public/widgets/business/${encodeURIComponent(businessId)}`,
    {
      headers: { Accept: "application/json" },
      next: { revalidate: 900 },
    },
  );
  const body = await upstream.text();

  return new Response(body, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") ?? "application/json",
      "Cache-Control":
        upstream.headers.get("Cache-Control") ??
        "public, max-age=900, s-maxage=1800, stale-while-revalidate=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
