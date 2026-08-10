import { getCheckinToken } from "@/lib/checkin-cookie";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/**
 * "¿Cómo fue tu experiencia?" — anchored purely to the session cookie, same
 * as `session/logout` and `session` (GET). Never a `:token` route: the
 * backend resolves which visit this feedback is about from the customer's
 * own session, never from anything the client supplies.
 */
export async function POST(request: Request) {
  const session = await getCheckinToken();
  if (!session) {
    return Response.json({ message: "No session" }, { status: 401 });
  }

  const body = await request.text();
  const res = await fetch(`${API_URL}/public/checkin/session/feedback`, {
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
