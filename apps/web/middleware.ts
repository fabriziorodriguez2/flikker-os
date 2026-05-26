import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

export function middleware(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;
  const { pathname } = request.nextUrl;

  const isDashboard = pathname.startsWith('/dashboard');

  // Protect dashboard routes: unauthenticated users go to login.
  // We do NOT redirect authenticated users away from /login here — that check
  // is intentionally absent to prevent redirect loops when the JWT is expired
  // but the session cookie is still present.
  if (isDashboard && !session) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
