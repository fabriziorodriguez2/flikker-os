import { redirect } from "next/navigation";
import { getSession, type Session } from "@/lib/auth";
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
/**
 * Extraído de `redirectIfAbsorbed` (pedido explícito, Insights): la MISMA
 * regla — incluida la excepción de impersonation — pero como pregunta en
 * vez de como redirect, para que una pantalla como `/dashboard/insights`
 * pueda decidir "¿le muestro la versión Check-in V2 o la LEGACY?" sin tener
 * que redirigir a otro lado primero. Nunca cambia el comportamiento de las
 * rutas que ya usan `redirectIfAbsorbed` (Retention V2, Check-ins
 * técnicos): siguen redirigiendo exactamente igual que antes.
 */
export async function isCheckinV2Business(
  session: Session | null,
): Promise<boolean> {
  if (!session) return false;
  // El operador de plataforma conserva la vista LEGACY/interna mientras
  // impersona — mismo criterio que `redirectIfAbsorbed`.
  if (session.impersonation) return false;

  const businessId = session.activeBusinessId;
  if (!businessId) return false;

  try {
    const business = await apiFetch<{ experienceVersion?: string }>(
      "/businesses/current",
      session.accessToken,
      { businessId },
    );
    return business.experienceVersion === "CHECKIN_V2";
  } catch {
    // Sin información confiable, se trata como LEGACY: es preferible
    // mostrar la pantalla vieja que mandar a alguien a un lugar que quizá
    // no le sirve (mismo criterio que `redirectIfAbsorbed`).
    return false;
  }
}

export async function redirectIfAbsorbed(destination: string): Promise<void> {
  const session = await getSession();
  if (!session) redirect("/login");

  const shouldRedirect = await isCheckinV2Business(session);

  // FUERA del try/if interno a propósito: `redirect()` funciona lanzando
  // una excepción especial que Next intercepta — un `catch` alrededor se
  // la comería y el redirect no ocurriría nunca. `isCheckinV2Business` ya
  // no tiene ningún `try` propio expuesto acá, así que esto es seguro.
  if (shouldRedirect) redirect(destination);
}
