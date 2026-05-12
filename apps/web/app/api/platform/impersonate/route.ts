import { getSession, setSession } from "@/lib/auth";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

interface ImpersonationResponse {
  accessToken: string;
  business: {
    id: string;
    name: string;
    slug: string;
  };
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ message: "No hay sesión activa" }, { status: 401 });
  }

  if (!session.user.isPlatformAdmin) {
    return Response.json(
      { message: "Se requiere usuario administrador" },
      { status: 403 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    businessId?: string;
  } | null;

  if (!body?.businessId) {
    return Response.json({ message: "Falta el negocio" }, { status: 400 });
  }

  const response = await fetch(
    `${API_URL}/platform/businesses/${encodeURIComponent(body.businessId)}/impersonate`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return Response.json(
      { message: error.message ?? "No se pudo operar como negocio" },
      { status: response.status },
    );
  }

  const data = (await response.json()) as ImpersonationResponse;
  await setSession({
    ...session,
    activeBusinessId: data.business.id,
    impersonation: {
      accessToken: data.accessToken,
      businessId: data.business.id,
      businessName: data.business.name,
      businessSlug: data.business.slug,
      startedAt: new Date().toISOString(),
    },
  });

  return Response.json({ ok: true, business: data.business });
}
