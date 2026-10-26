import { cookies } from "next/headers";
import { apiFetch } from "@/lib/api";
import {
  buildGoogleErrorPath,
  GOOGLE_OAUTH_COOKIE,
  GOOGLE_OAUTH_COOKIE_MAX_AGE,
  GOOGLE_OAUTH_COOKIE_PATH,
} from "@/lib/google-oauth";
import { createGoogleOAuthFlow } from "@/lib/google-oauth-server";
import { parsePendingUpgradePlanFromSearchParams } from "@/lib/pending-upgrade-plan";
import { getSafeInternalPath } from "@/lib/safe-redirect";

const GOOGLE_AUTHORIZE_ORIGIN = "https://accounts.google.com/";

/**
 * Inicio de "Continuar con Google". Genera state (anti-CSRF), nonce y PKCE,
 * los guarda junto a la intención PRO en una cookie httpOnly de vida corta y
 * redirige a Google. La URL la arma la API (único lugar con el client id y
 * el redirect URI); el client secret nunca pasa por acá.
 */
export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const origin = searchParams.get("from") === "signup" ? "signup" : "login";
  const pendingUpgradePlan =
    origin === "signup"
      ? parsePendingUpgradePlanFromSearchParams(searchParams)
      : null;
  const next = getSafeInternalPath(searchParams.get("next"));

  const { flow, codeChallenge } = createGoogleOAuthFlow({
    origin,
    pendingUpgradePlan,
    next,
  });

  try {
    const { url } = await apiFetch<{ url: string }>(
      "/auth/google/authorization-url",
      null,
      {
        method: "POST",
        body: { state: flow.state, nonce: flow.nonce, codeChallenge },
      },
    );
    if (typeof url !== "string" || !url.startsWith(GOOGLE_AUTHORIZE_ORIGIN)) {
      throw new Error("Unexpected authorization URL");
    }

    const cookieStore = await cookies();
    cookieStore.set(GOOGLE_OAUTH_COOKIE, JSON.stringify(flow), {
      httpOnly: true,
      // lax: la cookie tiene que viajar en la navegación top-level GET con la
      // que Google vuelve al callback.
      sameSite: "lax",
      path: GOOGLE_OAUTH_COOKIE_PATH,
      maxAge: GOOGLE_OAUTH_COOKIE_MAX_AGE,
      secure: process.env.NODE_ENV === "production",
    });

    return new Response(null, { status: 303, headers: { Location: url } });
  } catch (error) {
    console.error(
      "[api/auth/google] start failed:",
      error instanceof Error ? error.message : "unknown",
    );
    // Location relativa: detrás del proxy de Railway `request.url` expone el
    // host interno (ver `app/session-expired/route.ts`).
    return new Response(null, {
      status: 303,
      headers: { Location: buildGoogleErrorPath(flow) },
    });
  }
}
