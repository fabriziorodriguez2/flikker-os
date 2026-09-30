/**
 * Los checkouts de Mercado Pago, del lado del backend.
 *
 * Existe porque los emails al dueño llevan un botón de pago, y esa URL
 * estaba escrita a mano en `owner-lifecycle-email-templates.ts` —
 * una cuarta copia del mismo link, en un archivo donde nadie la iba a
 * buscar el día que Mercado Pago lo cambie.
 *
 * El frontend tiene su propio módulo (`apps/web/lib/checkout-urls.ts`) con
 * los mismos defaults: son dos procesos distintos y no comparten bundle. Lo
 * que sí comparten es la variable de entorno, así que en un despliegue real
 * se configura una sola vez.
 */

export const PRO_MONTHLY_CHECKOUT_URL =
  process.env.PRO_MONTHLY_CHECKOUT_URL ?? 'https://mpago.la/1Acxajh';

export const PRO_YEARLY_CHECKOUT_URL =
  process.env.PRO_YEARLY_CHECKOUT_URL ?? 'https://mpago.la/2hsbeMy';
