import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { MessageStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { createRedisConnection, REDIS_CONFIGURED } from '../redis-connection';
import {
  REVIEW_REQUESTS_QUEUE,
  ReviewRequestQueue,
  ReviewRequestJobData,
} from '../review-request.queue';
import { WhatsAppBspService } from '../whatsapp-bsp.service';

@Injectable()
export class ReviewRequestWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReviewRequestWorker.name);
  private connection?: IORedis;
  private worker?: Worker<ReviewRequestJobData>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsAppBspService: WhatsAppBspService,
    @Optional() private readonly reviewRequestQueue?: ReviewRequestQueue,
  ) {}

  onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.worker = new Worker<ReviewRequestJobData>(
      REVIEW_REQUESTS_QUEUE,
      (job) => this.process(job.data),
      { connection: this.connection },
    );

    this.worker.on('failed', (job, error) => {
      this.reportToSentry(
        `Review request job ${job?.id ?? 'unknown'} failed`,
        error,
      );
    });
  }

  async process(data: ReviewRequestJobData) {
    const message = await this.prisma.message.findFirst({
      where: {
        id: data.messageId,
        businessId: data.businessId,
        customerId: data.customerId,
      },
      include: {
        customer: true,
        business: true,
      },
    });

    if (!message) {
      this.logger.warn(`Message ${data.messageId} not found`);
      return;
    }

    if (message.customer.optedOut) {
      await this.markFailed(message.id);
      return;
    }

    // Skip if the customer already left a review for this business
    const hasReview = await this.prisma.googleReview.findFirst({
      where: {
        businessId: data.businessId,
        attributedMessage: { customerId: data.customerId },
      },
      select: { id: true },
    });
    if (hasReview) {
      await this.markFailed(message.id);
      this.logger.log(
        `Skipping review request for customer ${data.customerId}: already has a review`,
      );
      return;
    }

    if (
      message.business.reviewRequestsPausedUntil &&
      message.business.reviewRequestsPausedUntil > new Date()
    ) {
      await this.reviewRequestQueue?.enqueue(
        data,
        message.business.reviewRequestsPausedUntil.getTime() - Date.now(),
      );
      this.logger.log(
        `Review requests paused for business ${message.businessId}; requeued message ${message.id}.`,
      );
      return;
    }

    if (
      message.business.messageCountCurrentMonth >=
      message.business.messageQuotaMonthly
    ) {
      await this.markFailed(message.id);
      this.logger.warn(
        `Message quota exceeded for business ${message.businessId}. TODO: notify owner.`,
      );
      return;
    }

    try {
      const result = await this.whatsAppBspService.sendReviewRequest({
        phone: message.customer.phoneE164,
        customerName: message.customer.name,
        clinicName: message.business.name,
        trackingUrl: this.buildTrackingUrl(message.trackingToken),
      });

      await this.prisma.$transaction([
        this.prisma.message.update({
          where: { id: message.id },
          data: {
            status: MessageStatus.sent,
            sentAt: new Date(),
            whatsappMsgId: result.whatsappMessageId,
          },
        }),
        this.prisma.business.update({
          where: { id: message.businessId },
          data: { messageCountCurrentMonth: { increment: 1 } },
        }),
      ]);
    } catch (error) {
      await this.markFailed(message.id);
      this.reportToSentry('Review request BSP error', error);
    }
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.connection?.quit();
  }

  private markFailed(messageId: string) {
    return this.prisma.message.update({
      where: { id: messageId },
      data: { status: MessageStatus.failed },
    });
  }

  private buildTrackingUrl(trackingToken: string) {
    const baseUrl = process.env.APP_PUBLIC_URL ?? 'https://app.flikker.com';
    return `${baseUrl.replace(/\/$/, '')}/r/${trackingToken}`;
  }

  private reportToSentry(message: string, error: unknown) {
    const detail =
      error instanceof Error ? error.stack || error.message : error;
    // TODO: conectar SDK de Sentry cuando esté instalado/configurado.
    this.logger.error(message, detail);
  }
}
