import { getCheckinToken } from "@/lib/checkin-cookie";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/**
 * Return check-in via the persistent session cookie. A 401 means the session is
 * not recognized — the client then falls back to the first-visit form.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const session = await getCheckinToken();

  const res = await fetch(
    `${API_URL}/public/checkin/${encodeURIComponent(token)}/checkin`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { "x-flikker-session": session } : {}),
      },
    },
  );

  const data = await res.text();
  return new Response(data, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
    },
  });
}
