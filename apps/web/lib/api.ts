const API_URL = process.env.API_URL ?? 'http://localhost:3000';

type FetchOptions = Omit<RequestInit, 'body'> & { body?: unknown };

function buildApiBaseCandidates(baseUrl: string) {
  const candidates = [baseUrl];

  if (baseUrl.includes('localhost')) {
    candidates.push(baseUrl.replace('localhost', '127.0.0.1'));
  } else if (baseUrl.includes('127.0.0.1')) {
    candidates.push(baseUrl.replace('127.0.0.1', 'localhost'));
  }

  return [...new Set(candidates)];
}

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

  const requestInit: RequestInit = {
    ...rest,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  };

  let res: Response | null = null;
  let lastError: unknown;

  for (const baseUrl of buildApiBaseCandidates(API_URL)) {
    try {
      res = await fetch(`${baseUrl}${path}`, requestInit);
      break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!res) {
    if (lastError instanceof Error) throw lastError;
    throw new Error('No se pudo conectar con la API');
  }

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

export function isUnauthorizedApiError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401;
}
