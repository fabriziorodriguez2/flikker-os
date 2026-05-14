import { apiFetch } from "@/lib/api";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const email = typeof body?.email === "string" ? body.email : "";
  const newPassword =
    typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!token || !email || !newPassword) {
    return Response.json(
      { message: "Faltan datos para cambiar la contraseña" },
      { status: 400 },
    );
  }

  try {
    await apiFetch("/auth/reset-password", null, {
      method: "POST",
      body: { token, email, newPassword },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "No pudimos cambiar la contraseña",
      },
      { status: 400 },
    );
  }
}
