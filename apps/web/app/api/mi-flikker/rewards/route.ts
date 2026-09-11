import { getFlikkerAccountToken } from "@/lib/flikker-account-cookie";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/**
 * Premios de la cuenta — todas las emisiones, de todos sus negocios.
 * Mismo patrón de proxy que `../places/route.ts`: la cookie httpOnly viaja
 * como header al API y nunca pasa por JS del cliente. El scope lo resuelve
 * la sesión del lado del API; acá no se manda ningún id de cliente.
 */
export async function GET() {
  const session = await getFlikkerAccountToken();
  if (!session) {
    return Response.json({ message: "No session" }, { status: 401 });
  }

  const res = await fetch(`${API_URL}/public/my-flikker/rewards`, {
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
