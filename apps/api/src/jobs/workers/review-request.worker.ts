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
import { FeedbackRepository } from '../../modules/feedback/feedback.repository';
import { createRedisConnection, REDIS_CONFIGURED } from '../redis-connection';
import {
  REVIEW_REQUESTS_QUEUE,
  ReviewRequestQueue,
  ReviewRequestJobData,
} from '../review-request.queue';
import { WhatsAppBspService } from '../whatsapp-bsp.service';
import { WHATSAPP_MIN_SEND_INTERVAL_MS } from '../whatsapp-provider';

@Injectable()
export class ReviewRequestWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReviewRequestWorker.name);
  private connection?: IORedis;
  private worker?: Worker<ReviewRequestJobData>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsAppBspService: WhatsAppBspService,
    private readonly feedbackRepository: FeedbackRepository,
    @Optional() private readonly reviewRequestQueue?: ReviewRequestQueue,
  ) {}

  onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.worker = new Worker<ReviewRequestJobData>(
      REVIEW_REQUESTS_QUEUE,
      (job) => this.process(job.data),
      {
        connection: this.connection,
        // WaSenderAPI corta la cuenta si se manda más de un mensaje cada 5s
        // ("account protection") — ya nos pasó en producción. Estos
        // recordatorios salen todos ~1h después de cada check-in, así que en
        // una hora pico varios caen casi juntos. El limiter de BullMQ los
        // espacia a nivel de cola en vez de dejar que el provider los
        // rechace; los jobs no se pierden, solo esperan su turno.
        limiter: { max: 1, duration: WHATSAPP_MIN_SEND_INTERVAL_MS },
      },
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

    // Idempotencia: un reintento de la cola (o un job duplicado) nunca manda
    // el mismo recordatorio dos veces. El estado de la fila es la fuente de
    // verdad, no el hecho de que el job se haya vuelto a ejecutar.
    if (message.status !== MessageStatus.queued) {
      this.logger.log(
        `Review request ${message.id} already processed (${message.status}) — skipping`,
      );
      return;
    }

    if (message.customer.optedOut) {
      await this.markFailed(message.id);
      return;
    }

    // El estado se RE-CONSULTA acá, no se confía en el que había cuando se
    // programó el job hace una hora: en el medio el cliente pudo dejar su
    // feedback desde la pantalla del check-in. Mandarle igual "¿cómo estuvo
    // tu visita?" sería molestarlo por algo que ya hizo.
    //
    // Se pregunta por la visita QUE ORIGINÓ este mensaje, no por la última
    // del cliente: si volvió a pasar en el medio, esa visita nueva es otra
    // conversación y no debe alterar la decisión de este recordatorio.
    //
    // Los mensajes anteriores a la columna `originatingVisitId` la tienen en
    // NULL: no hay visita contra la cual verificar, así que se sigue de largo
    // y se envían como siempre (el resto de los guards igual aplica).
    if (message.originatingVisitId) {
      const alreadyGaveFeedback =
        await this.feedbackRepository.hasFeedbackForVisit(
          message.originatingVisitId,
        );
      if (alreadyGaveFeedback) {
        // `skipped`, NO `failed`: no falló nada, el pedido dejó de tener
        // sentido. Y NO queda `queued`, así que ningún reintento lo vuelve a
        // tomar — el guard de arriba corta antes.
        await this.markSkipped(message.id);
        this.logger.log(
          `Review request ${message.id} saltado: la visita ${message.originatingVisitId} ya tiene feedback`,
        );
        return;
      }
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

  /** Descartado a propósito: ni enviado ni fallido. Ver `MessageStatus`. */
  private markSkipped(messageId: string) {
    return this.prisma.message.update({
      where: { id: messageId },
      data: { status: MessageStatus.skipped },
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
