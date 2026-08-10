const API_URL = process.env.API_URL ?? "http://localhost:3000";
const MAX_LOGO_BYTES = 5 * 1024 * 1024;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const landingResponse = await fetch(
    `${API_URL}/public/checkin/${encodeURIComponent(token)}`,
    { cache: "no-store" },
  );
  if (!landingResponse.ok) return new Response(null, { status: landingResponse.status });

  const landing = (await landingResponse.json()) as {
    business?: { logoUrl?: string | null };
  };
  const logoUrl = landing.business?.logoUrl;
  if (!logoUrl) return new Response(null, { status: 404 });

  const logoResponse = await fetch(logoUrl);
  if (!logoResponse.ok) return new Response(null, { status: 502 });

  const contentType = logoResponse.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) return new Response(null, { status: 415 });

  const logo = await logoResponse.arrayBuffer();
  if (logo.byteLength > MAX_LOGO_BYTES) return new Response(null, { status: 413 });

  return new Response(logo, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
