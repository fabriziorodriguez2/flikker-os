import { redirect } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { getEffectiveApiContext, getSession } from "@/lib/auth";
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
