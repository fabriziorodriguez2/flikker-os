import { Injectable, Logger } from '@nestjs/common';

export interface SendReviewRequestInput {
  phone: string;
  customerName: string;
  trackingUrl: string;
}

export interface SendReviewRequestResult {
  whatsappMessageId: string;
}

export interface SendTextInput {
  phone: string;
  text: string;
}

@Injectable()
export class WhatsAppBspService {
  private readonly logger = new Logger(WhatsAppBspService.name);

  sendReviewRequest(
    input: SendReviewRequestInput,
  ): Promise<SendReviewRequestResult> {
    // TODO: reemplazar con BSP real cuando existan credenciales 360dialog/Twilio.
    this.logger.log(
      `STUB: Deber\u00eda enviar WhatsApp a ${input.phone} con link ${input.trackingUrl}`,
    );

    return Promise.resolve({
      whatsappMessageId: `stub-${Date.now()}`,
    });
  }

  sendText(input: SendTextInput): Promise<SendReviewRequestResult> {
    // TODO: reemplazar con BSP real cuando existan credenciales 360dialog/Twilio.
    this.logger.log(
      `STUB: Deber\u00eda responder WhatsApp a ${input.phone}: ${input.text}`,
    );

    return Promise.resolve({
      whatsappMessageId: `stub-text-${Date.now()}`,
    });
  }
}
