import { clearSession, getSession, setSession } from '@/lib/auth';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

/**
 * Generic proxy to the backend API.
 * Client components call /api/proxy/<path> and this handler forwards
 * the request with the session's accessToken + activeBusinessId.
 */
async function handler(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const session = await getSession();
  if (!session) {
    return Response.json({ message: 'No session' }, { status: 401 });
  }

  const { path } = await params;
  const backendPath = '/' + path.join('/');
  const url = new URL(request.url);
  const qs = url.search;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.accessToken}`,
  };

  if (session.activeBusinessId) {
    headers['x-business-id'] = session.activeBusinessId;
  }

  const body =
    request.method !== 'GET' && request.method !== 'HEAD'
      ? await request.text()
      : undefined;

  const sendRequest = (accessToken: string, businessId: string | null) => {
    const nextHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    };

    if (businessId) {
      nextHeaders['x-business-id'] = businessId;
    }

    return fetch(`${API_URL}${backendPath}${qs}`, {
      method: request.method,
      headers: nextHeaders,
      body,
    });
  };

  let res = await sendRequest(session.accessToken, session.activeBusinessId);

  if (res.status === 401 && session.refreshToken) {
    try {
      const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: session.refreshToken }),
      });

      if (!refreshRes.ok) {
        throw new Error('Session expired');
      }

      const refreshedTokens = (await refreshRes.json()) as RefreshResponse;
      const refreshedSession = {
        ...session,
        accessToken: refreshedTokens.accessToken,
        refreshToken: refreshedTokens.refreshToken,
      };

      await setSession(refreshedSession);
      res = await sendRequest(
        refreshedSession.accessToken,
        refreshedSession.activeBusinessId,
      );
    } catch {
      await clearSession();
      return Response.json({ message: 'Session expired' }, { status: 401 });
    }
  }

  if (res.status === 401) {
    await clearSession();
  }

  const data = await res.text();

  return new Response(data, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('Content-Type') ?? 'application/json' },
  });
}

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const DELETE = handler;
