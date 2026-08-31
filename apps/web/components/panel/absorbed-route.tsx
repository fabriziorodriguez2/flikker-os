import { redirect } from "next/navigation";
import { getEffectiveApiContext, getSession, type Session } from "@/lib/auth";
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
 * El chequeo real de `experienceVersion` — sin ninguna opinión sobre
 * impersonation. Cada uno de los dos exports de abajo decide POR SU CUENTA
 * si la excepción de impersonation aplica o no, porque no es la misma
 * pregunta en los dos casos (ver el comentario de cada uno).
 *
 * `getEffectiveApiContext` NO es opcional acá (bug real corregido — el fix
 * anterior sacó el gate de impersonation pero dejó esta parte leyendo la
 * sesión cruda, así que siguió mostrando LEGACY): impersonando,
 * `session.accessToken` sigue siendo el token DEL ADMIN, y `TenantGuard`
 * exige una Membership activa en ese negocio para cualquier token que no
 * sea de impersonation. El admin no es miembro del negocio de su cliente,
 * así que la llamada volvía 403 → `catch` → `false` → Insights LEGACY. El
 * token de impersonation vive aparte, en `session.impersonation`, y es el
 * único que `TenantGuard` acepta para ese negocio.
 *
 * Sin impersonation, `getEffectiveApiContext` devuelve exactamente
 * `{ accessToken: session.accessToken, businessId: session.activeBusinessId }`
 * — o sea, para `isCheckinV2Business`/`redirectIfAbsorbed` (que ya cortan
 * antes si hay impersonation) el comportamiento no cambia en nada.
 */
async function fetchIsCheckinV2(session: Session): Promise<boolean> {
  const { accessToken, businessId } = getEffectiveApiContext(session);
  if (!businessId) return false;

  try {
    const business = await apiFetch<{ experienceVersion?: string }>(
      "/businesses/current",
      accessToken,
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

/**
 * Para `redirectIfAbsorbed` — decide si una ruta VIEJA (Retention V2,
 * Check-ins técnicos, Beneficios standalone, Campañas) debe mandar a un
 * dueño real de Check-in V2 a su nuevo hogar. Acá la excepción de
 * impersonation es intencional y se mantiene: un operador de Flikker que
 * impersona necesita la herramienta interna cruda tal como está, no la
 * versión consolidada que ve el dueño — son pantallas de soporte/config,
 * nunca las ve un dueño V2 real de todos modos.
 */
export async function isCheckinV2Business(
  session: Session | null,
): Promise<boolean> {
  if (!session) return false;
  if (session.impersonation) return false;
  return fetchIsCheckinV2(session);
}

/**
 * Para decidir QUÉ EXPERIENCIA DE PRODUCTO mostrar (hoy: Insights) — a
 * diferencia de `isCheckinV2Business`, acá la impersonation NO fuerza
 * LEGACY (pedido explícito, auditoría de caso real: un Platform Admin
 * impersonando un negocio Check-in V2 tiene que ver EXACTAMENTE lo mismo
 * que vería su dueño, para poder soportarlo/probarlo de verdad). La
 * distinción con `isCheckinV2Business` es a propósito: esa función protege
 * herramientas internas que un dueño real nunca ve; esta protege la
 * experiencia de producto que si ve.
 */
export async function isCheckinV2Experience(
  session: Session | null,
): Promise<boolean> {
  if (!session) return false;
  return fetchIsCheckinV2(session);
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
