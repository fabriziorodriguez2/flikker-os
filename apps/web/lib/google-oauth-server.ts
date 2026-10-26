import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { GoogleOAuthFlow } from "@/lib/google-oauth";

/** Solo server (route handlers): usa `crypto` de Node. */

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function createGoogleOAuthFlow(
  input: Pick<GoogleOAuthFlow, "pendingUpgradePlan" | "next" | "origin">,
): { flow: GoogleOAuthFlow; codeChallenge: string } {
  const codeVerifier = randomToken();
  return {
    flow: {
      state: randomToken(),
      nonce: randomToken(),
      codeVerifier,
      ...input,
    },
    // PKCE S256 (RFC 7636).
    codeChallenge: createHash("sha256").update(codeVerifier).digest("base64url"),
  };
}

/** Comparación en tiempo constante del state anti-CSRF. */
export function googleStatesMatch(
  expected: string,
  received: string | null,
): boolean {
  if (!received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}
