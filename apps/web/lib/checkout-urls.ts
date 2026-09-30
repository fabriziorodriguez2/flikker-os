/**
 * Los checkouts de Mercado Pago. Única fuente de verdad del frontend.
 *
 * Antes de esto la URL mensual estaba copiada en tres componentes distintos
 * (las dos pantallas de Suscripción y los templates de email del backend).
 * Una URL de cobro duplicada es una bomba de tiempo: el día que Mercado Pago
 * cambie el link, tres lugares tienen que acordarse, y el que se olvide manda
 * gente a un checkout muerto sin que nadie se entere.
 *
 * Se leen de env para poder apuntarlos a un checkout de prueba sin tocar
 * código, con el link real como default — el panel tiene que funcionar en un
 * entorno sin configurar, no quedarse sin botón de pago.
 *
 * `NEXT_PUBLIC_` porque el modal es un componente de cliente y el valor no es
 * secreto: es una URL pública de cobro, la misma que ve cualquiera que llegue
 * al checkout.
 */

export const PRO_MONTHLY_CHECKOUT_URL =
  process.env.NEXT_PUBLIC_PRO_MONTHLY_CHECKOUT_URL ?? 'https://mpago.la/1Acxajh';

export const PRO_YEARLY_CHECKOUT_URL =
  process.env.NEXT_PUBLIC_PRO_YEARLY_CHECKOUT_URL ?? 'https://mpago.la/2hsbeMy';

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
