/**
 * Contrato de transporte de WhatsApp — la ÚNICA superficie que un adapter de
 * proveedor implementa, y la única que el resto del código (vía
 * `WhatsAppBspService`) conoce. Ningún tipo específico de WHAPI o WaSenderAPI
 * cruza esta frontera: cada adapter traduce su propio request/response acá
 * adentro, nunca afuera.
 *
 * Deliberadamente mínimo — `sendText` + `isAvailable`. No hay `sendMedia`,
 * `sendTemplate`, etc.: Flikker solo manda texto plano hoy, y agregar
 * superficie no usada es exactamente el tipo de anticipación que este cambio
 * evita.
 */

/**
 * Piso real entre dos envíos a la misma cuenta del proveedor. WaSenderAPI
 * rechaza más de 1 mensaje cada 5 segundos ("account protection"), y ese
 * rechazo es la causa raíz confirmada de dos incidentes distintos: 2 de 3
 * destinatarios de una promoción, y el welcome de Mi Flikker que nunca
 * llegaba porque competía con el welcome del check-in en la misma ventana
 * de milisegundos.
 *
 * Vive acá, junto al contrato del proveedor, para que no haya dos números
 * distintos dando vueltas por el repo.
 */
export const WHATSAPP_MIN_SEND_INTERVAL_MS = 5000;

export interface SendTextInput {
  /** Destinatario en E.164 (`+598...`) — ya normalizado por el caller. */
  to: string;
  text: string;
}

/**
 * Resultado normalizado de un envío aceptado. `status` es deliberadamente un
 * único valor: es la confirmación de "el proveedor lo tomó", no un estado de
 * entrega — eso es un concepto de dominio (`Message.status`), no de
 * transporte, y este contrato no lo modela. Un envío que el proveedor
 * rechaza nunca llega acá — el adapter lanza en cambio (ver
 * `WhatsAppProviderError`).
 */
export interface SendTextResult {
  /** Id del mensaje según el proveedor (WHAPI: `id`; WaSenderAPI: `msgId`). */
  providerMessageId: string;
  status: 'accepted';
}

/**
 * Error de transporte, con el código HTTP y (si el proveedor lo dio) su
 * propio código/mensaje de error, saneado — nunca se guarda ni loggea un
 * header de auth o el payload completo acá (ver `## Seguridad`).
 *
 * El worker no distingue por `statusCode` hoy (reintenta con el mismo límite
 * de BullMQ sin importar la causa) — este campo existe para diagnóstico
 * (decision log, logs) sin cambiar cuántas veces se reintenta. Cambiar esa
 * lógica de reintento no es parte de esta migración.
 */
export class WhatsAppProviderError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly providerErrorCode?: string,
  ) {
    super(message);
    this.name = 'WhatsAppProviderError';
  }
}

export interface WhatsAppProvider {
  /** Nombre estable del proveedor — usado solo para logging/diagnóstico. */
  readonly name: string;

  sendText(input: SendTextInput): Promise<SendTextResult>;

  /**
   * "¿Puede este proveedor mandar un WhatsApp ahora mismo?" — la única
   * pregunta real detrás de "canal activo" en todo el producto (ver
   * `## Canal/status`). Cada adapter decide qué tan barato/caro es
   * responderla; el caller nunca asume nada sobre el costo.
   */
  isAvailable(): Promise<boolean>;
}
