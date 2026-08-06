import { clearFlikkerAccountCookie, getFlikkerAccountToken } from "@/lib/flikker-account-cookie";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export async function POST() {
  const session = await getFlikkerAccountToken();
  if (session) {
    await fetch(`${API_URL}/public/flikker-account/logout`, {
      method: "POST",
      headers: { "x-flikker-account-session": session },
    }).catch(() => undefined);
  }
  await clearFlikkerAccountCookie();
  return Response.json({ ok: true });
}
