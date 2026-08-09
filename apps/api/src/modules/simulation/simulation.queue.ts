import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import {
  createRedisConnection,
  REDIS_CONFIGURED,
} from '../../jobs/redis-connection';

export const SIMULATION_QUEUE = 'simulation-run';
export const RUN_SIMULATION_JOB = 'run-simulation';

export interface SimulationJobData {
  simulationRunId: string;
}

/**
 * §26 — a simulation must never run inside the HTTP request that created
 * it (a run can take minutes). Its own queue, separate from every business
 * queue in `src/jobs/` — a backlog or incident here must never touch real
 * production jobs, and vice versa; this module is otherwise fully
 * self-contained under `src/modules/simulation/` on purpose (§1).
 */
@Injectable()
export class SimulationQueue implements OnModuleInit, OnModuleDestroy {
  private connection?: IORedis;
  private queue?: Queue<SimulationJobData>;

  onModuleInit() {
    if (!REDIS_CONFIGURED) return;
    this.connection = createRedisConnection();
    this.queue = new Queue<SimulationJobData>(SIMULATION_QUEUE, {
      connection: this.connection,
    });
  }

  async enqueue(simulationRunId: string) {
    if (!this.queue) return null;
    return this.queue.add(
      RUN_SIMULATION_JOB,
      { simulationRunId },
      {
        jobId: simulationRunId,
        attempts: 1,
        removeOnComplete: 50,
        removeOnFail: false,
      },
    );
  }

  async onModuleDestroy() {
    await this.queue?.close();
    await this.connection?.quit();
  }
}
