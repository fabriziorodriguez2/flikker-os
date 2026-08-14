import { apiFetch, ApiError } from "@/lib/api";
import { setSession, type Session } from "@/lib/auth";

interface VerifyEmailResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName?: string;
    isPlatformAdmin?: boolean;
  };
  memberships: {
    businessId: string;
    role: string;
    business: { name: string; slug: string };
  }[];
}

/**
 * Confirma el correo y arranca la sesión — es el único punto donde una
 * cuenta recién creada pasa a poder entrar al producto. Sin memberships
 * (usuario recién verificado, sin negocio todavía) `activeBusinessId` queda
 * en null: el paso 1 de `/comenzar` crea el negocio y deja la sesión lista.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    token?: string;
  } | null;

  if (!body?.token) {
    return Response.json({ message: "Falta el token" }, { status: 400 });
  }

  try {
    const data = await apiFetch<VerifyEmailResponse>(
      "/auth/verify-email",
      null,
      { method: "POST", body: { token: body.token } },
    );

    const session: Session = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: {
        id: data.user.id,
        email: data.user.email,
        firstName: data.user.firstName,
        lastName: data.user.lastName ?? "",
        isPlatformAdmin: data.user.isPlatformAdmin,
      },
      memberships: data.memberships.map((m) => ({
        businessId: m.businessId,
        role: m.role,
        business: { name: m.business.name, slug: m.business.slug },
      })),
      activeBusinessId:
        data.memberships.length === 1 ? data.memberships[0].businessId : null,
    };

    await setSession(session);

    return Response.json({ ok: true, redirectTo: "/comenzar" });
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) {
      return Response.json(
        { message: "El enlace no es válido o ya venció" },
        { status: 400 },
      );
    }
    return Response.json(
      { message: "No pudimos confirmar tu cuenta. Probá de nuevo." },
      { status: 500 },
    );
  }
}
