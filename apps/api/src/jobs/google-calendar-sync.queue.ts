import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createRedisConnection, REDIS_CONFIGURED } from './redis-connection';

export const GOOGLE_CALENDAR_SYNC_QUEUE = 'google-calendar-sync';
export const GOOGLE_CALENDAR_SYNC_JOB = 'google-calendar-sync-run';

@Injectable()
export class GoogleCalendarSyncQueue implements OnModuleInit, OnModuleDestroy {
  private connection?: IORedis;
  private queue?: Queue;

  async onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.queue = new Queue(GOOGLE_CALENDAR_SYNC_QUEUE, {
      connection: this.connection,
    });

    await this.queue.add(
      GOOGLE_CALENDAR_SYNC_JOB,
      {},
      {
        jobId: GOOGLE_CALENDAR_SYNC_JOB,
        repeat: {
          pattern:
            process.env.GOOGLE_CALENDAR_SYNC_CRON ?? '*/30 * * * *',
        },
        removeOnComplete: 30,
        removeOnFail: false,
      },
    );
  }

  async triggerManualSync() {
    if (!this.queue) return null;
    return this.queue.add(
      GOOGLE_CALENDAR_SYNC_JOB,
      {},
      { attempts: 1, removeOnComplete: 10 },
    );
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.connection?.quit();
  }
}
