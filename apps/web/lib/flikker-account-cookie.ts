import { cookies } from "next/headers";

/**
 * httpOnly cookie for the GLOBAL "Mi Flikker" session — deliberately a
 * different name and a different TTL from `flk_cs` (the per-business
 * check-in cookie in `checkin-cookie.ts`). The two are unrelated trust
 * boundaries: this one can read a customer's data across every business they
 * have visited, so it is never reused, widened, or confused with the
 * business-scoped one (Fase E §21).
 */
export const FLIKKER_ACCOUNT_COOKIE = "flk_account";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days — matches FLIKKER_ACCOUNT_SESSION_TTL_DAYS

export async function setFlikkerAccountCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(FLIKKER_ACCOUNT_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function getFlikkerAccountToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(FLIKKER_ACCOUNT_COOKIE)?.value ?? null;
}

export async function clearFlikkerAccountCookie(): Promise<void> {
  const store = await cookies();
  store.delete(FLIKKER_ACCOUNT_COOKIE);
}
