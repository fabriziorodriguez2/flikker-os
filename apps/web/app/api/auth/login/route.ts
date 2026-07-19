import { apiFetch, ApiError } from "@/lib/api";
import { setSession, type Session } from "@/lib/auth";

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    isPlatformAdmin?: boolean;
  };
  memberships: {
    businessId: string;
    role: string;
    business: { name: string; slug: string };
  }[];
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  if (!body?.email || !body?.password) {
    return Response.json(
      { message: "Email y contraseña requeridos" },
      { status: 400 },
    );
  }

  try {
    const data = await apiFetch<LoginResponse>("/auth/login", null, {
      method: "POST",
      body: { email: body.email, password: body.password },
    });

    const session: Session = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
      // Strip logoUrl: Cloud Storage signed URLs are hundreds of chars long and
      // push the cookie over the 4096-byte browser limit, causing it to be silently
      // rejected. The layout fetches logoUrl fresh from /businesses/current anyway.
      memberships: data.memberships.map((m) => ({
        businessId: m.businessId,
        role: m.role,
        business: { name: m.business.name, slug: m.business.slug },
      })),
      activeBusinessId:
        data.memberships.length === 1 ? data.memberships[0].businessId : null,
    };

    await setSession(session);

    return Response.json({
      ok: true,
      redirectTo: data.user.isPlatformAdmin ? "/platform" : "/dashboard",
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return Response.json(
        { message: "Email o contraseña incorrectos" },
        { status: 401 },
      );
    }
    console.error("[api/auth/login]", err);
    return Response.json(
      { message: "Error al iniciar sesión" },
      { status: 500 },
    );
  }
}
