import { Injectable, Logger } from '@nestjs/common';

const BASE = 'https://www.googleapis.com/calendar/v3';

export interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  primary: boolean;
  accessRole: string;
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  status: string; // 'confirmed' | 'tentative' | 'cancelled'
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
}

@Injectable()
export class GoogleCalendarApiService {
  private readonly logger = new Logger(GoogleCalendarApiService.name);

  async listCalendars(
    accessToken: string,
  ): Promise<GoogleCalendarListEntry[]> {
    const res = await fetch(`${BASE}/users/me/calendarList`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      this.logger.error(`listCalendars failed: ${res.status}`);
      throw new Error('Failed to list calendars');
    }

    const data = await res.json();
    return (data.items ?? []).map((item: Record<string, unknown>) => ({
      id: item.id as string,
      summary: (item.summary as string | undefined) ?? '',
      primary: Boolean(item.primary),
      accessRole: (item.accessRole as string | undefined) ?? '',
    }));
  }

  async listEvents(
    accessToken: string,
    calendarId: string,
    timeMin: Date,
    timeMax: Date,
  ): Promise<GoogleCalendarEvent[]> {
    const params = new URLSearchParams({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });

    const url = `${BASE}/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      this.logger.error(
        `listEvents failed for calendar ${calendarId}: ${res.status}`,
      );
      throw new Error(`Failed to list events for calendar ${calendarId}`);
    }

    const data = await res.json();
    return (data.items ?? []).map(
      (item: Record<string, unknown>): GoogleCalendarEvent => ({
        id: item.id as string,
        summary: (item.summary as string | undefined) ?? '',
        status: (item.status as string | undefined) ?? 'confirmed',
        start: (item.start as GoogleCalendarEvent['start']) ?? {},
        end: (item.end as GoogleCalendarEvent['end']) ?? {},
      }),
    );
  }

  async getEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
  ): Promise<GoogleCalendarEvent | null> {
    const url = `${BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 404 || res.status === 410) return null;
    if (!res.ok) return null;
    const data = await res.json();
    return {
      id: data.id as string,
      summary: (data.summary as string | undefined) ?? '',
      status: (data.status as string | undefined) ?? 'confirmed',
      start: (data.start as GoogleCalendarEvent['start']) ?? {},
      end: (data.end as GoogleCalendarEvent['end']) ?? {},
    };
  }
}

export function resolveEventDateTime(
  dt: GoogleCalendarEvent['start'],
): Date | null {
  if (dt.dateTime) return new Date(dt.dateTime);
  if (dt.date) return new Date(`${dt.date}T00:00:00.000Z`);
  return null;
}
