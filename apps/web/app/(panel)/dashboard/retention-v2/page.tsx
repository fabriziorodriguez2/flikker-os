import { redirectIfAbsorbed } from "@/components/panel/absorbed-route";
import RetentionV2Client from "./retention-v2-client";

/**
 * Retention V2 — absorbida por Notificaciones.
 *
 * Esta pantalla es la interfaz técnica del motor (experimentos, variantes,
 * optimización, dry run). Un dueño no tiene por qué verla: lo que necesita
 * decidir está en Notificaciones, en su idioma. Sigue accesible durante
 * impersonation, que es como la usamos internamente.
 */
export default async function RetentionV2Page() {
  await redirectIfAbsorbed("/dashboard/notificaciones");
  return <RetentionV2Client />;
}
