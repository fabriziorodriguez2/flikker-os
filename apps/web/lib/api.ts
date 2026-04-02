const API_URL = process.env.API_URL ?? 'http://localhost:3000';

type FetchOptions = Omit<RequestInit, 'body'> & { body?: unknown };

/** Fetch hacia el backend con Bearer token y tenant header opcionales. Uso server-side. */
export async function apiFetch<T>(
  path: string,
  accessToken: string | null,
  options: FetchOptions & { businessId?: string } = {},
): Promise<T> {
  const { body, headers: extraHeaders, businessId, ...rest } = options;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(extraHeaders as Record<string, string>),
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  if (businessId) {
    headers['x-business-id'] = businessId;
  }

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, error?.message ?? res.statusText);
  }

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
