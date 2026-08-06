import { setCheckinCookie } from "@/lib/checkin-cookie";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

interface VerifyResponse {
  status?: string;
  sessionToken?: string;
  [key: string]: unknown;
}

/**
 * Completes recovery. On success the API returns a raw session token which we
 * move into the httpOnly cookie and strip from the response body.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await request.text();

  const res = await fetch(
    `${API_URL}/public/checkin/${encodeURIComponent(token)}/recover/verify`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "user-agent": request.headers.get("user-agent") ?? "",
      },
      body,
    },
  );

  const data = (await res.json().catch(() => null)) as VerifyResponse | null;

  if (
    res.ok &&
    data?.status === "restored" &&
    typeof data.sessionToken === "string"
  ) {
    await setCheckinCookie(data.sessionToken);
    const { sessionToken: _drop, ...safe } = data;
    void _drop;
    return Response.json(safe, { status: 200 });
  }

  return Response.json(data ?? {}, { status: res.status });
}
