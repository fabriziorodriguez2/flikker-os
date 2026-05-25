import { Injectable, Logger } from '@nestjs/common';
import { CalendarEventStatus, CalendarIntegrationStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  decryptToken,
} from '../../../common/utils/calendar-crypto.util';
import { GoogleCalendarOAuthService } from './google-calendar-oauth.service';
import {
  GoogleCalendarApiService,
  resolveEventDateTime,
} from './google-calendar-api.service';
import { GoogleCalendarParserService } from './google-calendar-parser.service';
import { GoogleCalendarSendCheckQueue } from '../../../jobs/google-calendar-send-check.queue';

const SYNC_WINDOW_FUTURE_DAYS = 7;
const SYNC_WINDOW_PAST_HOURS = 1;

@Injectable()
export class GoogleCalendarSyncService {
  private readonly logger = new Logger(GoogleCalendarSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: GoogleCalendarOAuthService,
    private readonly api: GoogleCalendarApiService,
    private readonly parser: GoogleCalendarParserService,
    private readonly sendCheckQueue: GoogleCalendarSendCheckQueue,
  ) {}

  async syncAll(): Promise<{ synced: number; failed: number }> {
    const integrations = await this.prisma.googleCalendarIntegration.findMany({
      where: {
        status: CalendarIntegrationStatus.active,
        encryptedRefreshToken: { not: null },
        selectedCalendarIds: { isEmpty: false },
      },
      select: {
        id: true,
        businessId: true,
        encryptedRefreshToken: true,
        selectedCalendarIds: true,
        ignoredTitleWords: true,
        autoSendEnabled: true,
        sendDelayHours: true,
      },
    });

    let synced = 0;
    let failed = 0;

    for (const integration of integrations) {
      try {
        await this.syncOne(integration);
        synced++;
      } catch (err) {
        failed++;
        this.logger.error(
          `Sync failed for business ${integration.businessId}: ${
            err instanceof Error ? err.message : err
          }`,
        );
        await this.markIntegrationError(integration.id);
      }
    }

    return { synced, failed };
  }

  async syncOne(integration: {
    id: string;
    businessId: string;
    encryptedRefreshToken: string | null;
    selectedCalendarIds: string[];
    ignoredTitleWords: string[];
    autoSendEnabled: boolean;
    sendDelayHours: number;
  }): Promise<void> {
    if (!integration.encryptedRefreshToken) return;

    const refreshToken = decryptToken(integration.encryptedRefreshToken);
    const tokenSet = await this.oauth.refreshAccessToken(refreshToken);
    const { accessToken } = tokenSet;

    const now = new Date();
    const timeMin = new Date(now.getTime() - SYNC_WINDOW_PAST_HOURS * 3600_000);
    const timeMax = new Date(
      now.getTime() + SYNC_WINDOW_FUTURE_DAYS * 86_400_000,
    );

    for (const calendarId of integration.selectedCalendarIds) {
      try {
        const events = await this.api.listEvents(
          accessToken,
          calendarId,
          timeMin,
          timeMax,
        );

        for (const event of events) {
          if (event.status === 'cancelled') continue;

          const startAt = resolveEventDateTime(event.start);
          if (!startAt) continue;

          const endAt = resolveEventDateTime(event.end);
          const parsed = this.parser.parse(event.summary);

          const ignored = integration.ignoredTitleWords.some((word) =>
            event.summary.toLowerCase().includes(word.toLowerCase()),
          );

          await this.upsertEvent({
            integration,
            calendarId,
            googleEventId: event.id,
            title: event.summary,
            startAt,
            endAt,
            customerName: parsed.customerName,
            customerPhone: parsed.customerPhone,
            ignored,
            now,
          });
        }
      } catch (err) {
        this.logger.error(
          `Calendar ${calendarId} sync error for business ${integration.businessId}: ${
            err instanceof Error ? err.message : err
          }`,
        );
      }
    }

    await this.prisma.googleCalendarIntegration.update({
      where: { id: integration.id },
      data: { lastSyncAt: now },
      select: { id: true },
    });
  }

  private async upsertEvent(params: {
    integration: {
      id: string;
      businessId: string;
      autoSendEnabled: boolean;
      sendDelayHours: number;
    };
    calendarId: string;
    googleEventId: string;
    title: string;
    startAt: Date;
    endAt: Date | null;
    customerName: string | null;
    customerPhone: string | null;
    ignored: boolean;
    now: Date;
  }) {
    const {
      integration,
      calendarId,
      googleEventId,
      title,
      startAt,
      endAt,
      customerName,
      customerPhone,
      ignored,
      now,
    } = params;

    const existing = await this.prisma.calendarEvent.findUnique({
      where: {
        integrationId_googleEventId: {
          integrationId: integration.id,
          googleEventId,
        },
      },
      select: { id: true, status: true },
    });

    if (existing && existing.status !== CalendarEventStatus.pending) {
      // already processed (sent/skipped/queued) — skip
      return;
    }

    let status: CalendarEventStatus = CalendarEventStatus.pending;
    let skipReason: string | null = null;

    if (ignored) {
      status = CalendarEventStatus.skipped;
      skipReason = 'ignored_title';
    } else if (!customerPhone) {
      status = CalendarEventStatus.skipped;
      skipReason = 'no_phone';
    }

    const data = {
      businessId: integration.businessId,
      integrationId: integration.id,
      calendarId,
      title,
      startAt,
      endAt,
      customerName,
      customerPhone,
      status,
      skipReason,
    };

    let eventId: string;

    if (existing) {
      await this.prisma.calendarEvent.update({
        where: { id: existing.id },
        data,
        select: { id: true },
      });
      eventId = existing.id;
    } else {
      const created = await this.prisma.calendarEvent.create({
        data: { ...data, googleEventId },
        select: { id: true },
      });
      eventId = created.id;
    }

    if (
      status === CalendarEventStatus.pending &&
      integration.autoSendEnabled
    ) {
      const effectiveEnd = endAt ?? startAt;
      const fireAt = new Date(
        effectiveEnd.getTime() + integration.sendDelayHours * 3_600_000,
      );
      const delayMs = Math.max(0, fireAt.getTime() - now.getTime());

      await this.sendCheckQueue.enqueue(
        {
          calendarEventId: eventId,
          businessId: integration.businessId,
          integrationId: integration.id,
          googleEventId,
          calendarId,
        },
        delayMs,
      );

      await this.prisma.calendarEvent.update({
        where: { id: eventId },
        data: { status: CalendarEventStatus.send_check_queued },
        select: { id: true },
      });
    }
  }

  private markIntegrationError(integrationId: string) {
    return this.prisma.googleCalendarIntegration.update({
      where: { id: integrationId },
      data: { status: CalendarIntegrationStatus.error },
      select: { id: true },
    });
  }
}
