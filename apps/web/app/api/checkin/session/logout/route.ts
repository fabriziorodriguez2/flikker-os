import { clearCheckinCookie, getCheckinToken } from "@/lib/checkin-cookie";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/** "Cambiar de cuenta": revokes the session server-side and clears the cookie. */
export async function POST() {
  const session = await getCheckinToken();

  if (session) {
    await fetch(`${API_URL}/public/checkin/session/logout`, {
      method: "POST",
      headers: { "x-flikker-session": session },
    }).catch(() => undefined);
  }

  await clearCheckinCookie();
  return Response.json({ ok: true });
}
