import { getFlikkerAccountToken } from "@/lib/flikker-account-cookie";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await params;
  const session = await getFlikkerAccountToken();
  if (!session) {
    return Response.json({ message: "No session" }, { status: 401 });
  }

  const res = await fetch(
    `${API_URL}/public/my-flikker/${encodeURIComponent(businessId)}`,
    {
      method: "GET",
      headers: { "x-flikker-account-session": session },
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
