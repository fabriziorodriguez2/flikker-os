const API_URL = process.env.API_URL ?? "http://localhost:3000";

export async function POST(request: Request) {
  const body = await request.text();
  const res = await fetch(`${API_URL}/public/flikker-account/verify/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const data = await res.json().catch(() => ({}));
  return Response.json(data, { status: res.status });
}
