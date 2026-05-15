import { Injectable, Logger } from '@nestjs/common';
import { MessageStatus } from '@prisma/client';
import { WhatsAppInboundQueue } from '../../jobs/whatsapp-inbound.queue';
import { PrismaService } from '../../prisma/prisma.service';

type WhatsAppWebhookBody = Record<string, unknown>;

@Injectable()
export class WhatsAppWebhookService {
  private readonly logger = new Logger(WhatsAppWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsAppInboundQueue: WhatsAppInboundQueue,
  ) {}

  async handleWebhook(body: WhatsAppWebhookBody) {
    const inboundMessages = this.extractInboundMessages(body);
    await Promise.all(
      inboundMessages.map((message) =>
        this.whatsAppInboundQueue.enqueue(message),
      ),
    );

    await this.handleStatusUpdate(body, { quiet: inboundMessages.length > 0 });
  }

  async handleStatusUpdate(
    body: WhatsAppWebhookBody,
    options: { quiet?: boolean } = {},
  ) {
    const update = this.extractStatusUpdate(body);
    if (!update) {
      if (!options.quiet) {
        this.logger.warn('WhatsApp webhook ignored: missing message id/status');
      }
      return;
    }

    const data = this.mapStatus(update.status, update.timestamp);
    if (!data) return;

    await this.prisma.message.updateMany({
      where: { whatsappMsgId: update.whatsappMessageId },
      data,
    });
  }

  private extractStatusUpdate(body: WhatsAppWebhookBody) {
    const flatMessageId =
      this.stringValue(body.messageId) ?
      this.stringValue(body.whatsapp_msg_id) ?
      this.stringValue(body.whatsappMessageId);
    const flatStatus = this.stringValue(body.status);

    if (flatMessageId && flatStatus) {
      return {
        whatsappMessageId: flatMessageId,
        status: flatStatus,
        timestamp: this.stringValue(body.timestamp),
      };
    }

    const statuses = this.statusesFromWebhookPayload(body);
    const firstStatus = statuses[0];
    if (!firstStatus) return null;

    const whatsappMessageId = this.stringValue(firstStatus.id);
    const status = this.stringValue(firstStatus.status);
    if (!whatsappMessageId || !status) return null;

    return {
      whatsappMessageId,
      status,
      timestamp: this.stringValue(firstStatus.timestamp),
    };
  }

  private extractInboundMessages(body: WhatsAppWebhookBody) {
    const flatText =
      this.stringValue(body.text) ?
      this.stringValue(body.Body) ?
      this.stringValue(body.body);
    const flatFrom =
      this.stringValue(body.from) ?
      this.stringValue(body.From) ?
      this.stringValue(body.sender);

    if (flatText && flatFrom) {
      return [
        {
          from: flatFrom,
          text: flatText,
          messageId: this.stringValue(body.messageId),
          receivedAt: new Date().toISOString(),
        },
      ];
    }

    const whapiMessages = this.messagesFromWhapiPayload(body);
    if (whapiMessages.length > 0) return whapiMessages;

    const entries = Array.isArray(body.entry)  body.entry : [];
    const messages: Array<{
      from: string;
      text: string;
      messageId?: string;
      receivedAt: string;
    }> = [];

    for (const entry of entries) {
      if (!this.isRecord(entry)) continue;
      const changes = Array.isArray(entry.changes)  entry.changes : [];
      for (const change of changes) {
        if (!this.isRecord(change) || !this.isRecord(change.value)) continue;
        const rawMessages = change.value.messages;
        if (!Array.isArray(rawMessages)) continue;
        for (const rawMessage of rawMessages) {
          if (!this.isRecord(rawMessage)) continue;
          const from = this.stringValue(rawMessage.from);
          const id = this.stringValue(rawMessage.id);
          const text = this.extractMessageText(rawMessage);
          if (!from || !text) continue;
          messages.push({
            from,
            text,
            messageId: id,
            receivedAt: new Date().toISOString(),
          });
        }
      }
    }

    return messages;
  }

  private extractMessageText(message: Record<string, unknown>) {
    if (this.isRecord(message.text)) {
      return this.stringValue(message.text.body);
    }

    if (this.isRecord(message.link_preview)) {
      return this.stringValue(message.link_preview.body);
    }

    if (this.isRecord(message.reply)) {
      const reply = message.reply;
      if (this.isRecord(reply.buttons_reply)) {
        return this.stringValue(reply.buttons_reply.title);
      }
      if (this.isRecord(reply.list_reply)) {
        return this.stringValue(reply.list_reply.title);
      }
    }

    return this.stringValue(message.body);
  }

  private mapStatus(status: string, timestamp?: string) {
    const date = this.parseTimestamp(timestamp);

    if (status === 'sent') {
      return { status: MessageStatus.sent, sentAt: date };
    }
    if (status === 'delivered') {
      return { status: MessageStatus.delivered, deliveredAt: date };
    }
    if (status === 'read') {
      return { status: MessageStatus.read, readAt: date };
    }

    return null;
  }

  private statusesFromWebhookPayload(body: WhatsAppWebhookBody) {
    const whapiStatuses = Array.isArray(body.statuses)  body.statuses : [];
    const statuses: Record<string, unknown>[] = [];

    for (const status of whapiStatuses) {
      if (this.isRecord(status)) {
        statuses.push(status);
      }
    }

    const entries = Array.isArray(body.entry)  body.entry : [];

    for (const entry of entries) {
      if (!this.isRecord(entry)) continue;
      const changes = Array.isArray(entry.changes)  entry.changes : [];
      for (const change of changes) {
        if (!this.isRecord(change) || !this.isRecord(change.value)) continue;
        const rawStatuses = change.value.statuses;
        if (Array.isArray(rawStatuses)) {
          for (const status of rawStatuses) {
            if (this.isRecord(status)) {
              statuses.push(status);
            }
          }
        }
      }
    }

    return statuses;
  }

  private messagesFromWhapiPayload(body: WhatsAppWebhookBody) {
    const rawMessages = Array.isArray(body.messages)  body.messages : [];
    const messages: Array<{
      from: string;
      text: string;
      messageId?: string;
      receivedAt: string;
    }> = [];

    for (const rawMessage of rawMessages) {
      if (!this.isRecord(rawMessage)) continue;
      if (rawMessage.from_me === true) continue;

      const from =
        this.stringValue(rawMessage.from) ?
        this.stringValue(rawMessage.chat_id)?.replace(/@.*/, '');
      const text = this.extractMessageText(rawMessage);
      if (!from || !text) continue;

      messages.push({
        from,
        text,
        messageId: this.stringValue(rawMessage.id),
        receivedAt: this.parseTimestamp(rawMessage.timestamp).toISOString(),
      });
    }

    return messages;
  }

  private parseTimestamp(timestamp?: unknown) {
    if (!timestamp) return new Date();

    if (typeof timestamp === 'number') {
      const date = new Date(timestamp * 1000);
      return Number.isNaN(date.getTime())  new Date() : date;
    }

    if (typeof timestamp !== 'string') return new Date();

    const milliseconds =
      /^\d+$/.test(timestamp) && timestamp.length <= 10
         Number(timestamp) * 1000
        : Date.parse(timestamp);
    const date = new Date(milliseconds);

    return Number.isNaN(date.getTime())  new Date() : date;
  }

  private stringValue(value: unknown) {
    return typeof value === 'string' && value.trim()  value.trim() : undefined;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
