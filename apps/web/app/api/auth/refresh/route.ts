import { apiFetch } from '@/lib/api';
import { getSession, setSession, clearSession } from '@/lib/auth';

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

export async function POST() {
  const session = await getSession();

  if (!session?.refreshToken) {
    await clearSession();
    return Response.json({ message: 'No session' }, { status: 401 });
  }

  try {
    const data = await apiFetch<RefreshResponse>('/auth/refresh', null, {
      method: 'POST',
      body: { refreshToken: session.refreshToken },
    });

    await setSession({
      ...session,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    });

    return Response.json({ ok: true });
  } catch {
    await clearSession();
    return Response.json({ message: 'Session expired' }, { status: 401 });
  }
}
