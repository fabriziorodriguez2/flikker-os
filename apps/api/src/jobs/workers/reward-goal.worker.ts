import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { createRedisConnection, REDIS_CONFIGURED } from '../redis-connection';
import {
  REWARD_GOAL_QUEUE,
  RUN_REWARD_GOAL_SWEEP_JOB,
} from '../reward-goal.queue';
import { RewardGoalSweepService } from '../../modules/reward-goals/reward-goal-sweep.service';

/** Runs the Reward Goal reconciliation sweep (Fase E §33). Real, not dry-run. */
@Injectable()
export class RewardGoalWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RewardGoalWorker.name);
  private connection?: IORedis;
  private worker?: Worker;

  constructor(private readonly sweep: RewardGoalSweepService) {}

  onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.worker = new Worker(REWARD_GOAL_QUEUE, (job) => this.process(job), {
      connection: this.connection,
    });
  }

  async process(job: Job) {
    if (job.name === RUN_REWARD_GOAL_SWEEP_JOB) {
      const now = new Date();
      // Same daily cron drives both reconciliations (Fase F §0.1): creation
      // sweep and expiry sweep are independent concerns but need no separate
      // queue/schedule — a failure in one must not skip the other.
      const [sweep, expiry] = await Promise.allSettled([
        this.sweep.runDaily(now, false),
        this.sweep.expireOverdue(now),
      ]);
      if (sweep.status === 'rejected') {
        this.logger.error(
          `Reward goal creation sweep failed: ${String(sweep.reason)}`,
        );
      }
      if (expiry.status === 'rejected') {
        this.logger.error(
          `Reward goal expiry sweep failed: ${String(expiry.reason)}`,
        );
      }
      return {
        sweep: sweep.status === 'fulfilled' ? sweep.value : null,
        expiry: expiry.status === 'fulfilled' ? expiry.value : null,
      };
    }
    this.logger.warn(`Unknown reward-goal job: ${job.name}`);
    return null;
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.connection?.quit();
  }
}
