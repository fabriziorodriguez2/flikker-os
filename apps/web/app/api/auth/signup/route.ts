import { apiFetch, ApiError } from "@/lib/api";

interface SignupResponse {
  message: string;
  email: string;
}

/**
 * Alta self-service. Ya NO crea negocio ni arranca sesión — la API crea
 * solo el usuario (sin confirmar) y manda el correo de verificación. La
 * sesión arranca recién en `/api/auth/verify-email`, cuando el dueño
 * confirma que el correo es suyo.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  } | null;

  if (!body?.name || !body?.email || !body?.password || !body?.confirmPassword) {
    return Response.json(
      { message: "Completá nombre, email, contraseña y su confirmación" },
      { status: 400 },
    );
  }

  if (body.password.length < 8) {
    return Response.json(
      { message: "La contraseña necesita al menos 8 caracteres" },
      { status: 400 },
    );
  }

  if (body.password !== body.confirmPassword) {
    return Response.json(
      { message: "Las contraseñas no coinciden" },
      { status: 400 },
    );
  }

  try {
    const data = await apiFetch<SignupResponse>("/auth/signup", null, {
      method: "POST",
      body: {
        name: body.name,
        email: body.email,
        password: body.password,
        confirmPassword: body.confirmPassword,
      },
    });

    return Response.json({ ok: true, message: data.message, email: data.email });
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
