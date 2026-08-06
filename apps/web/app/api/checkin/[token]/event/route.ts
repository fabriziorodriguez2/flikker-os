import { getCheckinToken } from "@/lib/checkin-cookie";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/** Forwards a client timeline event (review prompt shown / link clicked / benefit viewed). */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const body = await request.text();
  const session = await getCheckinToken();

  const res = await fetch(
    `${API_URL}/public/checkin/${encodeURIComponent(token)}/event`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session ? { "x-flikker-session": session } : {}),
      },
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
