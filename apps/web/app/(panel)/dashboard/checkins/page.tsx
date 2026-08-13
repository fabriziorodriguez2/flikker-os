import { redirectIfAbsorbed } from "@/components/panel/absorbed-route";
import CheckinsClient from "./checkins-client";

/**
 * Check-ins — repartida entre Clientes y QR y NFC.
 *
 * Lo que tenía se cubrió: la actividad reciente y el detalle por cliente
 * viven en Clientes (con su timeline completa), y la administración de puntos
 * de acceso se mudó a QR y NFC. Queda accesible como herramienta interna.
 */
export default async function CheckinsPage() {
  await redirectIfAbsorbed("/dashboard/customers");
  return <CheckinsClient />;
}
