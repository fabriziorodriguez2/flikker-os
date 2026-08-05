import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, SESSION_COOKIE_MAX_AGE } from '@/lib/auth';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

/** Refresh this long before the access token actually expires. */
const REFRESH_SKEW_SECONDS = 5 * 60;

interface StoredSession {
  accessToken: string;
  refreshToken?: string;
  [key: string]: unknown;
}

function parseSession(raw: string | undefined): StoredSession | null {
  if (!raw) return null;
  try {
    // Values are written with encodeURIComponent; plain JSON is also accepted
    // for backward compatibility (decodeURIComponent is a no-op when no "%" present).
    const parsed: unknown = JSON.parse(decodeURIComponent(raw));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'accessToken' in parsed
    ) {
      return parsed as StoredSession;
    }
    return null;
  } catch {
    return null;
  }
}

/** Reads `exp` from a JWT without verifying it — the API is the one that verifies. */
function getTokenExp(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload: unknown = JSON.parse(json);
    if (
      typeof payload === 'object' &&
      payload !== null &&
      typeof (payload as { exp?: unknown }).exp === 'number'
    ) {
      return (payload as { exp: number }).exp;
    }
    return null;
  } catch {
    return null;
  }
}

function needsRefresh(session: StoredSession): boolean {
  const exp = getTokenExp(session.accessToken);
  // An unreadable token is treated as expired so we try to recover rather than
  // dropping the user at /login.
  if (exp === null) return true;
  return exp - REFRESH_SKEW_SECONDS <= Math.floor(Date.now() / 1000);
}

function redirectToLogin(request: NextRequest) {
  // Absolute URL required: the Turbopack middleware runner fails on relative ones.
  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}

function forwardHeaders(request: NextRequest, cookieOverride?: string) {
  const requestHeaders = new Headers(request.headers);
  // Forward x-forwarded-host so downstream server components can resolve
  // absolute redirect URLs (belt-and-suspenders alongside trustHostHeader).
  if (!requestHeaders.has('x-forwarded-host')) {
    const host = request.headers.get('host');
    if (host) requestHeaders.set('x-forwarded-host', host);
  }
  if (cookieOverride) requestHeaders.set('cookie', cookieOverride);
  return requestHeaders;
}

/**
 * Builds the `cookie` request header with the refreshed session, so the server
 * components rendered by *this same request* already see the new access token
 * instead of the stale one the browser sent.
 */
function buildCookieHeader(request: NextRequest, sessionValue: string): string {
  const encoded = encodeURIComponent(sessionValue);
  const others = request.cookies
    .getAll()
    .filter((cookie) => cookie.name !== SESSION_COOKIE)
    .map((cookie) => `${cookie.name}=${cookie.value}`);
  return [...others, `${SESSION_COOKIE}=${encoded}`].join('; ');
}

export async function proxy(request: NextRequest) {
  const sessionRaw = request.cookies.get(SESSION_COOKIE)?.value;
  const { pathname } = request.nextUrl;

  const isDashboard = pathname.startsWith('/dashboard');
  const session = parseSession(sessionRaw);

  // Only protect dashboard routes from unauthenticated access.
  // We intentionally do NOT redirect authenticated users away from /login —
  // that check causes an infinite redirect loop when the JWT is expired but
  // the session cookie is still present.
  //
  // We validate JSON here (not just cookie existence) so that a present-but-
  // corrupted session is caught early in the middleware rather than falling through
  // to the server-component redirect() call, which throws in the Turbopack worker.
  if (isDashboard && !session) {
    return redirectToLogin(request);
  }

  // Silent renewal: the access token is short-lived, so without this a page
  // load a few minutes later would 401 inside a server component and bounce the
  // owner to /login even though their refresh token is still perfectly valid.
  //
  // Skipped for router prefetches: those fire in parallel with the real
  // navigation, and since refreshing rotates the token, two concurrent refreshes
  // with the same token would invalidate each other.
  const isPrefetch =
    request.headers.get('next-router-prefetch') === '1' ||
    request.headers.get('purpose') === 'prefetch';

  if (
    isDashboard &&
    session?.refreshToken &&
    !isPrefetch &&
    needsRefresh(session)
  ) {
    try {
      const refreshResponse = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });

      if (!refreshResponse.ok) {
        // The refresh token is genuinely dead (logout elsewhere, password
        // change, disabled account, revoked sessions) → this is the one path
        // that ends the session.
        return redirectToLogin(request);
      }

      const tokens = (await refreshResponse.json()) as {
        accessToken: string;
        refreshToken: string;
      };
      const nextSession = JSON.stringify({
        ...session,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      });

      const response = NextResponse.next({
        request: {
          headers: forwardHeaders(
            request,
            buildCookieHeader(request, nextSession),
          ),
        },
      });
      response.cookies.set(SESSION_COOKIE, nextSession, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_COOKIE_MAX_AGE,
        secure: process.env.NODE_ENV === 'production',
      });
      return response;
    } catch {
      // Network/API hiccup: keep the session and let the request through rather
      // than logging the owner out over a transient failure.
    }
  }

  return NextResponse.next({ request: { headers: forwardHeaders(request) } });
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
