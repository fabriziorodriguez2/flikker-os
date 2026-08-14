import { apiFetch } from "@/lib/api";

/**
 * Reenvío idempotente y sin enumeración: siempre el mismo mensaje genérico,
 * exista o no la cuenta, esté verificada o no.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: string;
  } | null;

  const GENERIC_MESSAGE =
    "Si el correo existe y no fue confirmado, te reenviamos el enlace";

  if (!body?.email) {
    return Response.json({ message: GENERIC_MESSAGE });
  }

  try {
    await apiFetch("/auth/resend-verification", null, {
      method: "POST",
      body: { email: body.email },
    });
  } catch {
    // Mismo mensaje aunque falle: no hay nada que distinguir hacia afuera.
  }

  return Response.json({ ok: true, message: GENERIC_MESSAGE });
}
