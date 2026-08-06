import { cookies } from "next/headers";

/**
 * httpOnly cookie holding the opaque check-in session token. The raw token is
 * never exposed to client JS and never placed in a URL — the browser only ever
 * sees this httpOnly cookie; the web layer forwards it to the API as a header.
 */
export const CHECKIN_COOKIE = "flk_cs";

const MAX_AGE_SECONDS = 60 * 60 * 24 * 180; // 180 days — survives browser restarts

export async function setCheckinCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(CHECKIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
    secure: process.env.NODE_ENV === "production",
  });
}

export async function getCheckinToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(CHECKIN_COOKIE)?.value ?? null;
}

export async function clearCheckinCookie(): Promise<void> {
  const store = await cookies();
  store.delete(CHECKIN_COOKIE);
}
