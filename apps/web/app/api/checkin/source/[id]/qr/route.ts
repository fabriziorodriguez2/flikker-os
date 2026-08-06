import { getEffectiveApiContext, getSession } from "@/lib/auth";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/**
 * Streams a source's check-in QR PNG. Separate from the generic JSON proxy
 * (which reads text and would corrupt binary). Forwards the panel session's
 * auth + tenant context to the API.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { accessToken, businessId } = getEffectiveApiContext(session);
  const res = await fetch(
    `${API_URL}/visit-sources/${encodeURIComponent(id)}/qr`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(businessId ? { "x-business-id": businessId } : {}),
      },
    },
  );

  if (!res.ok) {
    return new Response("No se pudo generar el QR", { status: res.status });
  }

  const buffer = await res.arrayBuffer();
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": 'attachment; filename="checkin-qr.png"',
    },
  });
}
