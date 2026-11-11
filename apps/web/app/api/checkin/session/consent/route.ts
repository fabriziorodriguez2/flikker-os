import { getCheckinToken } from "@/lib/checkin-cookie";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/**
 * El cliente acepta o retira su consentimiento promocional desde su espacio
 * personal. Anclado a la cookie de sesión, igual que `session/feedback`: el
 * backend resuelve negocio y cliente desde la sesión, nunca desde el body.
 */
export async function POST(request: Request) {
  const session = await getCheckinToken();
  if (!session) {
    return Response.json({ message: "No session" }, { status: 401 });
  }

  const body = await request.text();
  const res = await fetch(`${API_URL}/public/checkin/session/consent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-flikker-session": session,
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
