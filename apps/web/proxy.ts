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
  // corrupted session is caught early and handled via NextResponse — which uses
  // a relative Location and never calls new URL() — rather than falling through
  // to the server-component redirect() call that throws in some Turbopack builds.
  if (isDashboard && !hasValidSession(sessionRaw)) {
    // Relative Location → the browser resolves against the public origin it
    // actually navigated to. Avoids leaking the internal Railway host/port
    // when running behind a reverse proxy.
    return new NextResponse(null, {
      status: 307,
      headers: { Location: '/login' },
    });
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
