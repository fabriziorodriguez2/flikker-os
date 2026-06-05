import { clearSession } from '@/lib/auth';

export async function GET() {
  await clearSession();

  // Use a relative Location header so the browser resolves it against the
  // public origin (e.g. https://flikker.site) instead of the internal Railway
  // host/port that `request.url` exposes when behind a reverse proxy.
  return new Response(null, {
    status: 307,
    headers: { Location: '/login?reason=session_expired' },
  });
}
