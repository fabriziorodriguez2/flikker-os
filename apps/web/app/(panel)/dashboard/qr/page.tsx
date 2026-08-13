"use client";

import { useIsCheckinV2 } from "../../experience-context";
import QrNfcClient from "./qr-nfc-client";
import QrPrintStudio from "./qr-print-studio";

/**
 * "QR y NFC".
 *
 * Dos pantallas distintas detrás de la misma ruta, porque el concepto de
 * producto cambia entre versiones:
 *
 *  - CHECKIN_V2: el negocio tiene puntos de acceso reales (`VisitSource`), y
 *    lo que el dueño administra es SU acceso — el QR principal, el soporte
 *    físico y, si quiere, accesos adicionales para saber desde dónde escanean.
 *  - LEGACY: no existen puntos de acceso; sigue en pie el estudio de diseños
 *    imprimibles apuntando a `/qr/{businessId}`, exactamente como antes.
 *
 * La bifurcación vive acá y no dentro de cada componente para que el camino
 * LEGACY quede intacto y sea obvio que no lo tocamos.
 */
export default function QrPage() {
  return useIsCheckinV2() ? <QrNfcClient /> : <QrPrintStudio />;
}
