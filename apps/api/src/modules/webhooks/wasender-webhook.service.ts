import { Injectable, Logger } from '@nestjs/common';
import { MessageStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppInboundQueue } from '../../jobs/whatsapp-inbound.queue';

/**
 * Webhook de WaSenderAPI — Fase 1 de la migración (§11/§13/§17).
 *
 * IMPORTANTE — confianza de los nombres de campo usados acá:
 *  - Firma, idempotencia, "responder 200 rápido": mecánica propia, alta
 *    confianza.
 *  - `messages.upsert`/`message.received` (inbound) y `cleanedSenderPn`:
 *    confirmados contra dos páginas de la documentación oficial
 *    (webhook-message-upsert, webhook-message-received) con payloads de
 *    ejemplo consistentes entre sí.
 *  - `messages.update` con `data.update.status` (0-5) y `data.key.id`:
 *    confirmado contra la documentación oficial (webhook-message-update).
 *  - LO NO CONFIRMADO: si `data.key.id` (que reportan los webhooks) es EL
 *    MISMO valor que `data.msgId` (que devuelve `POST /send-message` y que
 *    hoy se guarda en `Message.whatsappMsgId`). La documentación no lo
 *    aclara en ningún lado que se haya podido confirmar. Mientras no se
 *    confirme con un envío real + webhook real (§16 del pedido), el
 *    tracking de delivered/read para WaSenderAPI debe tratarse como NO
 *    VERIFICADO — sent/queued/failed (el lifecycle real que todo el
 *    dominio usa) no dependen de esto en absoluto, solo lo hacen desde el
 *    resultado directo de `sendText()`.
 *
 * Nunca confía en un `businessId` del payload — no existe tal campo acá, y
 * si alguna vez apareciera, se ignoraría: la correlación es siempre por
 * `providerMessageId` (`Message.whatsappMsgId`) o por número de teléfono,
 * igual que ya hacía el webhook de WHAPI.
 */

const STATUS_BY_CODE: Partial<
  Record<
    number,
    { status: MessageStatus; field: 'sentAt' | 'deliveredAt' | 'readAt' }
  >
> = {
  2: { status: MessageStatus.sent, field: 'sentAt' },
  3: { status: MessageStatus.delivered, field: 'deliveredAt' },
  4: { status: MessageStatus.read, field: 'readAt' },
};

@Injectable()
export class WaSenderWebhookService {
  private readonly logger = new Logger(WaSenderWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inboundQueue: WhatsAppInboundQueue,
  ) {}

  async handleEvent(body: Record<string, unknown>) {
    const event = stringValue(body.event);
    if (!event) {
      this.logger.warn('WaSender webhook ignored: missing "event" field');
      return;
    }

    switch (event) {
      case 'messages.upsert':
      case 'message.received':
      case 'personal.message.received':
        await this.handleInboundMessage(body);
        return;
      case 'messages.update':
      case 'message.receipt.update':
        await this.handleStatusUpdate(body);
        return;
      case 'message.sent':
        // Confirmación de que el proveedor envió — no trae nada que
        // `sendText()` no haya devuelto ya en el momento del envío. Se
        // ignora explícitamente, no por omisión.
        return;
      case 'session.status':
        // §9/§10 — la disponibilidad del canal se resuelve consultando
        // `GET /api/status` bajo demanda (con cache), no escuchando este
        // evento. Ignorado a propósito: no hay UI ni alerta que dependa de
        // enterarse en tiempo real acá todavía.
        return;
      default:
        // Ignorar eventos que no usamos — literal (§11).
        return;
    }
  }

  private async handleInboundMessage(body: Record<string, unknown>) {
    const extracted = extractInboundMessage(body);
    if (!extracted) {
      this.logger.warn(
        'WaSender inbound webhook ignored: could not extract from/text',
      );
      return;
    }
    // No construimos un chatbot nuevo acá — reusamos EXACTAMENTE la misma
    // cola y el mismo worker que ya procesa "ayuda"/"stats"/"atendí ..." (ver
    // WhatsAppInboundWorker), para que la migración no duplique esa lógica.
    await this.inboundQueue.enqueue(extracted);
  }

  private async handleStatusUpdate(body: Record<string, unknown>) {
    const extracted = extractStatusUpdate(body);
    if (!extracted) return;

    const mapped = STATUS_BY_CODE[extracted.statusCode];
    if (!mapped) return; // ERROR/PENDING/PLAYED — nada que reflejar hoy.

    await this.prisma.message.updateMany({
      where: { whatsappMsgId: extracted.providerMessageId },
      data: { status: mapped.status, [mapped.field]: new Date() },
    });
  }
}

function extractInboundMessage(body: Record<string, unknown>) {
  const data = asRecord(body.data);
  if (!data) return null;

  // `message.received` anida un nivel más (`data.messages`) que
  // `messages.upsert` (`data` directo) — se prueban los dos, en ese orden.
  const container = asRecord(data.messages) ?? data;
  const key = asRecord(container.key);
  if (key?.fromMe === true) return null; // nunca proceses tus propios envíos.

  const from =
    stringValue(container.cleanedSenderPn) ??
    stringValue(key?.senderPn)?.replace(/@.*/, '') ??
    stringValue(key?.remoteJid)?.replace(/@.*/, '');
  const text =
    stringValue(container.messageBody) ??
    stringValue(asRecord(container.message)?.conversation);

  if (!from || !text) return null;

  return {
    from,
    text,
    messageId: stringValue(key?.id),
    receivedAt: new Date().toISOString(),
  };
}

function extractStatusUpdate(body: Record<string, unknown>) {
  const data = asRecord(body.data);
  if (!data) return null;

  const key = asRecord(data.key);
  const update = asRecord(data.update);
  const providerMessageId = stringValue(key?.id);
  const statusCode = numberValue(update?.status);

  if (!providerMessageId || statusCode === null) return null;

  return { providerMessageId, statusCode };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
