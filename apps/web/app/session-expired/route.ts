import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/auth';

export async function GET(request: Request) {
  await clearSession();

  const url = new URL(request.url);
  const loginUrl = new URL('/login', url.origin);
  loginUrl.searchParams.set('reason', 'session_expired');

  return NextResponse.redirect(loginUrl);
}
