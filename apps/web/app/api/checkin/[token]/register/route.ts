import { setCheckinCookie } from "@/lib/checkin-cookie";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

interface RegisterResponse {
  status?: string;
  sessionToken?: string;
  [key: string]: unknown;
}

/**
 * First-visit registration. On a successful new registration the API returns a
 * raw session token; we move it into an httpOnly cookie and strip it from the
 * body so it never reaches client JS.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await request.text();

  const res = await fetch(
    `${API_URL}/public/checkin/${encodeURIComponent(token)}/register`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "user-agent": request.headers.get("user-agent") ?? "",
      },
      body,
    },
  );

  const data = (await res.json().catch(() => null)) as RegisterResponse | null;

  if (
    res.ok &&
    data?.status === "registered" &&
    typeof data.sessionToken === "string"
  ) {
    await setCheckinCookie(data.sessionToken);
    const { sessionToken: _drop, ...safe } = data;
    void _drop;
    return Response.json(safe, { status: 200 });
  }

  return Response.json(data ?? {}, { status: res.status });
}
