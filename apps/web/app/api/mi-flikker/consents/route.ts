import { getFlikkerAccountToken } from "@/lib/flikker-account-cookie";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/**
 * Mi Flikker → preferencias de comunicación por comercio. Mismo patrón de
 * proxy que `../account/route.ts`: la sesión de la cuenta define el alcance.
 */
async function forward(method: "GET" | "POST", body?: string) {
  const session = await getFlikkerAccountToken();
  if (!session) {
    return Response.json({ message: "No session" }, { status: 401 });
  }
  const res = await fetch(`${API_URL}/public/my-flikker/consents`, {
    method,
    headers: {
      "x-flikker-account-session": session,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body,
  });
  const data = await res.text();
  return new Response(data, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
    },
  });
}

export function GET() {
  return forward("GET");
}

export async function POST(request: Request) {
  return forward("POST", await request.text());
}
