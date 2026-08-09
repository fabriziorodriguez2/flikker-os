import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { SimulationConfigService } from './simulation-config.service';
import { SimulationRepository } from './simulation.repository';
import { SimulationQueue } from './simulation.queue';
import { resolveScenarioDefinition } from './scenarios';
import type { CreateSimulationRunDto } from './dto/create-simulation-run.dto';

export interface SimulationStatusResponse {
  available: boolean;
  enabled: boolean;
  databaseConfigured: boolean;
  unavailableReason: 'DISABLED' | 'DATABASE_NOT_CONFIGURED' | null;
  maxConcurrentRuns: number;
  maxCustomers: number;
  maxDays: number;
}

/**
 * Simulation Center — platform admin only (§1/§25).
 */
@Injectable()
export class SimulationService {
  constructor(
    private readonly config: SimulationConfigService,
    private readonly repository: SimulationRepository,
    private readonly queue: SimulationQueue,
  ) {}

  /**
   * §25/§42 — the panel must be able to show "Simulation environment not
   * configured" without needing a real simulation database at all.
   */
  getStatus(): SimulationStatusResponse {
    return {
      available: this.config.available,
      enabled: this.config.enabled,
      databaseConfigured: this.config.databaseUrl !== null,
      unavailableReason: this.config.unavailableReason,
      maxConcurrentRuns: this.config.maxConcurrentRuns,
      maxCustomers: this.config.maxCustomers,
      maxDays: this.config.maxDays,
    };
  }

  listRuns() {
    return this.repository.list();
  }

  async getRun(id: string) {
    const run = await this.repository.findOne(id);
    if (!run) throw new NotFoundException('Simulation run not found');
    return run;
  }

  /**
   * §25/§26/§27 — validates the deployment is configured and under its
   * concurrency ceiling, resolves the scenario + overrides into the exact
   * configuration the run will use, creates the `PENDING` row, and enqueues
   * it — the HTTP request never waits for the run itself.
   */
  async createRun(createdByUserId: string, dto: CreateSimulationRunDto) {
    if (!this.config.available) {
      throw new ConflictException(
        `Simulation environment not configured (${this.config.unavailableReason ?? 'unknown reason'}).`,
      );
    }

    const active = await this.repository.countActive();
    if (active >= this.config.maxConcurrentRuns) {
      throw new ConflictException(
        `Maximum concurrent simulation runs (${this.config.maxConcurrentRuns}) already in progress.`,
      );
    }

    const resolved = resolveScenarioDefinition(dto.scenario, dto, {
      maxDays: this.config.maxDays,
      maxCustomers: this.config.maxCustomers,
    });

    const created = await this.repository.create({
      scenario: dto.scenario,
      seed: resolved.seed,
      days: resolved.days,
      customerCount: resolved.customerCount,
      withAi: resolved.withAiDefault,
      configuration: resolved as unknown as Prisma.InputJsonValue,
      createdByUserId,
    });

    await this.queue.enqueue(created.id);

    return created;
  }

  /** §28 — cooperative: only requests cancellation, the worker does the rest. */
  async cancelRun(id: string) {
    const result = await this.repository.requestCancel(id);
    if (result.count === 0) {
      throw new NotFoundException(
        'Simulation run not found, or already finished.',
      );
    }
    return { cancelRequested: true };
  }
}
