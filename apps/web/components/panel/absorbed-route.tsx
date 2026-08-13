import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

/**
 * Rutas absorbidas por las secciones nuevas.
 *
 * Ninguna de estas pantallas se borró: siguen existiendo, siguen funcionando y
 * siguen siendo las que usa un negocio LEGACY. Lo único que cambia es que un
 * dueño en Check-in V2 ya no llega a ellas por navegación, y si entra por un
 * link viejo guardado en el navegador no se come un 404 — lo llevamos a donde
 * vive ahora esa información.
 *
 * Dos excepciones deliberadas, y son la razón de que esto sea un helper y no
 * cinco redirects sueltos:
 *
 *  1. **LEGACY nunca redirige.** Para esos negocios estas rutas SON el
 *     producto. Redirigirlos sería romperles el panel.
 *  2. **Impersonation nunca redirige.** Cuando un operador de Flikker entra a
 *     un negocio necesita ver Retention V2, Check-ins técnicos e Insights tal
 *     como están. Separar la UI de producto de las herramientas internas es
 *     justamente el punto: el dueño no las ve, nosotros no las perdemos.
 */
export async function redirectIfAbsorbed(destination: string): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  // El operador de plataforma conserva acceso completo mientras impersona.
  if (session.impersonation) return;

  const businessId = session.activeBusinessId;
  if (!businessId) return;

  let isCheckinV2 = false;
  try {
    const business = await apiFetch<{ experienceVersion?: string }>(
      "/businesses/current",
      session.accessToken,
      { businessId },
    );
    isCheckinV2 = business.experienceVersion === "CHECKIN_V2";
  } catch {
    // Sin información confiable no se redirige: es preferible mostrar la
    // pantalla vieja que mandar a alguien a un lugar que quizá no le sirve.
  }

  // FUERA del try a propósito: `redirect()` funciona lanzando una excepción
  // especial que Next intercepta. Adentro, el `catch` se la comería y el
  // redirect no ocurriría nunca.
  if (isCheckinV2) redirect(destination);
}
