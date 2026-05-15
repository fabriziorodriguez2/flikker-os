import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { CampaignExecutionStatus, MessageStatus } from '@prisma/client';
import { Job, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { createRedisConnection, REDIS_CONFIGURED } from '../redis-connection';
import {
  REPEATS_QUEUE,
  RUN_REPEATS_DAILY_JOB,
  SEND_REPEAT_MESSAGE_JOB,
  SendRepeatMessageJobData,
} from '../repeats.queue';
import { RepeatsProcessor } from '../repeats.processor';
import { WhatsAppBspService } from '../whatsapp-bsp.service';

@Injectable()
export class RepeatsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RepeatsWorker.name);
  private connection?: IORedis;
  private worker?: Worker;

  constructor(
    private readonly prisma: PrismaService,
    private readonly repeatsProcessor: RepeatsProcessor,
    private readonly whatsAppBspService: WhatsAppBspService,
  ) {}

  onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.worker = new Worker(REPEATS_QUEUE, (job) => this.process(job), {
      connection: this.connection,
    });
  }

  async process(job: Job) {
    if (job.name === RUN_REPEATS_DAILY_JOB) {
      return this.repeatsProcessor.runDaily();
    }

    if (job.name === SEND_REPEAT_MESSAGE_JOB) {
      return this.sendRepeatMessage(job.data as SendRepeatMessageJobData);
    }

    this.logger.warn(`Unknown repeats job: ${job.name}`);
    return null;
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.connection?.quit();
  }

  private async sendRepeatMessage(data: SendRepeatMessageJobData) {
    const execution = await this.prisma.campaignExecution.findUnique({
      where: { id: data.executionId },
      include: {
        customer: true,
        campaign: true,
        business: true,
        message: true,
      },
    });

    if (!execution || !execution.message) return;

    if (execution.customer.optedOut) {
      await this.markFailed(execution.id, execution.message.id);
      return;
    }

    try {
      const result = await this.whatsAppBspService.sendText({
        phone: execution.customer.phoneE164,
        text: this.renderMessage({
          body: execution.campaign.messageBody  '',
          customerName: execution.customer.name,
          clinicName: execution.business.name,
          offer: execution.campaign.offerText  '',
        }),
      });

      await this.prisma.$transaction([
        this.prisma.message.update({
          where: { id: execution.message.id },
          data: {
            status: MessageStatus.sent,
            sentAt: new Date(),
            whatsappMsgId: result.whatsappMessageId,
          },
        }),
        this.prisma.campaignExecution.update({
          where: { id: execution.id },
          data: {
            status: CampaignExecutionStatus.sent,
            sentAt: new Date(),
          },
        }),
      ]);
    } catch {
      await this.markFailed(execution.id, execution.message.id);
    }
  }

  private markFailed(executionId: string, messageId: string) {
    return this.prisma.$transaction([
      this.prisma.message.update({
        where: { id: messageId },
        data: { status: MessageStatus.failed },
      }),
      this.prisma.campaignExecution.update({
        where: { id: executionId },
        data: { status: CampaignExecutionStatus.failed },
      }),
    ]);
  }

  private renderMessage(input: {
    body: string;
    customerName: string;
    clinicName: string;
    offer: string;
  }) {
    return input.body
      .replaceAll('{nombre}', input.customerName)
      .replaceAll('{clinica}', input.clinicName)
      .replaceAll('{oferta}', input.offer)
      .replace(/\s+/g, ' ')
      .trim();
  }
}
