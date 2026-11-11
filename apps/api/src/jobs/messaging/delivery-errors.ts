import { createHash } from 'node:crypto';
import { WhatsAppProviderError } from '../whatsapp-provider';

/**
 * Qué hacer con un error del proveedor de mensajería. Función pura: decide a
 * partir del código HTTP y del texto que devolvió el proveedor, sin llamar a
 * nada. La documentación pública de WaSender no detalla códigos de error, así
 * que la clasificación es deliberadamente conservadora: ante la duda, nunca
 * se reenvía algo que pudo haber salido.
 */
export type DeliveryErrorClass =
  /** Límite de velocidad ("account protection", 429): reintentar más tarde. */
  | 'RATE_LIMITED'
  /** La sesión de WhatsApp no está conectada: reintentar más tarde. */
  | 'SESSION_UNAVAILABLE'
  /** Credenciales, suscripción o cuenta restringida: frenar el remitente. */
  | 'ACCOUNT_RESTRICTED'
  /** El destinatario no sirve (número inválido): no reintentar. */
  | 'RECIPIENT_INVALID'
  /** Falla del proveedor con respuesta (5xx u otra): reintentar. */
  | 'PROVIDER_ERROR'
  /** Timeout o corte de red: el mensaje pudo haber salido. */
  | 'AMBIGUOUS';

export interface DeliveryErrorVerdict {
  errorClass: DeliveryErrorClass;
  /** Tiene sentido volver a intentar (más tarde). */
  retryable: boolean;
  /**
   * El proveedor seguro NO tomó el mensaje: reintentar no puede duplicar.
   * Falso solo para AMBIGUOUS.
   */
  safeToResend: boolean;
  /** Afecta a todos los envíos de la sesión remitente, no solo a este. */
  pausesSender: boolean;
  httpStatus: number | null;
  errorCode: string | null;
  /** Recortado y sin secuencias largas de dígitos (posibles teléfonos). */
  message: string;
}

const RATE_LIMIT =
  /rate.?limit|account protection|too many (requests|messages)|every \d+ seconds/i;
const SESSION =
  /session.*(not connected|disconnected|logged.?out|expired)|not connected|need.?scan|need.?passkey|qr code/i;
const ACCOUNT =
  /subscription|unauthori[sz]ed|authenticat|api key|forbidden|banned|blocked|suspended|restricted/i;
const RECIPIENT =
  /not (registered|on whatsapp)|invalid (phone|number|recipient|jid)|the to field|phone number/i;
/** Errores lanzados ANTES de llamar al proveedor (nunca salió nada). */
const NOT_SENT = /is required to send|no api key/i;
/** El proveedor respondió OK pero sin id: lo tomó, no hay que reenviarlo. */
const ACCEPTED_WITHOUT_ID = /accepted the request but returned no message id/i;

export function sanitizeProviderMessage(text: string): string {
  return text.replace(/\d{7,}/g, '[num]').slice(0, 300);
}

export function classifyDeliveryError(error: unknown): DeliveryErrorVerdict {
  const raw = error instanceof Error ? error.message : String(error);
  const message = sanitizeProviderMessage(raw);
  const httpStatus =
    error instanceof WhatsAppProviderError ? (error.statusCode ?? null) : null;
  const errorCode =
    error instanceof WhatsAppProviderError
      ? (error.providerErrorCode ?? null)
      : null;
  const verdict = (
    errorClass: DeliveryErrorClass,
    retryable: boolean,
    safeToResend: boolean,
    pausesSender: boolean,
  ): DeliveryErrorVerdict => ({
    errorClass,
    retryable,
    safeToResend,
    pausesSender,
    httpStatus,
    errorCode,
    message,
  });

  if (httpStatus === null) {
    if (NOT_SENT.test(raw))
      return verdict('ACCOUNT_RESTRICTED', false, true, true);
    if (ACCEPTED_WITHOUT_ID.test(raw)) {
      return verdict('AMBIGUOUS', false, false, false);
    }
    // Sin respuesta HTTP: timeout, DNS, conexión cortada. No se sabe si el
    // proveedor llegó a tomarlo.
    return verdict('AMBIGUOUS', false, false, false);
  }

  if (httpStatus === 429 || RATE_LIMIT.test(raw)) {
    return verdict('RATE_LIMITED', true, true, false);
  }
  if (SESSION.test(raw))
    return verdict('SESSION_UNAVAILABLE', true, true, true);
  if (
    httpStatus === 401 ||
    httpStatus === 402 ||
    httpStatus === 403 ||
    ACCOUNT.test(raw)
  ) {
    return verdict('ACCOUNT_RESTRICTED', false, true, true);
  }
  if (RECIPIENT.test(raw))
    return verdict('RECIPIENT_INVALID', false, true, false);
  if (httpStatus >= 500) return verdict('PROVIDER_ERROR', true, true, false);
  // Otro 4xx sin patrón conocido: el proveedor respondió que no, así que no
  // salió; reintentar el mismo pedido daría lo mismo.
  return verdict('PROVIDER_ERROR', false, true, false);
}

/** Identifica al destinatario sin guardar el teléfono. */
export function recipientHash(phoneE164: string): string {
  return createHash('sha256').update(phoneE164.trim()).digest('hex');
}
