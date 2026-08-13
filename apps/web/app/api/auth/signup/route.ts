import { apiFetch, ApiError } from "@/lib/api";
import { setSession, type Session } from "@/lib/auth";

interface SignupResponse {
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

/**
 * Alta self-service. Espeja `/api/auth/login` salvo por el destino: acá el
 * usuario recién creado NO tiene nada configurado, así que va a `/comenzar` y
 * no al panel. El guard de `(panel)/layout.tsx` sostiene la misma regla si
 * intenta entrar al dashboard a mano.
 *
 * `POST /auth/signup` de la API ya crea el negocio del dueño. Ese negocio
 * queda con `onboardingCompletedAt` nulo, que es exactamente lo que el wizard
 * busca como borrador para adoptar en el paso 1 — no se crea un segundo.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    password?: string;
    businessName?: string;
  } | null;

  if (!body?.email || !body?.password || !body?.businessName) {
    return Response.json(
      { message: "Completá email, contraseña y nombre del negocio" },
      { status: 400 },
    );
  }

  if (body.password.length < 8) {
    return Response.json(
      { message: "La contraseña necesita al menos 8 caracteres" },
      { status: 400 },
    );
  }

  try {
    const data = await apiFetch<SignupResponse>("/auth/signup", null, {
      method: "POST",
      body: {
        email: body.email,
        password: body.password,
        businessName: body.businessName,
        // El rubro real se elige en el paso 1 del wizard y se guarda en
        // `Business.industry`. `vertical` es el campo del alta asistida vieja,
        // cuya lista (dental/fisio/…) no aplica a este flujo.
        vertical: "otro",
      },
    });

    const session: Session = {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      user: data.user,
      // Mismo recorte que en login: logoUrl no entra en la cookie.
      memberships: data.memberships.map((m) => ({
        businessId: m.businessId,
        role: m.role,
        business: { name: m.business.name, slug: m.business.slug },
      })),
      activeBusinessId: data.memberships[0]?.businessId ?? null,
    };

    await setSession(session);

    return Response.json({ ok: true, redirectTo: "/comenzar" });
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      return Response.json(
        { message: "Ya existe una cuenta con ese email" },
        { status: 409 },
      );
    }
    return Response.json(
      { message: "No pudimos crear tu cuenta. Probá de nuevo." },
      { status: 500 },
    );
  }
}
