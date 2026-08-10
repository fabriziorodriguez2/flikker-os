import { getFlikkerAccountToken } from "@/lib/flikker-account-cookie";

const API_URL = process.env.API_URL ?? "http://localhost:3000";
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await params;
  const session = await getFlikkerAccountToken();
  if (!session) return new Response(null, { status: 401 });

  const placeResponse = await fetch(
    `${API_URL}/public/my-flikker/${encodeURIComponent(businessId)}`,
    { headers: { "x-flikker-account-session": session } },
  );
  if (!placeResponse.ok) return new Response(null, { status: placeResponse.status });

  const place = (await placeResponse.json()) as { logoUrl?: string | null };
  if (!place.logoUrl) return new Response(null, { status: 404 });

  const logoResponse = await fetch(place.logoUrl);
  if (!logoResponse.ok) return new Response(null, { status: 502 });

  const contentType = logoResponse.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) return new Response(null, { status: 415 });

  const logo = await logoResponse.arrayBuffer();
  if (logo.byteLength > MAX_LOGO_BYTES) return new Response(null, { status: 413 });

  return new Response(logo, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
