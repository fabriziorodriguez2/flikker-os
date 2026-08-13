import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import ReviewsClient from "./reviews-client";

/**
 * Reseñas.
 *
 * A diferencia de QR y NFC o Clientes, acá NO hay bifurcación por versión: las
 * reseñas de Google y su calificación existen igual para un negocio LEGACY.
 * Lo que sí se gatea, dentro del cliente, son los bloques que dependen del
 * check-in (feedback privado, embudo, "conseguí más reseñas") — un negocio sin
 * visitas ni feedback vería secciones vacías sin sentido.
 */
export default async function ReviewsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

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
