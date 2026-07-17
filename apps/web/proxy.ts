import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

/** Returns true only when the raw cookie value decodes to a valid session JSON. */
function hasValidSession(raw: string | undefined): boolean {
  if (!raw) return false;
  try {
    // Values are written with encodeURIComponent; plain JSON is also accepted
    // for backward compatibility (decodeURIComponent is a no-op when no "%" present).
    const parsed = JSON.parse(decodeURIComponent(raw));
    return typeof parsed === 'object' && parsed !== null && 'accessToken' in parsed;
  } catch {
    return false;
  }
}

export function proxy(request: NextRequest) {
  const sessionRaw = request.cookies.get(SESSION_COOKIE)?.value;
  const { pathname } = request.nextUrl;

  const isDashboard = pathname.startsWith('/dashboard');

  // Only protect dashboard routes from unauthenticated access.
  // We intentionally do NOT redirect authenticated users away from /login —
  // that check causes an infinite redirect loop when the JWT is expired but
  // the session cookie is still present.
  //
  // We validate JSON here (not just cookie existence) so that a present-but-
  // corrupted session is caught early in the middleware rather than falling through
  // to the server-component redirect() call, which throws in the Turbopack worker.
  if (isDashboard && !hasValidSession(sessionRaw)) {
    // Must use an absolute URL: the Turbopack middleware runner (tv()) calls
    // new U(Location, { headers, nextConfig }) which fails on relative URLs
    // because it tries new URL('/login', undefined) → TypeError: Invalid URL.
    // request.url is always absolute in the middleware context.
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Forward x-forwarded-host so downstream server components can resolve
  // absolute redirect URLs (belt-and-suspenders alongside trustHostHeader).
  const requestHeaders = new Headers(request.headers);
  if (!requestHeaders.has('x-forwarded-host')) {
    const host = request.headers.get('host');
    if (host) requestHeaders.set('x-forwarded-host', host);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
