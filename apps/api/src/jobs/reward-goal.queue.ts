import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { createRedisConnection, REDIS_CONFIGURED } from './redis-connection';

export const REWARD_GOAL_QUEUE = 'reward-goals';
export const RUN_REWARD_GOAL_SWEEP_JOB = 'run-reward-goal-sweep';

/**
 * Reward Goals' own queue (Fase E §33) — deliberately separate from
 * `RetentionV2Queue`, even though both are BullMQ-backed cron sweeps: keeping
 * the two engines' operational infrastructure apart mirrors keeping their
 * business logic apart (Fase E §24), so an incident or backlog in one queue
 * can never block the other.
 *
 * Cadence: once a day is enough for the reconciliation role this sweep plays
 * — the primary trigger is per-Visit (`RewardGoalOrchestratorService`), which
 * runs synchronously inside the check-in request, not through this queue.
 */
@Injectable()
export class RewardGoalQueue implements OnModuleInit, OnModuleDestroy {
  private connection?: IORedis;
  private queue?: Queue;

  async onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.queue = new Queue(REWARD_GOAL_QUEUE, { connection: this.connection });
    await this.queue.add(
      RUN_REWARD_GOAL_SWEEP_JOB,
      {},
      {
        jobId: RUN_REWARD_GOAL_SWEEP_JOB,
        repeat: { pattern: process.env.REWARD_GOAL_SWEEP_CRON ?? '0 8 * * *' },
        removeOnComplete: 30,
        removeOnFail: false,
      },
    );
  }

  async enqueueSweepRun() {
    if (!this.queue) return null;
    return this.queue.add(RUN_REWARD_GOAL_SWEEP_JOB, {}, { attempts: 1 });
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.connection?.quit();
  }
}
