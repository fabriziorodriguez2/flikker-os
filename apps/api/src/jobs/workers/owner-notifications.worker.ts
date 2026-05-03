import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service';
import { createRedisConnection, REDIS_CONFIGURED } from '../redis-connection';
import {
  OWNER_NOTIFICATIONS_QUEUE,
  LowFeedbackNotificationJobData,
} from '../owner-notifications.queue';
import { WhatsAppBspService } from '../whatsapp-bsp.service';

@Injectable()
export class OwnerNotificationsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OwnerNotificationsWorker.name);
  private connection?: IORedis;
  private worker?: Worker<LowFeedbackNotificationJobData>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsAppBspService: WhatsAppBspService,
  ) {}

  onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.worker = new Worker<LowFeedbackNotificationJobData>(
      OWNER_NOTIFICATIONS_QUEUE,
      (job) => this.process(job.data),
      { connection: this.connection },
    );
  }

  async process(data: LowFeedbackNotificationJobData) {
    const feedback = await this.prisma.feedbackResponse.findFirst({
      where: { id: data.feedbackResponseId, businessId: data.businessId },
      include: { business: true, customer: true },
    });

    if (!feedback) return;

    const text = [
      `Feedback bajo (${feedback.score}/5)`,
      `Paciente: ${feedback.customer.name}`,
      feedback.comment ? `Comentario: ${feedback.comment}` : undefined,
    ]
      .filter(Boolean)
      .join('\n');

    if (feedback.business.phone) {
      await this.whatsAppBspService.sendText({
        phone: feedback.business.phone,
        text,
      });
      return;
    }

    this.logger.warn(
      `Low feedback ${feedback.id} has no owner phone to notify.`,
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.connection?.quit();
  }
}
