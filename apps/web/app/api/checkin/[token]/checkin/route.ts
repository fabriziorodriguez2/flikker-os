import { getCheckinToken } from "@/lib/checkin-cookie";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/**
 * Return check-in via the persistent session cookie. A 401 means the session is
 * not recognized — the client then falls back to the first-visit form.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const session = await getCheckinToken();
  // El cuerpo puede traer el código del local (`presenceCode`) cuando el
  // negocio exige prueba de presencia. Se reenvía tal cual: la validación es
  // del backend, este proxy nunca decide nada.
  const body = await request.text().catch(() => "");

  const res = await fetch(
    `${API_URL}/public/checkin/${encodeURIComponent(token)}/checkin`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { "x-flikker-session": session } : {}),
      },
      body: body || "{}",
    },
  );

  const data = await res.text();
  return new Response(data, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
    },
  });
}
