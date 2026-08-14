import { apiFetch } from "@/lib/api";
import { getSession, setSession } from "@/lib/auth";

interface MembershipsResponse {
  businessId: string;
  role: string;
  business: { name: string; slug: string; status: string; logoUrl?: string | null };
}

/**
 * Re-sincroniza `session.memberships`/`activeBusinessId` con lo que la API
 * tiene HOY. Hace falta porque el negocio del onboarding self-service ya no
 * se crea en el signup (ver `AuthRepository.createUnverifiedUser`): se crea
 * recién en el paso 1 de `/comenzar`, así que la sesión que arrancó en la
 * confirmación de email todavía no lo conoce.
 *
 * El wizard llama a esto después del paso 1 y otra vez al terminar, para que
 * `activeBusinessId` esté listo antes de aterrizar en `/dashboard` — sin
 * esto el guard del panel mostraría el selector de negocios en vez del panel
 * directamente.
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return Response.json({ message: "No hay sesión activa" }, { status: 401 });
  }

  try {
    const memberships = await apiFetch<MembershipsResponse[]>(
      "/auth/memberships",
      session.accessToken,
    );

    const nextActiveBusinessId =
      memberships.find((m) => m.businessId === session.activeBusinessId)
        ?.businessId ??
      (memberships.length === 1 ? memberships[0].businessId : null);

    await setSession({
      ...session,
      memberships: memberships.map((m) => ({
        businessId: m.businessId,
        role: m.role,
        business: { name: m.business.name, slug: m.business.slug },
      })),
      activeBusinessId: nextActiveBusinessId,
    });

    return Response.json({ ok: true, activeBusinessId: nextActiveBusinessId });
  } catch {
    return Response.json(
      { message: "No pudimos actualizar la sesión" },
      { status: 500 },
    );
  }
}
