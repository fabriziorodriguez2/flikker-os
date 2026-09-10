import { getFlikkerAccountToken } from "@/lib/flikker-account-cookie";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/**
 * El teléfono de la cuenta — para el menú "Mi cuenta" del header de Mi
 * Flikker. Mismo patrón de proxy que `../places/route.ts`.
 */
export async function GET() {
  const session = await getFlikkerAccountToken();
  if (!session) {
    return Response.json({ message: "No session" }, { status: 401 });
  }

  const res = await fetch(`${API_URL}/public/my-flikker/account`, {
    method: "GET",
    headers: { "x-flikker-account-session": session },
  });

  const data = await res.text();
  return new Response(data, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
    },
  });
}
