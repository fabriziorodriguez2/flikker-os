import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createRedisConnection, REDIS_CONFIGURED } from './redis-connection';

export const RETENTION_OPTIMIZATION_QUEUE = 'retention-optimization';
export const RUN_OPTIMIZATION_SWEEP_JOB = 'run-optimization-sweep';

/**
 * Fase G §26 — its own queue, deliberately separate from `RetentionV2Queue`
 * and `RewardGoalQueue` (same reasoning as Fase E §33 gave for that one: a
 * backlog or incident in one engine's queue must never block another's).
 *
 * Cadence: once a day is enough (Fase G §26 — "no hace falta cada hora").
 * Every experiment this touches must ALREADY be RUNNING with real traffic;
 * there is no per-visit trigger to keep in sync with, unlike Reward Goals.
 */
@Injectable()
export class RetentionOptimizationQueue
  implements OnModuleInit, OnModuleDestroy
{
  private connection?: IORedis;
  private queue?: Queue;

  async onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.queue = new Queue(RETENTION_OPTIMIZATION_QUEUE, {
      connection: this.connection,
    });
    await this.queue.add(
      RUN_OPTIMIZATION_SWEEP_JOB,
      {},
      {
        jobId: RUN_OPTIMIZATION_SWEEP_JOB,
        repeat: {
          pattern: process.env.RETENTION_OPTIMIZATION_SWEEP_CRON ?? '0 9 * * *',
        },
        removeOnComplete: 30,
        removeOnFail: false,
      },
    );
  }

  async enqueueSweepRun() {
    if (!this.queue) return null;
    return this.queue.add(RUN_OPTIMIZATION_SWEEP_JOB, {}, { attempts: 1 });
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.connection?.quit();
  }
}
