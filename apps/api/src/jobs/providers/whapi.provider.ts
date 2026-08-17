import {
  SendTextInput,
  SendTextResult,
  WhatsAppProvider,
  WhatsAppProviderError,
} from '../whatsapp-provider';

/**
 * El proveedor original — lógica EXACTAMENTE igual a la que vivía antes
 * directo en `WhatsAppBspService` (§19 — no se toca durante la migración,
 * se aísla nomás). Se mantiene disponible para rollback vía
 * `WHATSAPP_PROVIDER=whapi` hasta la limpieza final (§19 del informe).
 */
export class WhapiProvider implements WhatsAppProvider {
  readonly name = 'whapi';

  isAvailable(): Promise<boolean> {
    // Mismo criterio que existía antes de esta migración: el token está
    // configurado. WHAPI no tiene, en este código, un chequeo de sesión más
    // fino — no se agrega uno nuevo para un proveedor que se va a retirar.
    return Promise.resolve(Boolean(process.env.WHAPI_TOKEN));
  }

  async sendText(input: SendTextInput): Promise<SendTextResult> {
    const token = process.env.WHAPI_TOKEN;
    if (!token) {
      throw new WhatsAppProviderError(
        'WHAPI_TOKEN is required to send WhatsApp messages',
      );
    }

    const baseUrl = process.env.WHAPI_BASE_URL ?? 'https://gate.whapi.cloud';
    const response = await fetch(
      `${baseUrl.replace(/\/$/, '')}/messages/text`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: normalizeWhapiPhone(input.to),
          body: input.text,
        }),
      },
    );

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      throw new WhatsAppProviderError(
        `Whapi send failed (${response.status}): ${sanitizedPayload(payload)}`,
        response.status,
      );
    }

    return {
      providerMessageId:
        extractMessageId(payload) ?? `whapi-${Date.now().toString()}`,
      status: 'accepted',
    };
  }
}

/**
 * Ajuste de formato propio de WHAPI (dígitos sin `+`) sobre un teléfono que
 * YA llega en E.164 — no es un normalizador nuevo, es lo que este proveedor
 * puntual necesita del lado del wire. Sin cambios respecto del código
 * original.
 */
function normalizeWhapiPhone(phone: string) {
  return phone.replace(/^whatsapp:/i, '').replace(/\D/g, '');
}

function extractMessageId(value: unknown): string | null {
  if (!isRecord(value)) return null;

  return (
    stringValue(value.id) ??
    stringValue(value.messageId) ??
    stringValue(value.message_id) ??
    (isRecord(value.message) ? stringValue(value.message.id) : null) ??
    (isRecord(value.data) ? stringValue(value.data.id) : null)
  );
}

/** Nunca loggeamos el payload completo del proveedor sin acotar — ver §14. */
function sanitizedPayload(value: unknown): string {
  const text = JSON.stringify(value);
  return text && text.length <= 300 ? text : `${text?.slice(0, 300)}…`;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
