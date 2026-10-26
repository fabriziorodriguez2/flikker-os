import { cookies } from "next/headers";
import { apiFetch, ApiError } from "@/lib/api";
import { setSession, type Session } from "@/lib/auth";
import {
  buildGoogleErrorPath,
  GOOGLE_OAUTH_COOKIE,
  GOOGLE_OAUTH_COOKIE_PATH,
  parseGoogleOAuthFlow,
  resolvePostGoogleRedirect,
} from "@/lib/google-oauth";
import { googleStatesMatch } from "@/lib/google-oauth-server";

interface GoogleCallbackResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isPlatformAdmin?: boolean;
    pendingUpgradePlan?: "MONTHLY" | "YEARLY" | null;
  };
  memberships: {
    businessId: string;
    role: string;
    business: { name: string; slug: string };
  }[];
}

function redirectTo(path: string) {
  // Relativa a propósito — ver `app/session-expired/route.ts`.
  return new Response(null, { status: 303, headers: { Location: path } });
}

/**
 * Vuelta de Google. Valida el `state` contra la cookie httpOnly (nunca
 * confía solo en el query string), le pasa el code a la API — que lo canjea,
 * verifica el ID token y resuelve el User — y escribe la MISMA sesión que el
 * login con password. Cualquier falla termina en el mismo copy genérico.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const cookieStore = await cookies();
  const flow = parseGoogleOAuthFlow(cookieStore.get(GOOGLE_OAUTH_COOKIE)?.value);

  // Un solo uso, pase lo que pase.
  cookieStore.set(GOOGLE_OAUTH_COOKIE, "", {
    path: GOOGLE_OAUTH_COOKIE_PATH,
    maxAge: 0,
  });

  // Sin cookie = flujo vencido o que no arrancó en este navegador.
  if (!flow) return redirectTo(buildGoogleErrorPath(null));

  const errorPath = buildGoogleErrorPath(flow);
  const code = params.get("code");

  // `error` = el usuario canceló (access_denied) o Google rechazó el pedido.
  if (params.get("error") || !code || !googleStatesMatch(flow.state, params.get("state"))) {
    return redirectTo(errorPath);
  }

  let data: GoogleCallbackResponse;
  try {
    data = await apiFetch<GoogleCallbackResponse>("/auth/google/callback", null, {
      method: "POST",
      body: {
        code,
        codeVerifier: flow.codeVerifier,
        nonce: flow.nonce,
        ...(flow.pendingUpgradePlan
          ? { pendingUpgradePlan: flow.pendingUpgradePlan }
          : {}),
      },
    });
  } catch (error) {
    // Nunca el code ni tokens en logs: solo el status.
    console.error(
      "[api/auth/google/callback] failed:",
      error instanceof ApiError ? error.status : "unexpected",
    );
    return redirectTo(errorPath);
  }

  const session: Session = {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    user: {
      id: data.user.id,
      email: data.user.email,
      firstName: data.user.firstName,
      lastName: data.user.lastName ?? "",
      isPlatformAdmin: data.user.isPlatformAdmin,
    },
    // Sin logoUrl, igual que `/api/auth/login`: no entra en la cookie.
    memberships: data.memberships.map((m) => ({
      businessId: m.businessId,
      role: m.role,
      business: { name: m.business.name, slug: m.business.slug },
    })),
    activeBusinessId:
      data.memberships.length === 1 ? data.memberships[0].businessId : null,
  };
  await setSession(session);

  return redirectTo(
    resolvePostGoogleRedirect({
      isPlatformAdmin: data.user.isPlatformAdmin,
      membershipsCount: data.memberships.length,
      pendingUpgradePlan: data.user.pendingUpgradePlan,
      next: flow.next,
    }),
  );
}
