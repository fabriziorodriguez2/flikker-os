import { redirect } from "next/navigation";
import { isUnauthorizedApiError } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import { getCurrentBusiness } from "@/lib/current-business";
import BusinessLoadError from "@/components/ui/business-load-error";
import HomeClient from "./home-client";
import DashboardLegacyPage from "./dashboard-legacy-page";

/**
 * Inicio.
 *
 * En Check-in V2 es la portada nueva del producto: programa, clientes,
 * automatizaciones, reseñas y lo que Flikker necesita del dueño. En LEGACY se
 * conserva el panel de siempre, que está armado sobre métricas y conceptos
 * (agenda, clínicas, campañas) que esos negocios sí usan.
 *
 * Resuelve `experienceVersion` llamando a `getCurrentBusiness` (mismo helper
 * que usa `(panel)/layout.tsx` un nivel arriba, memoizado por request con
 * `React.cache` — PERF: antes esto era un `apiFetch` propio e independiente,
 * confirmado con logging de requests como una segunda llamada real a
 * `/businesses/current` en cada navegación a Inicio). Comparte la misma
 * protección de siempre: si esa llamada falla (ej. un 500 real de la API),
 * la excepción compartida NUNCA debe traducirse en silencio a "entonces es
 * LEGACY". Eso fue exactamente la causa de un bug real — `/businesses/
 * current` fallando por una migración pendiente hacía caer este panel al
 * `DashboardLegacyPage` (con sus gráficos de Recharts) para un negocio
 * CHECKIN_V2 real.
 */
export default async function DashboardPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const context = getEffectiveApiContext(session);
  let experienceVersion: string | undefined;
  let loadFailed = false;

  if (context.businessId) {
    try {
      const business = await getCurrentBusiness(
        context.accessToken,
        context.businessId,
      );
      experienceVersion = business.experienceVersion;
    } catch (error) {
      // 401 real: dejamos que el layout (que hace el mismo fetch) resuelva
      // la sesión vencida — acá solo evitamos adivinar una experiencia.
      if (!isUnauthorizedApiError(error)) loadFailed = true;
    }
  }

  if (loadFailed) return <BusinessLoadError />;

  const isCheckinV2 = experienceVersion === "CHECKIN_V2";

  if (!isCheckinV2) return <DashboardLegacyPage {...props} />;

  return <HomeClient firstName={session.user.firstName || "de nuevo"} />;
}
