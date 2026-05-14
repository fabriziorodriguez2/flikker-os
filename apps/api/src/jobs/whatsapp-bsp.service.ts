import { Injectable } from '@nestjs/common';

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
  async sendReviewRequest(
    input: SendReviewRequestInput,
  ): Promise<SendReviewRequestResult> {
    return this.sendText({
      phone: input.phone,
      text: `Hola ${input.customerName}, gracias por venir hoy. Tu opinión nos ayuda muchísimo a seguir mejorando. ¿Nos dejás una reseña? ${input.trackingUrl} 💜`,
    });
  }

  async sendText(input: SendTextInput): Promise<SendReviewRequestResult> {
    const token = process.env.WHAPI_TOKEN;
    if (!token) {
      throw new Error('WHAPI_TOKEN is required to send WhatsApp messages');
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
          to: normalizeWhapiPhone(input.phone),
          body: input.text,
        }),
      },
    );

    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      throw new Error(
        `Whapi send failed (${response.status}): ${JSON.stringify(payload)}`,
      );
    }

    return {
      whatsappMessageId:
        extractMessageId(payload) ?? `whapi-${Date.now().toString()}`,
    };
  }
}

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

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
