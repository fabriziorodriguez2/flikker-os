import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { BenefitType, MessageChannel, MessageStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsAppBspService } from '../../jobs/whatsapp-bsp.service';
import { ReviewRequestQueue } from '../../jobs/review-request.queue';

/**
 * Delay before the review request is sent after a customer registers / checks
 * in for the first time. Shared by the legacy QR capture flow and the new
 * check-in flow so the behaviour stays identical in both.
 */
export const QR_REVIEW_DELAY_MS = 60 * 60 * 1000; // 1 hora

/**
 * El link estable de "Mi Flikker" (acceso permanente, sin depender de
 * volver a escanear el QR de ningún negocio) — un solo lugar que lo arma,
 * para que el mensaje de bienvenida y cualquier otra comunicación
 * (premios, promociones, reactivación) linkeen siempre al mismo sitio.
 */
export function buildMiFlikkerLink(): string {
  const baseUrl =
    process.env.APP_PUBLIC_URL ??
    process.env.WEB_BASE_URL ??
    'https://app.flikker.com';
  return `${baseUrl.replace(/\/$/, '')}/mi`;
}

/**
 * Outbound-messaging side effects of a first visit (welcome, owner ping, review
 * request). Extracted so the legacy /qr flow and the /check-in flow don't
 * duplicate this logic. Every method is best-effort and never throws.
 */
@Injectable()
export class PublicMessagingService {
  private readonly logger = new Logger(PublicMessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsApp: WhatsAppBspService,
    private readonly reviewRequestQueue: ReviewRequestQueue,
  ) {}

  /**
   * El ÚNICO mensaje de bienvenida del registro.
   *
   * `miFlikkerLink` se agrega a ESTE mismo texto en vez de mandar un segundo
   * WhatsApp (bug real, auditoría de caso real): antes el check-in disparaba
   * dos welcomes en paralelo — este y uno aparte con el link de Mi Flikker —
   * y como WaSenderAPI acepta 1 mensaje cada 5 segundos, el segundo volvía
   * rechazado con "account protection". El cliente recibía el saludo sin
   * link y el link no se reintentaba nunca. Un solo mensaje elimina la
   * carrera de raíz.
   *
   * Devuelve si el proveedor ACEPTÓ el envío. El caller lo necesita para no
   * marcar el welcome como entregado cuando en realidad falló; sigue siendo
   * best-effort (nunca tira), solo que ahora lo dice.
   */
  async sendWelcome(
    phoneE164: string,
    customerName: string,
    businessName: string,
    benefitText: string | null,
    benefitType: BenefitType | null = null,
    miFlikkerLink: string | null = null,
  ): Promise<boolean> {
    try {
      const registered = `Hola ${customerName}! 🎉 Quedaste registrado en *${businessName}*.`;
      let body: string;
      if (benefitText && benefitType === BenefitType.raffle) {
        body = `${registered}\n🎟️ Ya estás participando del sorteo: ${benefitText}\n¡Mucha suerte! Te avisamos si ganás.`;
      } else if (benefitText) {
        const noun =
          benefitType === BenefitType.discount
            ? 'descuento'
            : benefitType === BenefitType.gift
              ? 'regalo'
              : 'beneficio';
        body = `${registered}\nTu ${noun}: ${benefitText}\nMostrá este mensaje en el local para usarlo. ¡Te esperamos!`;
      } else {
        body = `Hola ${customerName} 👋 Gracias por pasar por *${businessName}*.`;
      }

      if (miFlikkerLink) {
        body += `\n\nYa tenés tu perfil en Flikker. Desde acá podés ver tus tarjetas, beneficios y premios cuando quieras:\n${miFlikkerLink}`;
      }

      await this.whatsApp.sendText({ phone: phoneE164, text: body });
      return true;
    } catch (error) {
      this.logger.warn(
        `WhatsApp welcome failed for ${phoneE164}: ${errMsg(error)}`,
      );
      return false;
    }
  }

  async sendOwnerNotification(
    businessId: string,
    businessName: string,
    phone: string | null,
    customerName: string,
  ): Promise<void> {
    if (!phone) return;
    try {
      const baseUrl =
        process.env.APP_PUBLIC_URL ??
        process.env.WEB_BASE_URL ??
        'https://app.flikker.com';
      const contactsUrl = `${baseUrl.replace(/\/$/, '')}/dashboard/customers`;
      const text = [
        `📱 *Nuevo contacto en ${businessName}*`,
        '',
        `${customerName} escaneó tu QR y quedó en tu base.`,
        'Ya le enviamos el pedido de reseña por WhatsApp.',
        '',
        `👉 Ver contactos: ${contactsUrl}`,
      ].join('\n');
      await this.whatsApp.sendText({ phone, text });
    } catch (error) {
      this.logger.warn(
        `Owner QR notification failed for business ${businessId}: ${errMsg(error)}`,
      );
    }
  }

  /**
   * Sends a one-time profile-recovery code by WhatsApp. The raw code is never
   * logged. Best-effort — never throws.
   */
  async sendVerificationCode(
    phoneE164: string,
    businessName: string,
    code: string,
  ): Promise<void> {
    try {
      const text = `Tu código para recuperar tu perfil en *${businessName}* es: ${code}\nVence en 10 minutos. No lo compartas con nadie.`;
      await this.whatsApp.sendText({ phone: phoneE164, text });
    } catch (error) {
      this.logger.warn(
        `WhatsApp verification code send failed for ${phoneE164}: ${errMsg(error)}`,
      );
    }
  }

  /*
   * `sendMiFlikkerWelcome` vivía acá y se eliminó a propósito: era el
   * SEGUNDO WhatsApp del registro, y competir con `sendWelcome` por la
   * misma ventana de 5 segundos del proveedor era exactamente por qué el
   * link nunca llegaba. El link ahora viaja dentro de `sendWelcome`, en un
   * solo mensaje. `buildMiFlikkerLink` sigue exportado y es la única forma
   * de armar ese link (siempre desde `APP_PUBLIC_URL`).
   */

  /**
   * Creates a queued review-request Message and schedules it. Returns the
   * created message id (or null when it could not be enqueued) so callers can
   * link a Visit to the message that triggered the review ask.
   *
   * `visitId` es la visita que originó el pedido. Se guarda en el mensaje
   * porque una hora después, al despachar, hay que preguntar por ESA visita
   * puntual y no por "la última": si el cliente volvió en el medio, la
   * decisión de este recordatorio no debe cambiar.
   */
  async enqueueReviewRequest(
    businessId: string,
    customerId: string,
    campaignId: string | null,
    visitId: string | null = null,
  ): Promise<string | null> {
    try {
      const trackingToken = randomBytes(8).toString('base64url');
      const message = await this.prisma.message.create({
        data: {
          businessId,
          customerId,
          campaignId: campaignId ?? undefined,
          originatingVisitId: visitId ?? undefined,
          channel: MessageChannel.whatsapp,
          trackingToken,
          status: MessageStatus.queued,
        },
        select: { id: true },
      });
      await this.reviewRequestQueue.enqueue(
        { messageId: message.id, customerId, businessId },
        QR_REVIEW_DELAY_MS,
      );
      return message.id;
    } catch (error) {
      this.logger.warn(
        `QR review request enqueue failed for customer ${customerId}: ${errMsg(error)}`,
      );
      return null;
    }
  }
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
