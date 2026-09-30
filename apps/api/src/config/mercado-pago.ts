/**
 * Configuración de la integración con la Subscriptions API de Mercado Pago
 * (`/preapproval` — creación real de checkout recurrente, Parte 3).
 *
 * Archivo separado de `checkout.ts` a propósito: `checkout.ts` son los
 * links ESTÁTICOS `mpago.la` (fallback manual, embebidos en emails y en las
 * pantallas de Suscripción del panel) — siguen existiendo, pero NO forman
 * parte de este flujo. Esto es `/preapproval` real, server-to-server.
 *
 * ## Pivot 2026-09-30: subscription SIN plan asociado
 *
 * La primera versión de este funnel mandaba `preapproval_plan_id`
 * (`MERCADO_PAGO_MONTHLY_PLAN_ID`/`MERCADO_PAGO_YEARLY_PLAN_ID`) — una
 * llamada real controlada contra producción confirmó que ese modo exige
 * `card_token_id` (tarjeta ya tokenizada del lado del frontend), que es
 * justo lo que este repo no quiere hacer (nada de CardForm/Bricks en la
 * landing). El funnel automatizado pasa a crear subscriptions SIN plan
 * asociado (`reason` + `auto_recurring` inline, `status: "pending"`) — ver
 * `mercado-pago-subscription.provider.ts`.
 *
 * Los dos planes de Mercado Pago ("Flikker Pro", "Flikker Pro Anual") NO
 * se borraron: siguen sirviendo para cobro manual/link directo/contingencia.
 * Pero este funnel ya no los referencia por id, así que
 * `MERCADO_PAGO_MONTHLY_PLAN_ID`/`MERCADO_PAGO_YEARLY_PLAN_ID` se quedaron
 * sin consumidor en el código (siguen configuradas en Railway — no se
 * borraron de ahí, eso es una decisión aparte).
 */

/**
 * Server-side únicamente. Nunca se manda al frontend, nunca a la response
 * de ningún endpoint, nunca a un log — ver `mercado-pago-subscription.provider.ts`.
 *
 * Sin default a propósito: un token de Mercado Pago no se inventa. Si falta,
 * `MercadoPagoSubscriptionProvider.isAvailable()` devuelve `false` y el
 * service lo reporta con un 503 explícito en vez de dejar que la llamada a
 * MP falle con un 401 críptico.
 *
 * Test vs. producción NO es un flag propio: Mercado Pago lo codifica en el
 * prefijo del token mismo (`TEST-...` = sandbox, `APP_USR-...` = cuenta
 * real) — cuál token está configurado en el entorno decide el modo, nunca
 * algo manipulable desde el cliente.
 */
export function getMercadoPagoAccessToken(): string | undefined {
  return process.env.MERCADO_PAGO_ACCESS_TOKEN || undefined;
}

/**
 * Adónde vuelve la persona después de gestionar la subscription en Mercado
 * Pago (`back_url` de `/preapproval`). Una sola URL: una subscription sin
 * plan asociado en estado "pending" no tiene un resultado inmediato de
 * pago que diferenciar en la redirección — el estado real se conoce recién
 * con el webhook (Parte 4, todavía no implementado).
 *
 * IMPORTANTE: es solo de REDIRECCIÓN — nunca certifica el pago. Que la
 * persona vuelva a esta URL no mueve nada a PAID.
 *
 * Sin default: si falta, el checkout de Mercado Pago no se crea (ver
 * `isAvailable()`) en vez de mandar un placeholder inventado.
 */
export function getSubscriptionBackUrl(): string | undefined {
  return process.env.MERCADO_PAGO_SUBSCRIPTION_BACK_URL || undefined;
}

/**
 * Secreto para validar `x-signature` en los webhooks de Mercado Pago
 * (Parte 4). Server-side únicamente — nunca frontend, nunca `NEXT_PUBLIC_`,
 * nunca en logs ni en ninguna response. Sin default: si falta, el webhook
 * rechaza toda notificación (401) en vez de aceptar sin verificar.
 */
export function getMercadoPagoWebhookSecret(): string | undefined {
  return process.env.MERCADO_PAGO_WEBHOOK_SECRET || undefined;
}
