const API_URL = process.env.API_URL ?? "http://localhost:3000";

/** Starts profile recovery — forwards the phone; the API sends the code by WhatsApp. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await request.text();

  const res = await fetch(
    `${API_URL}/public/checkin/${encodeURIComponent(token)}/recover/start`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
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
