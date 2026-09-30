import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { getMercadoPagoWebhookSecret } from '../../config/mercado-pago';
import { isValidMercadoPagoSignature } from './mercado-pago-webhook-security';
import { MercadoPagoWebhookService } from './mercado-pago-webhook.service';

/**
 * Webhooks de Mercado Pago (Parte 4). Endpoint nuevo, dedicado — sigue la
 * convención real del repo (`src/modules/webhooks/`, junto a
 * `whatsapp-webhook.controller.ts`/`wasender-webhook.controller.ts`), no
 * anidado bajo `public`.
 *
 * ## Procesamiento SÍNCRONO — a propósito distinto de los otros webhooks
 *
 * WhatsApp/WaSender/Shopify responden 200 rápido y procesan async
 * (`void service.handle().catch(...)`). Acá NO: el trabajo es chico (un
 * GET a Mercado Pago + un `updateMany`) y es dinero — si la reconciliación
 * falla de verdad, quiero que Mercado Pago lo sepa (vía un error real) y
 * reintente, no tragarme la falla en un `.catch()` silencioso. No hace
 * falta BullMQ para esto.
 *
 * ## Firma inválida: nunca toca nada
 *
 * `isValidMercadoPagoSignature` corre ANTES de cualquier lectura a
 * Mercado Pago o escritura a la base — un 401 acá significa que no pasó
 * absolutamente nada más.
 */
@Controller('webhooks')
export class MercadoPagoWebhookController {
  private readonly logger = new Logger(MercadoPagoWebhookController.name);

  constructor(private readonly webhookService: MercadoPagoWebhookService) {}

  @Post('mercado-pago')
  @HttpCode(200)
  async receive(
    @Headers('x-signature') xSignature: string | undefined,
    @Headers('x-request-id') xRequestId: string | undefined,
    // Mercado Pago manda `data.id` como query param LITERAL (no anidado)
    // — así lo exige el algoritmo de firma oficial. `@Query('data.id')`
    // busca esa clave exacta en el objeto ya parseado por Express/qs, que
    // NO anida claves con punto salvo notación de corchetes.
    @Query('data.id') dataIdFromQuery: string | undefined,
    @Body()
    body: {
      type?: string;
      topic?: string;
      action?: string;
      data?: { id?: string };
    },
  ) {
    const secret = getMercadoPagoWebhookSecret();
    const valid = isValidMercadoPagoSignature({
      xSignature,
      xRequestId,
      dataId: dataIdFromQuery,
      secret,
    });
    if (!valid) {
      this.logger.warn('Webhook de Mercado Pago con firma inválida o ausente.');
      throw new UnauthorizedException();
    }

    const topic = body.type ?? body.topic;
    // El id de negocio se toma del body — debería coincidir siempre con el
    // de la query string (ambos vienen de la misma notificación); si no
    // coinciden, se prefiere igual el de la query (es el que la firma ya
    // validó criptográficamente).
    const resourceId = dataIdFromQuery ?? body.data?.id;

    if (!resourceId) {
      this.logger.warn(
        `Webhook de Mercado Pago sin data.id (topic=${topic ?? 'n/a'}).`,
      );
      return { ok: true };
    }

    switch (topic) {
      case 'subscription_preapproval':
        await this.webhookService.handleSubscriptionPreapproval(resourceId);
        break;
      case 'subscription_authorized_payment':
        await this.webhookService.handleSubscriptionAuthorizedPayment(
          resourceId,
        );
        break;
      default:
        // Incluye `payment` y cualquier otro topic — no manejado a
        // propósito en esta tanda (ver informe de entrega). Nunca un
        // error: un topic que no nos interesa no es una falla.
        this.logger.log(
          `Webhook de Mercado Pago con topic no manejado: ${topic ?? 'n/a'} — se ignora.`,
        );
        break;
    }

    return { ok: true };
  }
}
