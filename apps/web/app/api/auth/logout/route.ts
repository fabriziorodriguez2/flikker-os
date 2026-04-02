import { apiFetch } from '@/lib/api';
import { getSession, clearSession } from '@/lib/auth';

export async function POST() {
  const session = await getSession();

  if (session?.refreshToken) {
    try {
      await apiFetch('/auth/logout', session.accessToken, {
        method: 'POST',
        body: { refreshToken: session.refreshToken },
      });
    } catch {
      // Best-effort: clear cookie even if backend call fails
    }
  }

  await clearSession();
  return Response.json({ ok: true });
}
