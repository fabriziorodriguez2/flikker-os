import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createRedisConnection, REDIS_CONFIGURED } from './redis-connection';

export const RAFFLE_QUEUE = 'raffle';
export const RUN_RAFFLE_TICK_JOB = 'run-raffle-tick';
export const SEND_RAFFLE_NOTIFICATIONS_JOB = 'send-raffle-notifications';

export interface SendRaffleNotificationsJobData {
  drawId: string;
}

@Injectable()
export class RaffleQueue implements OnModuleInit, OnModuleDestroy {
  private connection?: IORedis;
  private queue?: Queue;

  async onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.queue = new Queue(RAFFLE_QUEUE, { connection: this.connection });
    // Ticks every 10 minutes so the 23:50 local-time draw window (per business
    // timezone) is always hit by exactly one tick, without a full scheduler.
    await this.queue.add(
      RUN_RAFFLE_TICK_JOB,
      {},
      {
        jobId: RUN_RAFFLE_TICK_JOB,
        repeat: { pattern: process.env.RAFFLE_TICK_CRON ?? '*/10 * * * *' },
        removeOnComplete: 30,
        removeOnFail: false,
      },
    );
  }

  async enqueueSendRaffleNotifications(data: SendRaffleNotificationsJobData) {
    if (!this.queue) return null;
    return this.queue.add(SEND_RAFFLE_NOTIFICATIONS_JOB, data, {
      attempts: 3,
      removeOnComplete: 100,
      removeOnFail: false,
    });
  }

  async enqueueTick() {
    if (!this.queue) return null;
    return this.queue.add(RUN_RAFFLE_TICK_JOB, {}, { attempts: 1 });
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.connection?.quit();
  }
}
