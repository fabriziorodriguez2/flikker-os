import { getSession, setSession } from "@/lib/auth";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

export async function POST() {
  const session = await getSession();
  if (!session) {
    return Response.json({ message: "No session" }, { status: 401 });
  }

  await fetch(`${API_URL}/platform/exit-impersonation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": "application/json",
    },
  }).catch(() => null);

  await setSession({
    ...session,
    activeBusinessId: session.memberships[0]?.businessId ?? null,
    impersonation: null,
  });

  return Response.json({ ok: true });
}
