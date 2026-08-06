import { setFlikkerAccountCookie } from "@/lib/flikker-account-cookie";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

interface VerifyResponse {
  rawToken?: string;
  flikkerAccountId?: string;
  [key: string]: unknown;
}

/**
 * On success the API returns a raw session token; it is moved into an
 * httpOnly cookie here and stripped from the body, same pattern as the
 * check-in registration route — the token never reaches client JS.
 */
export async function POST(request: Request) {
  const body = await request.text();
  const res = await fetch(`${API_URL}/public/flikker-account/verify/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "user-agent": request.headers.get("user-agent") ?? "",
    },
    body,
  });

  const data = (await res.json().catch(() => null)) as VerifyResponse | null;

  if (res.ok && typeof data?.rawToken === "string") {
    await setFlikkerAccountCookie(data.rawToken);
    const { rawToken: _drop, ...safe } = data;
    void _drop;
    return Response.json(safe, { status: 200 });
  }

  return Response.json(data ?? {}, { status: res.status });
}
