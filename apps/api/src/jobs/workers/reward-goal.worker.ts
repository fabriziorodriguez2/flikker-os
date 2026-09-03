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
import { MissionSweepService } from '../../modules/missions/mission-sweep.service';
import { ReturnChallengeSweepService } from '../../modules/return-challenges/return-challenge-sweep.service';

/**
 * Runs the Reward Goal reconciliation sweep (Fase E §33). Real, not dry-run.
 *
 * Desde Misiones (Fase 1 de gamificación) este mismo tick diario dispara
 * TAMBIÉN el barrido de misiones. Deliberadamente no se abrió una queue
 * propia: es una reconciliación una-vez-por-día sobre una feature nueva y de
 * bajo volumen, y el `allSettled` de abajo ya garantiza que un fallo en un
 * barrido no saltee los otros — que es la razón por la que existía la
 * separación de colas. Si algún día el barrido de misiones se vuelve pesado o
 * necesita su propia cadencia, se parte a su propia queue siguiendo el mismo
 * patrón que `RewardGoalQueue`.
 */
@Injectable()
export class RewardGoalWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RewardGoalWorker.name);
  private connection?: IORedis;
  private worker?: Worker;

  constructor(
    private readonly sweep: RewardGoalSweepService,
    private readonly missions: MissionSweepService,
    private readonly returnChallenges: ReturnChallengeSweepService,
  ) {}

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
      const [sweep, expiry, missionRewards, missionExpiry, challengeExpiry] =
        await Promise.allSettled([
          this.sweep.runDaily(now, false),
          this.sweep.expireOverdue(now),
          this.missions.reconcilePendingRewards(),
          this.missions.expireOverdue(now),
          this.returnChallenges.expireOverdue(now),
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
      if (missionRewards.status === 'rejected') {
        this.logger.error(
          `Mission reward reconciliation failed: ${String(missionRewards.reason)}`,
        );
      }
      if (missionExpiry.status === 'rejected') {
        this.logger.error(
          `Mission expiry sweep failed: ${String(missionExpiry.reason)}`,
        );
      }
      if (challengeExpiry.status === 'rejected') {
        this.logger.error(
          `Return challenge expiry sweep failed: ${String(challengeExpiry.reason)}`,
        );
      }
      return {
        sweep: sweep.status === 'fulfilled' ? sweep.value : null,
        expiry: expiry.status === 'fulfilled' ? expiry.value : null,
        missionRewards:
          missionRewards.status === 'fulfilled' ? missionRewards.value : null,
        missionExpiry:
          missionExpiry.status === 'fulfilled' ? missionExpiry.value : null,
        challengeExpiry:
          challengeExpiry.status === 'fulfilled' ? challengeExpiry.value : null,
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
