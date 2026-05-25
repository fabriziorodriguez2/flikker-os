import { Injectable, NotFoundException } from '@nestjs/common';
import { CalendarIntegrationStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  encryptToken,
  decryptToken,
} from '../../../common/utils/calendar-crypto.util';
import { GoogleCalendarOAuthService } from './google-calendar-oauth.service';
import { GoogleCalendarApiService } from './google-calendar-api.service';
import { SelectCalendarsDto } from './dto/select-calendars.dto';
import { PatchCalendarConfigDto } from './dto/patch-config.dto';

@Injectable()
export class GoogleCalendarService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly oauth: GoogleCalendarOAuthService,
    private readonly api: GoogleCalendarApiService,
  ) {}

  getAuthUrl(businessId: string): { authUrl: string } {
    return { authUrl: this.oauth.buildAuthUrl(businessId) };
  }

  async handleCallback(businessId: string, code: string) {
    const tokenSet = await this.oauth.exchangeCode(code);

    if (!tokenSet.refreshToken) {
      throw new Error('Google did not return a refresh token');
    }

    const encrypted = encryptToken(tokenSet.refreshToken);

    await this.prisma.googleCalendarIntegration.upsert({
      where: { businessId },
      create: {
        businessId,
        encryptedRefreshToken: encrypted,
        status: CalendarIntegrationStatus.pending_calendars,
      },
      update: {
        encryptedRefreshToken: encrypted,
        status: CalendarIntegrationStatus.pending_calendars,
      },
    });
  }

  async getStatus(businessId: string) {
    const integration = await this.prisma.googleCalendarIntegration.findUnique({
      where: { businessId },
      select: {
        id: true,
        status: true,
        selectedCalendarIds: true,
        ignoredTitleWords: true,
        autoSendEnabled: true,
        sendDelayHours: true,
        lastSyncAt: true,
        createdAt: true,
      },
    });
    return { integration };
  }

  async listCalendars(businessId: string) {
    const integration = await this.requireIntegration(businessId);
    const accessToken = await this.getAccessToken(integration);
    const calendars = await this.api.listCalendars(accessToken);
    return { calendars };
  }

  async selectCalendars(businessId: string, dto: SelectCalendarsDto) {
    const integration = await this.requireIntegration(businessId);

    const updated = await this.prisma.googleCalendarIntegration.update({
      where: { id: integration.id },
      data: {
        selectedCalendarIds: dto.calendarIds,
        status:
          dto.calendarIds.length > 0
            ? CalendarIntegrationStatus.active
            : CalendarIntegrationStatus.pending_calendars,
      },
      select: { id: true, status: true, selectedCalendarIds: true },
    });

    return updated;
  }

  async patchConfig(businessId: string, dto: PatchCalendarConfigDto) {
    const integration = await this.requireIntegration(businessId);

    const updated = await this.prisma.googleCalendarIntegration.update({
      where: { id: integration.id },
      data: {
        ...(dto.ignoredTitleWords !== undefined
          ? { ignoredTitleWords: dto.ignoredTitleWords }
          : {}),
        ...(dto.autoSendEnabled !== undefined
          ? { autoSendEnabled: dto.autoSendEnabled }
          : {}),
        ...(dto.sendDelayHours !== undefined
          ? { sendDelayHours: dto.sendDelayHours }
          : {}),
      },
      select: {
        id: true,
        ignoredTitleWords: true,
        autoSendEnabled: true,
        sendDelayHours: true,
      },
    });

    return updated;
  }

  async disconnect(businessId: string) {
    const integration = await this.prisma.googleCalendarIntegration.findUnique({
      where: { businessId },
      select: { id: true, encryptedRefreshToken: true },
    });

    if (!integration) return;

    if (integration.encryptedRefreshToken) {
      try {
        const refreshToken = decryptToken(integration.encryptedRefreshToken);
        await this.oauth.revokeToken(refreshToken);
      } catch {
        // proceed with disconnect even if revoke fails
      }
    }

    await this.prisma.googleCalendarIntegration.update({
      where: { id: integration.id },
      data: {
        status: CalendarIntegrationStatus.revoked,
        encryptedRefreshToken: null,
        selectedCalendarIds: [],
      },
    });
  }

  async listEvents(
    businessId: string,
    opts: { limit?: number; status?: string },
  ) {
    const where: Record<string, unknown> = { businessId };
    if (opts.status) where.status = opts.status;

    const events = await this.prisma.calendarEvent.findMany({
      where,
      orderBy: { startAt: 'desc' },
      take: opts.limit ?? 50,
      select: {
        id: true,
        title: true,
        startAt: true,
        endAt: true,
        customerName: true,
        customerPhone: true,
        status: true,
        skipReason: true,
        processedAt: true,
        calendarId: true,
        createdAt: true,
      },
    });

    return { events };
  }

  async skipEvent(businessId: string, eventId: string) {
    const event = await this.prisma.calendarEvent.findFirst({
      where: { id: eventId, businessId },
      select: { id: true },
    });
    if (!event) throw new NotFoundException('Event not found');

    return this.prisma.calendarEvent.update({
      where: { id: eventId },
      data: { status: 'skipped', skipReason: 'manual_skip' },
      select: { id: true, status: true },
    });
  }

  private async requireIntegration(businessId: string) {
    const integration = await this.prisma.googleCalendarIntegration.findUnique({
      where: { businessId },
      select: { id: true, encryptedRefreshToken: true },
    });
    if (!integration) throw new NotFoundException('Google Calendar not connected');
    return integration;
  }

  private async getAccessToken(integration: {
    encryptedRefreshToken: string | null;
  }): Promise<string> {
    if (!integration.encryptedRefreshToken) {
      throw new NotFoundException('No refresh token stored');
    }
    const refreshToken = decryptToken(integration.encryptedRefreshToken);
    const tokenSet = await this.oauth.refreshAccessToken(refreshToken);
    return tokenSet.accessToken;
  }
}
