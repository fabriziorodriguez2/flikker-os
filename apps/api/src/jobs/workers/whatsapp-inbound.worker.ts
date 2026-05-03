import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import {
  CampaignExecutionStatus,
  MessageChannel,
  MessageStatus,
  ServiceEventCreatedVia,
} from '@prisma/client';
import { normalizeToE164 } from '../../common/utils/phone.util';
import { PrismaService } from '../../prisma/prisma.service';
import {
  parseWhatsAppCommand,
  WHATSAPP_HELP_TEXT,
  WHATSAPP_PARSE_ERROR_TEXT,
} from '../../modules/webhooks/whatsapp-command.parser';
import { createRedisConnection, REDIS_CONFIGURED } from '../redis-connection';
import { ReviewRequestQueue } from '../review-request.queue';
import {
  WHATSAPP_INBOUND_QUEUE,
  WhatsAppInboundJobData,
} from '../whatsapp-inbound.queue';
import { WhatsAppBspService } from '../whatsapp-bsp.service';

const DEDUPE_WINDOW_MS = 12 * 60 * 60 * 1000;
const BOT_REVIEW_DELAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class WhatsAppInboundWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WhatsAppInboundWorker.name);
  private connection?: IORedis;
  private worker?: Worker<WhatsAppInboundJobData>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsAppBspService: WhatsAppBspService,
    private readonly reviewRequestQueue: ReviewRequestQueue,
  ) {}

  onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.worker = new Worker<WhatsAppInboundJobData>(
      WHATSAPP_INBOUND_QUEUE,
      (job) => this.process(job.data),
      { connection: this.connection },
    );

    this.worker.on('failed', (job, error) => {
      this.logger.error(
        `WhatsApp inbound job ${job?.id ?? 'unknown'} failed: ${error.message}`,
      );
    });
  }

  async process(data: WhatsAppInboundJobData) {
    const business = await this.findBusinessBySender(data.from);
    if (!business) {
      const tracked = await this.trackRepeatResponse(data.from, data.text);
      if (!tracked) {
        await this.reply(data.from, WHATSAPP_PARSE_ERROR_TEXT);
      }
      return;
    }

    const command = parseWhatsAppCommand(data.text);

    if (command.type === 'help') {
      await this.reply(data.from, WHATSAPP_HELP_TEXT);
      return;
    }

    if (command.type === 'stats') {
      await this.reply(data.from, await this.buildStatsText(business.id));
      return;
    }

    if (command.type === 'pause') {
      const pausedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await this.prisma.business.update({
        where: { id: business.id },
        data: { reviewRequestsPausedUntil: pausedUntil },
      });
      await this.reply(
        data.from,
        'Listo. Paus\u00e9 los env\u00edos de pedidos de rese\u00f1a por 24 horas.',
      );
      return;
    }

    if (command.type !== 'attended') {
      await this.reply(data.from, WHATSAPP_PARSE_ERROR_TEXT);
      return;
    }

    let phoneE164: string;
    try {
      phoneE164 = normalizeToE164(command.phone);
    } catch {
      await this.reply(data.from, WHATSAPP_PARSE_ERROR_TEXT);
      return;
    }

    const customer = await this.findOrCreateCustomer(
      business.id,
      phoneE164,
      command.name,
    );
    await this.createServiceEventIfNeeded(business.id, customer.id);

    await this.reply(
      data.from,
      `\u2713 Anotado. ${customer.name} recibir\u00e1 el pedido de rese\u00f1a ma\u00f1ana.`,
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.connection?.quit();
  }

  private async findBusinessBySender(sender: string) {
    const normalized = this.normalizeSender(sender);

    return this.prisma.business.findFirst({
      where: {
        isActive: true,
        OR: [
          { phone: normalized },
          { phone: sender },
          { whatsappPhoneId: normalized },
          { whatsappPhoneId: sender },
        ],
      },
      select: { id: true },
    });
  }

  private async findOrCreateCustomer(
    businessId: string,
    phoneE164: string,
    name?: string,
  ) {
    const existing = await this.prisma.customer.findFirst({
      where: { businessId, phoneE164, isActive: true },
    });

    if (existing) {
      if (name && existing.name.startsWith('Paciente ')) {
        return this.prisma.customer.update({
          where: { id: existing.id },
          data: { name },
        });
      }
      return existing;
    }

    return this.prisma.customer.create({
      data: {
        businessId,
        phoneE164,
        name: name || `Paciente ${phoneE164}`,
      },
    });
  }

  private async createServiceEventIfNeeded(
    businessId: string,
    customerId: string,
  ) {
    const since = new Date(Date.now() - DEDUPE_WINDOW_MS);
    const existing = await this.prisma.serviceEvent.findFirst({
      where: { businessId, customerId, eventAt: { gte: since } },
      orderBy: { eventAt: 'desc' },
    });

    if (existing) {
      return existing;
    }

    const event = await this.prisma.serviceEvent.create({
      data: {
        businessId,
        customerId,
        serviceType: 'Servicio',
        eventAt: new Date(),
        createdVia: ServiceEventCreatedVia.whatsapp_bot,
      },
    });
    const message = await this.prisma.message.create({
      data: {
        businessId,
        customerId,
        serviceEventId: event.id,
        trackingToken: randomBytes(8).toString('base64url'),
        channel: MessageChannel.whatsapp,
        status: MessageStatus.queued,
      },
    });

    await this.reviewRequestQueue.enqueue(
      { businessId, customerId, messageId: message.id },
      Number(process.env.WHATSAPP_BOT_REVIEW_DELAY_MS ?? BOT_REVIEW_DELAY_MS),
    );

    return event;
  }

  private async buildStatsText(businessId: string) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [customers, serviceEvents, sentMessages] = await Promise.all([
      this.prisma.customer.count({
        where: { businessId, isActive: true },
      }),
      this.prisma.serviceEvent.count({
        where: { businessId, eventAt: { gte: since } },
      }),
      this.prisma.message.count({
        where: {
          businessId,
          status: MessageStatus.sent,
          sentAt: { gte: since },
        },
      }),
    ]);

    return [
      'Stats Flikker \u00faltimos 30 d\u00edas:',
      `Pacientes: ${customers}`,
      `Atenciones: ${serviceEvents}`,
      `Mensajes enviados: ${sentMessages}`,
    ].join('\n');
  }

  private reply(phone: string, text: string) {
    return this.whatsAppBspService.sendText({ phone, text });
  }

  private normalizeSender(sender: string) {
    const cleaned = sender.replace(/^whatsapp:/i, '').trim();
    try {
      return normalizeToE164(cleaned);
    } catch {
      return cleaned;
    }
  }

  private async trackRepeatResponse(sender: string, text: string) {
    const phoneE164 = this.normalizeSender(sender);
    const customer = await this.prisma.customer.findFirst({
      where: { phoneE164, isActive: true },
      select: { id: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!customer) return false;

    const execution = await this.prisma.campaignExecution.findFirst({
      where: {
        customerId: customer.id,
        respondedAt: null,
        message: { campaignId: { not: null }, status: MessageStatus.sent },
      },
      orderBy: { sentAt: 'desc' },
    });
    if (!execution) return false;

    await this.prisma.campaignExecution.update({
      where: { id: execution.id },
      data: {
        status: CampaignExecutionStatus.responded,
        respondedAt: new Date(),
        responseText: text.slice(0, 2000),
      },
    });

    return true;
  }
}
