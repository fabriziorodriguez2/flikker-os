/**
 * Copy y matemática de precios del plan Pro self-service. El checkout en
 * sí (a dónde se manda a pagar) ya NO vive acá — ver `lib/pro-checkout.ts`
 * y `lib/use-pro-checkout.ts`: el panel pega al checkout autenticado
 * (`POST /businesses/current/checkout`), que el backend resuelve a una URL
 * de Mercado Pago ligada a ese Business y a ese pago puntual. Una URL
 * estática de cobro, igual para cualquiera que la viera, quedó obsoleta en
 * cuanto existió un checkout real por negocio.
 */

/**
 * Cuántos meses se pagan en el plan anual. El anual da 12 meses de uso por el
 * equivalente a 10 — de acá sale tanto el precio calculado como el copy
 * "Pagás 10 meses y usás 12", así que los dos no se pueden desincronizar.
 */
export const YEARLY_MONTHS_CHARGED = 10;
export const YEARLY_MONTHS_GRANTED = 12;
export const YEARLY_MONTHS_FREE = YEARLY_MONTHS_GRANTED - YEARLY_MONTHS_CHARGED;

/**
 * Precio anual a partir del mensual REAL que devuelve el backend
 * (`selfServicePro.priceAmount` en `/businesses/current/subscription`).
 *
 * Devuelve `null` si no hay un mensual confiable. Ese `null` es importante:
 * la card se muestra igual, sin precio, en vez de inventar uno. Un número
 * distinto al que cobra el checkout sería peor que no mostrar ninguno.
 */
export function yearlyPriceFrom(monthly: number | null | undefined): number | null {
  if (typeof monthly !== 'number' || !Number.isFinite(monthly) || monthly <= 0) {
    return null;
  }
  return monthly * YEARLY_MONTHS_CHARGED;
}

/** "UYU 1.000" — formato consistente, sin decimales inventados. */
export function formatPrice(currency: string, amount: number): string {
  return `${currency} ${amount.toLocaleString('es-UY')}`;
}
