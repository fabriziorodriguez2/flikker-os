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
  RETENTION_OPTIMIZATION_QUEUE,
  RUN_OPTIMIZATION_SWEEP_JOB,
} from '../retention-optimization.queue';
import { RetentionOptimizationService } from '../../modules/retention-v2/retention-optimization.service';

/**
 * Fase G §26 — runs the automatic-optimization sweep. Real, not dry-run
 * (`RetentionOptimizationService.run()` itself still checks each
 * experiment's own `dryRunEnabled` and applies nothing when it's on — see
 * Fase G §33).
 */
@Injectable()
export class RetentionOptimizationWorker
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(RetentionOptimizationWorker.name);
  private connection?: IORedis;
  private worker?: Worker;

  constructor(private readonly optimization: RetentionOptimizationService) {}

  onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.worker = new Worker(
      RETENTION_OPTIMIZATION_QUEUE,
      (job) => this.process(job),
      { connection: this.connection },
    );
  }

  async process(job: Job) {
    if (job.name === RUN_OPTIMIZATION_SWEEP_JOB) {
      return this.optimization.sweepAutomatic(new Date());
    }
    this.logger.warn(`Unknown retention-optimization job: ${job.name}`);
    return null;
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.connection?.quit();
  }
}
