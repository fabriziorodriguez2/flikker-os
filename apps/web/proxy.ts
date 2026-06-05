import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

export function proxy(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  const { pathname } = request.nextUrl;

  const isDashboard = pathname.startsWith('/dashboard');

  // Only protect dashboard routes from unauthenticated access.
  // We intentionally do NOT redirect authenticated users away from /login —
  // that check causes an infinite redirect loop when the JWT is expired but
  // the session cookie is still present.
  if (isDashboard && !session) {
    // Relative Location → the browser resolves against the public origin it
    // actually navigated to. Avoids leaking the internal Railway host/port
    // when running behind a reverse proxy.
    return new NextResponse(null, {
      status: 307,
      headers: { Location: '/login' },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
