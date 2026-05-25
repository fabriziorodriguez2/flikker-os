import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createRedisConnection, REDIS_CONFIGURED } from './redis-connection';

export const GOOGLE_CALENDAR_SEND_CHECK_QUEUE = 'google-calendar-send-check';
export const GOOGLE_CALENDAR_SEND_CHECK_JOB = 'calendar-send-check';

export interface CalendarSendCheckJobData {
  calendarEventId: string;
  businessId: string;
  integrationId: string;
  googleEventId: string;
  calendarId: string;
}

@Injectable()
export class GoogleCalendarSendCheckQueue
  implements OnModuleInit, OnModuleDestroy
{
  private connection?: IORedis;
  private queue?: Queue<CalendarSendCheckJobData>;

  onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.queue = new Queue<CalendarSendCheckJobData>(
      GOOGLE_CALENDAR_SEND_CHECK_QUEUE,
      { connection: this.connection },
    );
  }

  async enqueue(data: CalendarSendCheckJobData, delayMs = 0) {
    if (!this.queue) return null;
    return this.queue.add(GOOGLE_CALENDAR_SEND_CHECK_JOB, data, {
      delay: delayMs,
      attempts: 3,
      removeOnComplete: 100,
      removeOnFail: false,
    });
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.connection?.quit();
  }
}
