import { getCheckinToken } from "@/lib/checkin-cookie";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

/** Returns the current customer's personal space, or 401 when not recognized. */
export async function GET() {
  const session = await getCheckinToken();
  if (!session) {
    return Response.json({ message: "No session" }, { status: 401 });
  }

  const res = await fetch(`${API_URL}/public/checkin/session`, {
    method: "GET",
    headers: { "x-flikker-session": session },
  });

  const data = await res.text();
  return new Response(data, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
    },
  });
}
