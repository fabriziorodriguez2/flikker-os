import { getFlikkerAccountToken } from "@/lib/flikker-account-cookie";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ businessId: string }> },
) {
  const { businessId } = await params;
  const session = await getFlikkerAccountToken();
  if (!session)
    return Response.json({ message: "No session" }, { status: 401 });
  const cursor = new URL(request.url).searchParams.get("cursor");
  const query = cursor ? `?${new URLSearchParams({ cursor })}` : "";
  const res = await fetch(
    `${API_URL}/public/my-flikker/${encodeURIComponent(businessId)}/activity${query}`,
    {
      headers: { "x-flikker-account-session": session },
      cache: "no-store",
    },
  );
  return new Response(await res.text(), {
    status: res.status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "private, no-store",
    },
  });
}
