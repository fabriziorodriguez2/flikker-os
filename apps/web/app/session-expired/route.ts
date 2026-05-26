import { NextResponse } from 'next/server';
import { clearSession } from '@/lib/auth';

export async function GET(request: Request) {
  await clearSession();

  const url = new URL(request.url);
  // 0.0.0.0 is an invalid browser destination (Docker dev binding). Normalize to localhost.
  const hostname = url.hostname === '0.0.0.0' ? 'localhost' : url.hostname;
  const port = url.port ? `:${url.port}` : '';
  const loginUrl = new URL(`${url.protocol}//${hostname}${port}/login`);
  loginUrl.searchParams.set('reason', 'session_expired');

  return NextResponse.redirect(loginUrl);
}
