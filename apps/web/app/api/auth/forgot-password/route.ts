import { apiFetch } from "@/lib/api";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email : "";

  if (email) {
    try {
      await apiFetch("/auth/forgot-password", null, {
        method: "POST",
        body: { email },
      });
    } catch (error) {
      console.error(
        "[forgot-password] API call failed:",
        error instanceof Error ? error.message : error,
      );
      return Response.json(
        { message: "No pudimos enviar el email. Probá de nuevo." },
        { status: 502 },
      );
    }
  }

  return Response.json({ ok: true });
}
