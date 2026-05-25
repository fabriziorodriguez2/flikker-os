import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import {
  CalendarEventStatus,
  MessageChannel,
  MessageStatus,
  ServiceEventCreatedVia,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { createRedisConnection, REDIS_CONFIGURED } from '../redis-connection';
import {
  GOOGLE_CALENDAR_SEND_CHECK_QUEUE,
  CalendarSendCheckJobData,
} from '../google-calendar-send-check.queue';
import { ReviewRequestQueue } from '../review-request.queue';
import { decryptToken } from '../../common/utils/calendar-crypto.util';
import { GoogleCalendarOAuthService } from '../../modules/integrations/google-calendar/google-calendar-oauth.service';
import { GoogleCalendarApiService } from '../../modules/integrations/google-calendar/google-calendar-api.service';
import { GoogleCalendarParserService } from '../../modules/integrations/google-calendar/google-calendar-parser.service';
import { normalizeToE164 } from '../../common/utils/phone.util';
import { randomUUID } from 'crypto';

@Injectable()
export class GoogleCalendarSendCheckWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(GoogleCalendarSendCheckWorker.name);
  private connection?: IORedis;
  private worker?: Worker<CalendarSendCheckJobData>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: GoogleCalendarOAuthService,
    private readonly api: GoogleCalendarApiService,
    private readonly parser: GoogleCalendarParserService,
    private readonly reviewRequestQueue: ReviewRequestQueue,
  ) {}

  onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.worker = new Worker<CalendarSendCheckJobData>(
      GOOGLE_CALENDAR_SEND_CHECK_QUEUE,
      (job) => this.process(job.data),
      { connection: this.connection },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Send-check job ${job?.id ?? 'unknown'} failed: ${err.message}`,
      );
    });
  }

  async process(data: CalendarSendCheckJobData): Promise<void> {
    const calendarEvent = await this.prisma.calendarEvent.findFirst({
      where: {
        id: data.calendarEventId,
        businessId: data.businessId,
      },
      select: {
        id: true,
        status: true,
        title: true,
        startAt: true,
        customerName: true,
        customerPhone: true,
      },
    });

    if (!calendarEvent) {
      this.logger.warn(`CalendarEvent ${data.calendarEventId} not found`);
      return;
    }

    if (
      calendarEvent.status !== CalendarEventStatus.pending &&
      calendarEvent.status !== CalendarEventStatus.send_check_queued
    ) {
      return;
    }

    const integration = await this.prisma.googleCalendarIntegration.findFirst({
      where: {
        id: data.integrationId,
        businessId: data.businessId,
      },
      select: { id: true, encryptedRefreshToken: true },
    });

    if (!integration?.encryptedRefreshToken) {
      await this.skip(data.calendarEventId, 'integration_missing');
      return;
    }

    // Re-check Google API to confirm event wasn't cancelled
    let eventStillValid = true;
    try {
      const refreshToken = decryptToken(integration.encryptedRefreshToken);
      const { accessToken } = await this.oauth.refreshAccessToken(refreshToken);
      const googleEvent = await this.api.getEvent(
        accessToken,
        data.calendarId,
        data.googleEventId,
      );
      if (!googleEvent || googleEvent.status === 'cancelled') {
        eventStillValid = false;
      }
    } catch (err) {
      this.logger.warn(
        `Could not verify event ${data.googleEventId}: ${
          err instanceof Error ? err.message : err
        }. Proceeding anyway.`,
      );
    }

    if (!eventStillValid) {
      await this.skip(data.calendarEventId, 'event_cancelled');
      return;
    }

    const parsed = this.parser.parse(calendarEvent.title);
    const rawPhone = parsed.customerPhone ?? calendarEvent.customerPhone;

    if (!rawPhone) {
      await this.skip(data.calendarEventId, 'no_phone');
      return;
    }

    let phoneE164: string;
    try {
      phoneE164 = normalizeToE164(rawPhone);
    } catch {
      await this.skip(data.calendarEventId, 'invalid_phone');
      return;
    }

    const customerName =
      parsed.customerName ?? calendarEvent.customerName ?? 'Cliente';

    // Find or create customer
    let customer = await this.prisma.customer.findFirst({
      where: { businessId: data.businessId, phoneE164, isActive: true },
      select: { id: true },
    });

    if (!customer) {
      customer = await this.prisma.customer.create({
        data: {
          businessId: data.businessId,
          name: customerName,
          phoneE164,
        },
        select: { id: true },
      });
    }

    if (
      (
        await this.prisma.customer.findFirst({
          where: { id: customer.id },
          select: { optedOut: true },
        })
      )?.optedOut
    ) {
      await this.skip(data.calendarEventId, 'opted_out');
      return;
    }

    const trackingToken = randomUUID().replace(/-/g, '');

    const { event: serviceEvent, message } = await this.prisma.$transaction(
      async (tx) => {
        const event = await tx.serviceEvent.create({
          data: {
            businessId: data.businessId,
            customerId: customer!.id,
            serviceType: calendarEvent.title.slice(0, 120),
            eventAt: calendarEvent.startAt,
            createdVia: ServiceEventCreatedVia.google_calendar,
          },
          select: { id: true },
        });

        const msg = await tx.message.create({
          data: {
            businessId: data.businessId,
            customerId: customer!.id,
            serviceEventId: event.id,
            trackingToken,
            channel: MessageChannel.whatsapp,
            status: MessageStatus.queued,
          },
          select: { id: true },
        });

        return { event, message: msg };
      },
    );

    await this.prisma.calendarEvent.update({
      where: { id: data.calendarEventId },
      data: {
        status: CalendarEventStatus.sent,
        serviceEventId: serviceEvent.id,
        processedAt: new Date(),
        customerName,
        customerPhone: phoneE164,
      },
      select: { id: true },
    });

    await this.reviewRequestQueue.enqueue({
      messageId: message.id,
      customerId: customer.id,
      businessId: data.businessId,
    });

    this.logger.log(
      `Send-check queued review request for calendar event ${data.calendarEventId}`,
    );
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.connection?.quit();
  }

  private skip(calendarEventId: string, reason: string) {
    return this.prisma.calendarEvent.update({
      where: { id: calendarEventId },
      data: {
        status: CalendarEventStatus.skipped,
        skipReason: reason,
        processedAt: new Date(),
      },
      select: { id: true },
    });
  }
}
