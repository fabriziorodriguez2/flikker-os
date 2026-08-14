import { redirectIfAbsorbed } from "@/components/panel/absorbed-route";
import BenefitsClient from "./benefits-client";

/**
 * Beneficios — absorbida por Programa en Check-in V2.
 *
 * El catálogo es el mismo; lo que cambió es que ahora se administra desde
 * Programa, junto con los sellos y la recompensa, en vez de en una pantalla
 * aparte. En LEGACY sigue siendo la pantalla de siempre.
 */
export default async function BenefitsPage() {
  await redirectIfAbsorbed("/dashboard/programa?tab=configuracion&section=beneficios");
  return <BenefitsClient />;
}
