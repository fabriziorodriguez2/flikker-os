import { setCheckinCookie } from "@/lib/checkin-cookie";
import { setFlikkerAccountCookie } from "@/lib/flikker-account-cookie";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

interface VerifyResponse {
  status?: string;
  sessionToken?: string;
  /**
   * Sesión de Mi Flikker, emitida gratis por el MISMO OTP que ya probó este
   * teléfono acá — ver el comentario en `CheckinService.recoverVerify`.
   * `null`/ausente si no se pudo emitir (best-effort): la recuperación del
   * negocio no depende de esto.
   */
  flikkerAccountSessionToken?: string | null;
  [key: string]: unknown;
}

/**
 * Completes recovery. On success the API returns a raw session token which we
 * move into the httpOnly cookie and strip from the response body.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await request.text();

  const res = await fetch(
    `${API_URL}/public/checkin/${encodeURIComponent(token)}/recover/verify`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "user-agent": request.headers.get("user-agent") ?? "",
      },
      body,
    },
  );

  const data = (await res.json().catch(() => null)) as VerifyResponse | null;

  if (
    res.ok &&
    data?.status === "restored" &&
    typeof data.sessionToken === "string"
  ) {
    await setCheckinCookie(data.sessionToken);
    // Mismo OTP, dos sesiones: si el backend pudo emitir también la de Mi
    // Flikker, se guarda acá — así "Mis lugares y premios" entra directo,
    // sin pedir un segundo código por algo que ya se probó.
    if (typeof data.flikkerAccountSessionToken === "string") {
      await setFlikkerAccountCookie(data.flikkerAccountSessionToken);
    }
    const { sessionToken: _drop, flikkerAccountSessionToken: _drop2, ...safe } =
      data;
    void _drop;
    void _drop2;
    return Response.json(safe, { status: 200 });
  }

  return Response.json(data ?? {}, { status: res.status });
}
