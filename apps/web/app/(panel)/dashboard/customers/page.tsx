"use client";

import { useIsCheckinV2 } from "../../experience-context";
import CustomersLegacyClient from "./customers-legacy-client";
import CustomersLoyaltyClient from "./customers-loyalty-client";

/**
 * Clientes.
 *
 * Igual que en QR y NFC, la ruta muestra dos pantallas distintas porque la
 * pregunta que el dueño se hace cambia con la versión de la experiencia:
 *
 *  - CHECKIN_V2: fidelización. Quién vuelve, cuántos sellos tiene cada uno,
 *    quién está por completar, quién tiene una recompensa esperando.
 *  - LEGACY: la lista operativa de siempre (importar CSV, agenda, campañas
 *    manuales), sin tocar. Esos negocios no tienen tarjetas ni visitas, así
 *    que una pantalla de sellos les mostraría columnas vacías.
 */
export default function CustomersPage() {
  return useIsCheckinV2() ? (
    <CustomersLoyaltyClient />
  ) : (
    <CustomersLegacyClient />
  );
}
