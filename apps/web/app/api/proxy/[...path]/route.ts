import { getSession } from '@/lib/auth';

const API_URL = process.env.API_URL ?? 'http://localhost:3000';

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

  const res = await fetch(`${API_URL}${backendPath}${qs}`, {
    method: request.method,
    headers,
    body,
  });

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
