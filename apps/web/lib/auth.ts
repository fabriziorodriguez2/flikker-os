import { cookies } from "next/headers";

export const SESSION_COOKIE = "flikker_session";

export interface SessionUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isPlatformAdmin?: boolean;
}

export interface SessionMembership {
  businessId: string;
  role: string;
  business: { name: string; slug: string; logoUrl?: string | null };
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: SessionUser;
  memberships: SessionMembership[];
  activeBusinessId: string | null;
  impersonation?: {
    accessToken: string;
    businessId: string;
    businessName: string;
    businessSlug: string;
    startedAt: string;
  } | null;
}

export function getEffectiveApiContext(session: Session): {
  accessToken: string;
  businessId: string | null;
} {
  if (session.impersonation) {
    return {
      accessToken: session.impersonation.accessToken,
      businessId: session.impersonation.businessId,
    };
  }

  return {
    accessToken: session.accessToken,
    businessId: session.activeBusinessId,
  };
}

/** Lee la sesion desde la cookie. Solo valido en Server Components y Route Handlers. */
export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  try {
    // Values are stored URL-encoded (see setSession). Older sessions stored as
    // raw JSON don't contain "%" so decodeURIComponent is a safe no-op for them.
    const json = decodeURIComponent(raw);
    return JSON.parse(json) as Session;
  } catch {
    return null;
  }
}

/** Escribe la sesion en la cookie. Solo valido en Route Handlers y Server Actions. */
export async function setSession(session: Session): Promise<void> {
  const cookieStore = await cookies();
  // URL-encode the JSON so the cookie value is pure ASCII.  Non-ASCII bytes
  // (e.g. accented chars in user names) can be corrupted by HTTP/1.1 → HTTP/2
  // header conversion at Railway's edge proxy, producing invalid JSON on read.
  cookieStore.set(SESSION_COOKIE, encodeURIComponent(JSON.stringify(session)), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });
}

/** Borra la cookie de sesion. */
export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
