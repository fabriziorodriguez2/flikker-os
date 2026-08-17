import { Injectable } from '@nestjs/common';
import { getWhatsAppProvider } from './whatsapp-provider.factory';

export interface SendReviewRequestInput {
  phone: string;
  customerName: string;
  clinicName: string;
  trackingUrl: string;
}

export interface SendReviewRequestResult {
  whatsappMessageId: string;
}

export interface SendTextInput {
  phone: string;
  text: string;
}

/**
 * La cara pública de "mandar un WhatsApp" para TODO el resto del código —
 * cerca de 15 consumidores (workers, servicios de negocio, Retention V1 y
 * V2, promociones, reviews, test-lab) llaman `sendText`/`sendReviewRequest`
 * y nunca supieron ni necesitan saber qué proveedor hay detrás.
 *
 * Migración WHAPI → WaSenderAPI (pedido explícito): el contrato público de
 * esta clase NO CAMBIÓ ni un carácter — mismos métodos, mismos inputs, mismo
 * shape de resultado (`whatsappMessageId`). Lo único que cambió es qué pasa
 * adentro: en vez de hacer `fetch` directo a WHAPI, delega en el
 * `WhatsAppProvider` activo (ver `whatsapp-provider.factory.ts`), elegido
 * por `WHATSAPP_PROVIDER`. Cero consumidor tuvo que tocarse para esta
 * migración — es exactamente el punto de tener la abstracción acá.
 */
@Injectable()
export class WhatsAppBspService {
  async sendReviewRequest(
    input: SendReviewRequestInput,
  ): Promise<SendReviewRequestResult> {
    return this.sendText({
      phone: input.phone,
      text: `Hola ${input.customerName}👋, ¿cómo andás?\nTe escribo porque nos ayudaría muchísimo que nos dejes una reseña sobre tu experiencia en ${input.clinicName}.\nTe dejo el link acá 👉 ${input.trackingUrl}\n¡Gracias por apoyar a ${input.clinicName}!💜`,
    });
  }

  async sendText(input: SendTextInput): Promise<SendReviewRequestResult> {
    const provider = getWhatsAppProvider();
    const result = await provider.sendText({
      to: input.phone,
      text: input.text,
    });
    return { whatsappMessageId: result.providerMessageId };
  }

  /**
   * "¿Flikker puede mandar WhatsApp ahora mismo?" — una sola pregunta, una
   * sola fuente de verdad, para Notificaciones y para el dispatcher de
   * Retention V2 (antes cada uno miraba `WHAPI_TOKEN` por su cuenta; ver
   * `## Canal/status`).
   */
  async isChannelAvailable(): Promise<boolean> {
    return getWhatsAppProvider().isAvailable();
  }
}
