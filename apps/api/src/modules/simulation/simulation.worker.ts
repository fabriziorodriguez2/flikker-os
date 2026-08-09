import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import IORedis from 'ioredis';
import {
  createRedisConnection,
  REDIS_CONFIGURED,
} from '../../jobs/redis-connection';
import {
  RUN_SIMULATION_JOB,
  SIMULATION_QUEUE,
  type SimulationJobData,
} from './simulation.queue';
import { SimulationRunnerService } from './simulation-runner.service';

/**
 * §26/§27 — picks up exactly one job per `SimulationRun` (the queue's
 * `jobId` is the run's own id, so a duplicate enqueue is a no-op) and
 * delegates everything to `SimulationRunnerService`, which is independently
 * unit/integration-testable without any of this BullMQ plumbing — exactly
 * the same split every other worker in this codebase already uses.
 */
@Injectable()
export class SimulationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SimulationWorker.name);
  private connection?: IORedis;
  private worker?: Worker<SimulationJobData>;

  constructor(private readonly runner: SimulationRunnerService) {}

  onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.worker = new Worker<SimulationJobData>(
      SIMULATION_QUEUE,
      (job) => this.process(job),
      { connection: this.connection, concurrency: 1 },
    );
  }

  async process(job: Job<SimulationJobData>) {
    if (job.name !== RUN_SIMULATION_JOB) {
      this.logger.warn(`Unknown simulation job: ${job.name}`);
      return;
    }
    await this.runner.run(job.data.simulationRunId);
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.connection?.quit();
  }
}
