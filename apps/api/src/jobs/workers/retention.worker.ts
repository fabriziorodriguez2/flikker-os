import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { MessageStatus } from '@prisma/client';
import { Job, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { createRedisConnection, REDIS_CONFIGURED } from '../redis-connection';
import {
  RETENTION_QUEUE,
  RUN_RETENTION_DAILY_JOB,
  SEND_RETENTION_MESSAGE_JOB,
  SendRetentionMessageJobData,
} from '../retention.queue';
import { RetentionProcessor } from '../retention.processor';
import { WhatsAppBspService } from '../whatsapp-bsp.service';

@Injectable()
export class RetentionWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RetentionWorker.name);
  private connection?: IORedis;
  private worker?: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly retentionProcessor: RetentionProcessor,
    private readonly whatsAppBspService: WhatsAppBspService,
  ) {}

  onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.worker = new Worker(RETENTION_QUEUE, (job) => this.process(job), {
      connection: this.connection,
    });
  }

  async process(job: Job) {
    if (job.name === RUN_RETENTION_DAILY_JOB) {
      return this.retentionProcessor.runDaily();
    }
    if (job.name === SEND_RETENTION_MESSAGE_JOB) {
      return this.sendRetentionMessage(job.data as SendRetentionMessageJobData);
    }
    this.logger.warn(`Unknown retention job: ${job.name}`);
    return null;
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.connection?.quit();
  }

  private async sendRetentionMessage(data: SendRetentionMessageJobData) {
    const send = await this.prisma.retentionSend.findUnique({
      where: { id: data.retentionSendId },
      include: { customer: true, business: true, step: true, message: true },
    });

    if (!send || !send.message) return;

    // Step deleted after queueing → we lost the body; nothing to send.
    if (!send.step) {
      await this.markFailed(send.id, send.message.id);
      return;
    }

    if (send.customer.optedOut) {
      await this.markFailed(send.id, send.message.id);
      return;
    }

    if (
      send.business.messageCountCurrentMonth >=
      send.business.messageQuotaMonthly
    ) {
      await this.markFailed(send.id, send.message.id);
      this.logger.warn(
        `Retention message quota exceeded for business ${send.businessId}.`,
      );
      return;
    }

    try {
      const result = await this.whatsAppBspService.sendText({
        phone: send.customer.phoneE164,
        text: this.renderMessage({
          body: send.step.messageBody,
          customerName: send.customer.name,
          businessName: send.business.name,
        }),
      });

      await this.prisma.$transaction([
        this.prisma.message.update({
          where: { id: send.message.id },
          data: {
            status: MessageStatus.sent,
            sentAt: new Date(),
            whatsappMsgId: result.whatsappMessageId,
          },
        }),
        this.prisma.retentionSend.update({
          where: { id: send.id },
          data: { status: MessageStatus.sent },
        }),
        this.prisma.business.update({
          where: { id: send.businessId },
          data: { messageCountCurrentMonth: { increment: 1 } },
        }),
      ]);
    } catch {
      await this.markFailed(send.id, send.message.id);
    }
  }

  private markFailed(sendId: string, messageId: string) {
    return this.prisma.$transaction([
      this.prisma.message.update({
        where: { id: messageId },
        data: { status: MessageStatus.failed },
      }),
      this.prisma.retentionSend.update({
        where: { id: sendId },
        data: { status: MessageStatus.failed },
      }),
    ]);
  }

  private renderMessage(input: {
    body: string;
    customerName: string;
    businessName: string;
  }) {
    return input.body
      .replaceAll('{nombre}', input.customerName)
      .replaceAll('{negocio}', input.businessName)
      .replace(/[^\S\n]+/g, ' ')
      .trim();
  }
}
