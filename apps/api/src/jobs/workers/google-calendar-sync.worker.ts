import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { createRedisConnection, REDIS_CONFIGURED } from '../redis-connection';
import {
  GOOGLE_CALENDAR_SYNC_QUEUE,
  GOOGLE_CALENDAR_SYNC_JOB,
} from '../google-calendar-sync.queue';
import { GoogleCalendarSyncService } from '../../modules/integrations/google-calendar/google-calendar-sync.service';

@Injectable()
export class GoogleCalendarSyncWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GoogleCalendarSyncWorker.name);
  private connection?: IORedis;
  private worker?: Worker;

  constructor(private readonly syncService: GoogleCalendarSyncService) {}

  onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.worker = new Worker(
      GOOGLE_CALENDAR_SYNC_QUEUE,
      async (job) => {
        if (job.name !== GOOGLE_CALENDAR_SYNC_JOB) return;
        const result = await this.syncService.syncAll();
        this.logger.log(
          `Calendar sync complete: synced=${result.synced} failed=${result.failed}`,
        );
        return result;
      },
      { connection: this.connection },
    );

    this.worker.on('failed', (job, err) => {
      this.logger.error(
        `Calendar sync job ${job?.id ?? 'unknown'} failed: ${err.message}`,
      );
    });
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.connection?.quit();
  }
}
