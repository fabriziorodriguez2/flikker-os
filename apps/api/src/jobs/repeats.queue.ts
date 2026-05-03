import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createRedisConnection, REDIS_CONFIGURED } from './redis-connection';

export const REPEATS_QUEUE = 'repeats';
export const RUN_REPEATS_DAILY_JOB = 'run-repeats-daily';
export const SEND_REPEAT_MESSAGE_JOB = 'send-repeat-message';

export interface SendRepeatMessageJobData {
  executionId: string;
}

@Injectable()
export class RepeatsQueue implements OnModuleInit, OnModuleDestroy {
  private connection?: IORedis;
  private queue?: Queue;

  async onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.queue = new Queue(REPEATS_QUEUE, { connection: this.connection });
    await this.queue.add(
      RUN_REPEATS_DAILY_JOB,
      {},
      {
        jobId: RUN_REPEATS_DAILY_JOB,
        repeat: { pattern: process.env.REPEATS_CRON ?? '0 9 * * *' },
        removeOnComplete: 30,
        removeOnFail: false,
      },
    );
  }

  async enqueueSendRepeatMessage(data: SendRepeatMessageJobData) {
    if (!this.queue) return null;

    return this.queue.add(SEND_REPEAT_MESSAGE_JOB, data, {
      attempts: 3,
      removeOnComplete: 100,
      removeOnFail: false,
    });
  }

  async enqueueDailyRun() {
    if (!this.queue) return null;
    return this.queue.add(RUN_REPEATS_DAILY_JOB, {}, { attempts: 1 });
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.connection?.quit();
  }
}
