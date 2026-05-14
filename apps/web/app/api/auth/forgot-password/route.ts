import { apiFetch } from "@/lib/api";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";

  if (email) {
    await apiFetch("/auth/forgot-password", null, {
      method: "POST",
      body: { email },
    }).catch(() => null);
  }

  return Response.json({ ok: true });
}
