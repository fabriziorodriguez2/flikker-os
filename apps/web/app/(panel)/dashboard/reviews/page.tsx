import { redirect } from "next/navigation";
import { isUnauthorizedApiError } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
import { getCurrentBusiness } from "@/lib/current-business";
import BusinessLoadError from "@/components/ui/business-load-error";
import ReviewsClient from "./reviews-client";
import ReviewsLegacyPage from "./reviews-legacy-page";

/**
 * Reseñas.
 *
 * Vuelve a bifurcar por versión, igual que QR y NFC, Clientes e Inicio: un
 * negocio LEGACY conserva la pantalla de siempre (lista con filtros por
 * estrellas y paginación propia, `ReviewsLegacyPage`), y Check-in V2 usa la
 * pantalla nueva (`ReviewsClient`) con feedback privado, embudo y "conseguí
 * más reseñas".
 *
 * Hubo una versión intermedia sin esta bifurcación — un negocio LEGACY veía
 * la pantalla nueva igual, con sus bloques V2 ocultos. Eso rompía la
 * consistencia visual del panel LEGACY (esta pantalla es la única que se
 * salía del diseño de siempre), así que se separó como el resto.
 */
export default async function ReviewsPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const context = getEffectiveApiContext(session);
  let experienceVersion: string | undefined;
  let loadFailed = false;
  if (context.businessId) {
    try {
      // PERF: `getCurrentBusiness` está memoizado por request (`React.cache`)
      // — comparte la misma llamada que ya hizo `(panel)/layout.tsx`, en vez
      // de un `apiFetch` propio (confirmado con logging de requests: antes
      // era una llamada real adicional a `/businesses/current`).
      const business = await getCurrentBusiness(
        context.accessToken,
        context.businessId,
      );
      experienceVersion = business.experienceVersion;
    } catch (error) {
      // Mismo criterio que `(panel)/layout.tsx`/`dashboard/page.tsx`: un
      // fetch fallido nunca se traduce en "entonces es LEGACY" — acá
      // decidiría entre `ReviewsLegacyPage` y `ReviewsClient`, dos pantallas
      // completamente distintas.
      if (!isUnauthorizedApiError(error)) loadFailed = true;
    }
  }

  if (loadFailed) return <BusinessLoadError />;

  const isCheckinV2 = experienceVersion === "CHECKIN_V2";

  if (!isCheckinV2) return <ReviewsLegacyPage {...props} />;

  const activeMembership = session.memberships.find(
    (m) => m.businessId === session.activeBusinessId,
  );

  return (
    <ReviewsClient
      businessName={
        session.impersonation?.businessName ??
        activeMembership?.business.name ??
        "mi negocio"
      }
    />
  );
}
