import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import HomeClient from "./home-client";
import DashboardLegacyPage from "./dashboard-legacy-page";

/**
 * Inicio.
 *
 * En Check-in V2 es la portada nueva del producto: programa, clientes,
 * automatizaciones, reseñas y lo que Flikker necesita del dueño. En LEGACY se
 * conserva el panel de siempre, que está armado sobre métricas y conceptos
 * (agenda, clínicas, campañas) que esos negocios sí usan.
 */
export default async function DashboardPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const context = getEffectiveApiContext(session);
  let isCheckinV2 = false;
  if (context.businessId) {
    try {
      const business = await apiFetch<{ experienceVersion?: string }>(
        "/businesses/current",
        context.accessToken,
        { businessId: context.businessId },
      );
      isCheckinV2 = business.experienceVersion === "CHECKIN_V2";
    } catch {
      // Sin dato confiable se muestra el panel de siempre.
    }
  }

  if (!isCheckinV2) return <DashboardLegacyPage {...props} />;

  return <HomeClient firstName={session.user.firstName || "de nuevo"} />;
}
