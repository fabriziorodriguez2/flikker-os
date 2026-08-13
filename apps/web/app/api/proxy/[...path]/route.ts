import { clearSession, getSession, setSession } from "@/lib/auth";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

/**
 * Sesión de empleado de larga duración (#3) — el refresh token rota en cada
 * uso (auth.service.ts), así que dos fetches concurrentes que expiran al
 * mismo tiempo y disparan cada uno su propio POST /auth/refresh con el
 * MISMO refreshToken viejo terminan en carrera: solo el primero tiene
 * éxito, el segundo cae contra un token ya rotado/revocado y deslogaba al
 * usuario aunque el primero hubiera renovado bien la sesión. Este cache a
 * nivel de módulo deduplica: toda request concurrente que llegue con el
 * mismo refreshToken "viejo" espera la MISMA promesa en vuelo en vez de
 * disparar su propio refresh. Ámbito: por proceso Node — cubre el caso real
 * (varios fetches de la misma pestaña/dispositivo), no múltiples instancias
 * del servidor.
 */
const inFlightRefreshes = new Map<string, Promise<RefreshResponse>>();

async function refreshTokens(refreshToken: string): Promise<RefreshResponse> {
  const existing = inFlightRefreshes.get(refreshToken);
  if (existing) return existing;

  const promise = (async () => {
    const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!refreshRes.ok) throw new Error("La sesión venció");
    return (await refreshRes.json()) as RefreshResponse;
  })();

  inFlightRefreshes.set(refreshToken, promise);
  try {
    return await promise;
  } finally {
    // Solo limpiar si nadie más ya lo reemplazó (no debería pasar con esta
    // clave, pero evita borrar una entrada más nueva por las dudas).
    if (inFlightRefreshes.get(refreshToken) === promise) {
      inFlightRefreshes.delete(refreshToken);
    }
  }
}

/**
 * Generic proxy to the backend API.
 * Client components call /api/proxy/<path> and this handler forwards
 * the request with the session's accessToken + activeBusinessId.
 */
async function handler(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const session = await getSession();
  if (!session) {
    return Response.json({ message: "No hay sesión activa" }, { status: 401 });
  }

  const { path } = await params;
  const backendPath = "/" + path.join("/");
  const url = new URL(request.url);
  const qs = url.search;
  const isImpersonating = Boolean(session.impersonation);
  const useOriginalAdminToken =
    path[0] === "platform" || path[0] === "auth" || path[0] === "billing";
  const effectiveAccessToken =
    isImpersonating && !useOriginalAdminToken
      ? session.impersonation!.accessToken
      : session.accessToken;
  const effectiveBusinessId =
    isImpersonating && !useOriginalAdminToken
      ? session.impersonation!.businessId
      : session.activeBusinessId;

  const incomingContentType = request.headers.get("Content-Type");
  const headers: Record<string, string> = {
    Authorization: `Bearer ${effectiveAccessToken}`,
  };

  if (incomingContentType) {
    headers["Content-Type"] = incomingContentType;
  } else {
    headers["Content-Type"] = "application/json";
  }

  if (effectiveBusinessId) {
    headers["x-business-id"] = effectiveBusinessId;
  }

  const body =
    request.method !== "GET" && request.method !== "HEAD"
      ? await request.arrayBuffer()
      : undefined;

  const sendRequest = (accessToken: string, businessId: string | null) => {
    const nextHeaders: Record<string, string> = {
      ...headers,
      Authorization: `Bearer ${accessToken}`,
    };

    if (businessId) {
      nextHeaders["x-business-id"] = businessId;
    }

    return fetch(`${API_URL}${backendPath}${qs}`, {
      method: request.method,
      headers: nextHeaders,
      body,
    });
  };

  let res = await sendRequest(effectiveAccessToken, effectiveBusinessId);

  if (res.status === 401 && session.refreshToken && !isImpersonating) {
    try {
      const refreshedTokens = await refreshTokens(session.refreshToken);
      const refreshedSession = {
        ...session,
        accessToken: refreshedTokens.accessToken,
        refreshToken: refreshedTokens.refreshToken,
      };

      await setSession(refreshedSession);
      res = await sendRequest(
        refreshedSession.accessToken,
        refreshedSession.activeBusinessId,
      );
    } catch {
      await clearSession();
      return Response.json({ message: "La sesión venció" }, { status: 401 });
    }
  }

  if (res.status === 401) {
    await clearSession();
  }

  // `arrayBuffer` y no `text`: por acá también pasan respuestas binarias
  // (el PNG de `/visit-sources/{id}/qr`, por ejemplo). `res.text()` las
  // decodifica como UTF-8 y corrompe los bytes — el archivo descargado deja
  // de ser un PNG válido. Para JSON el resultado es idéntico, así que esto no
  // cambia nada del resto del panel.
  const data = await res.arrayBuffer();

  const responseHeaders: Record<string, string> = {
    "Content-Type": res.headers.get("Content-Type") ?? "application/json",
  };
  // Se reenvía para que la descarga conserve el nombre que puso la API.
  const disposition = res.headers.get("Content-Disposition");
  if (disposition) responseHeaders["Content-Disposition"] = disposition;

  return new Response(data, {
    status: res.status,
    headers: responseHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
