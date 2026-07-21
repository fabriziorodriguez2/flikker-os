import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createRedisConnection, REDIS_CONFIGURED } from './redis-connection';

export const RETENTION_QUEUE = 'retention';
export const RUN_RETENTION_DAILY_JOB = 'run-retention-daily';
export const SEND_RETENTION_MESSAGE_JOB = 'send-retention-message';

export interface SendRetentionMessageJobData {
  retentionSendId: string;
}

@Injectable()
export class RetentionQueue implements OnModuleInit, OnModuleDestroy {
  private connection?: IORedis;
  private queue?: Queue;

  async onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.queue = new Queue(RETENTION_QUEUE, { connection: this.connection });
    await this.queue.add(
      RUN_RETENTION_DAILY_JOB,
      {},
      {
        jobId: RUN_RETENTION_DAILY_JOB,
        repeat: { pattern: process.env.RETENTION_CRON ?? '0 10 * * *' },
        removeOnComplete: 30,
        removeOnFail: false,
      },
    );
  }

  async enqueueSendRetentionMessage(data: SendRetentionMessageJobData) {
    if (!this.queue) return null;
    return this.queue.add(SEND_RETENTION_MESSAGE_JOB, data, {
      attempts: 3,
      removeOnComplete: 100,
      removeOnFail: false,
    });
  }

  async enqueueDailyRun() {
    if (!this.queue) return null;
    return this.queue.add(RUN_RETENTION_DAILY_JOB, {}, { attempts: 1 });
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.connection?.quit();
  }
}
