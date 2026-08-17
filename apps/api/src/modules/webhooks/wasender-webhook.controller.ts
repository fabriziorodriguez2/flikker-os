import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { WaSenderWebhookService } from './wasender-webhook.service';
import {
  isDuplicateWebhookEvent,
  isValidWaSenderSignature,
} from './wasender-webhook-security';

/**
 * §11/§17/§19 — endpoint NUEVO, separado de `POST /webhooks/whatsapp`
 * (WHAPI). No se toca ni se reemplaza ese endpoint en esta fase: los dos
 * conviven mientras el proveedor no está confirmado en producción.
 *
 * Contrato:
 *  - valida `X-Webhook-Signature` (401 si falta o no matchea);
 *  - responde 200 rápido, procesa async (mismo patrón que ya usaba el
 *    controller de WHAPI);
 *  - idempotente por evento;
 *  - nunca confía en un `businessId` externo (no hay ninguno en el payload
 *    de WaSenderAPI; si lo hubiera, se ignoraría igual).
 */
@Controller('webhooks')
export class WaSenderWebhookController {
  private readonly logger = new Logger(WaSenderWebhookController.name);

  constructor(private readonly webhookService: WaSenderWebhookService) {}

  @Post('wasender')
  @HttpCode(200)
  receive(
    @Headers('x-webhook-signature') signature: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    const secret = process.env.WASENDER_WEBHOOK_SECRET;
    if (!isValidWaSenderSignature(signature, secret)) {
      throw new UnauthorizedException();
    }

    const dedupeKey = this.dedupeKey(body);
    if (dedupeKey && isDuplicateWebhookEvent(dedupeKey)) {
      return { ok: true };
    }

    void this.webhookService.handleEvent(body).catch((error: unknown) => {
      this.logger.error(
        'WaSender webhook async handling failed',
        error instanceof Error ? error.stack : String(error),
      );
    });
    return { ok: true };
  }

  private dedupeKey(body: Record<string, unknown>): string | null {
    const event = typeof body.event === 'string' ? body.event : null;
    const timestamp =
      typeof body.timestamp === 'number' ? String(body.timestamp) : null;
    const data =
      typeof body.data === 'object' && body.data !== null
        ? (body.data as Record<string, unknown>)
        : null;
    const key =
      data && typeof data.key === 'object' && data.key !== null
        ? (data.key as Record<string, unknown>)
        : null;
    const messageId = typeof key?.id === 'string' ? key.id : null;

    if (!event) return null;
    // El id del mensaje es lo más específico disponible; si no está, el
    // timestamp es el segundo mejor — sin ninguno de los dos, no hay forma
    // confiable de deduplicar y se procesa (mejor procesar de más que
    // perder un evento real).
    return messageId
      ? `${event}:${messageId}`
      : timestamp
        ? `${event}:${timestamp}`
        : null;
  }
}
