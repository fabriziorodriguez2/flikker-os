import { Injectable, Logger } from '@nestjs/common';
import { Prisma, SimulationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { SimulationConfigService } from './simulation-config.service';
import { bootIsolatedSimulationContext } from './simulation-context';
import { SimulationRootModule } from './simulation-root.module';
import { SimulationSeeder } from './simulation-seeder';
import {
  SimulationEngineService,
  type DayResult,
} from './simulation-engine.service';
import { SimulationInvariantService } from './simulation-invariants.service';
import { SimulationResultsService } from './simulation-results.service';
import { diagnose } from './simulation-diagnosis';
import { SimulationClock } from './simulation-clock';
import { createSeededRandom } from './prng';
import type { ScenarioDefinition } from './scenarios';

function dbNameOf(url: string): string {
  return new URL(url).pathname.replace(/^\//, '');
}

function isScenarioDefinition(value: unknown): value is ScenarioDefinition {
  return (
    typeof value === 'object' &&
    value !== null &&
    'days' in value &&
    'customerCount' in value &&
    'seed' in value &&
    'business' in value &&
    'experimentAllocation' in value &&
    'personaMix' in value &&
    'failureInjection' in value
  );
}

/**
 * Simulation Center §26/§27/§28 — the actual execution, run OUTSIDE the
 * HTTP request that created it (a queue worker calls `run()`, never a
 * controller directly). Boots a fresh isolated Nest context per run
 * (§1/§2), drives the real day loop (batch 5), then computes invariants +
 * results + diagnosis (batch 6) and persists everything onto the
 * `SimulationRun` row in the MAIN database — never the simulated business
 * data itself, which stays in the isolated database until cleanup (§37).
 */
@Injectable()
export class SimulationRunnerService {
  private readonly logger = new Logger(SimulationRunnerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: SimulationConfigService,
  ) {}

  async run(simulationRunId: string): Promise<void> {
    const run = await this.prisma.simulationRun.findUnique({
      where: { id: simulationRunId },
    });
    if (!run) {
      this.logger.warn(
        `SimulationRun ${simulationRunId} not found — skipping.`,
      );
      return;
    }
    if (run.status !== SimulationStatus.PENDING) {
      this.logger.warn(
        `SimulationRun ${simulationRunId} is ${run.status}, not PENDING — skipping (already processed or cancelled).`,
      );
      return;
    }

    // §2/§42 — never run against a database that isn't the dedicated
    // simulation one. If the deployment isn't configured, fail loudly on
    // this run rather than silently falling back to anything else.
    if (!this.config.available || !this.config.databaseUrl) {
      await this.markFailed(
        simulationRunId,
        'Simulation environment not configured (SIMULATION_ENABLED/SIMULATION_DATABASE_URL).',
      );
      return;
    }

    if (!isScenarioDefinition(run.configuration)) {
      await this.markFailed(
        simulationRunId,
        'Stored configuration is not a valid scenario definition.',
      );
      return;
    }
    const def = run.configuration;

    await this.prisma.simulationRun.update({
      where: { id: simulationRunId },
      data: { status: SimulationStatus.RUNNING, startedAt: new Date() },
    });

    const startedAt = Date.now();
    let app:
      | Awaited<ReturnType<typeof bootIsolatedSimulationContext>>
      | undefined;
    try {
      app = await bootIsolatedSimulationContext(
        SimulationRootModule,
        this.config.databaseUrl,
      );

      const seeder = app.get(SimulationSeeder);
      const engine = app.get(SimulationEngineService);
      const invariantsService = app.get(SimulationInvariantService);
      const resultsService = app.get(SimulationResultsService);

      const clock = new SimulationClock();
      const seeded = await seeder.seed(
        def,
        createSeededRandom(def.seed),
        clock.now(),
        simulationRunId,
      );
      engine.init(
        seeded.businessId,
        seeded.customers,
        def,
        createSeededRandom(def.seed + 1),
      );

      const dayHistory: DayResult[] = [];
      for (let day = 0; day < def.days; day++) {
        const cancelled = await this.isCancelRequested(simulationRunId);
        if (cancelled) {
          await this.prisma.simulationRun.update({
            where: { id: simulationRunId },
            data: {
              status: SimulationStatus.CANCELLED,
              finishedAt: new Date(),
            },
          });
          return;
        }

        dayHistory.push(await engine.runDay(clock));
        clock.advanceDays(1);

        await this.prisma.simulationRun.update({
          where: { id: simulationRunId },
          data: {
            progress: Math.round(((day + 1) / def.days) * 100),
            currentVirtualDay: clock.currentVirtualDay,
          },
        });
      }

      const invariantResults = await invariantsService.checkAll({
        businessId: seeded.businessId,
        experimentId: seeded.experimentId,
        now: clock.now(),
        timezone: 'America/Montevideo',
        expectedSimulationDatabaseName: dbNameOf(this.config.databaseUrl),
        maxAiCallsDefault: def.maxAiCallsDefault,
      });

      const result = await resultsService.compute({
        businessId: seeded.businessId,
        experimentId: seeded.experimentId,
        scenario: def,
        customers: seeded.customers,
        dayHistory,
        invariantResults,
        durationMs: Date.now() - startedAt,
      });

      const diagnosis = diagnose(result);
      const hasCriticalFailure = invariantResults.some(
        (r) => r.critical && r.status === 'FAIL',
      );

      await this.prisma.simulationRun.update({
        where: { id: simulationRunId },
        data: {
          status: hasCriticalFailure
            ? SimulationStatus.FAILED
            : SimulationStatus.COMPLETED,
          progress: 100,
          finishedAt: new Date(),
          results: result as unknown as Prisma.InputJsonValue,
          summary: diagnosis as unknown as Prisma.InputJsonValue,
          failureReason: hasCriticalFailure
            ? 'One or more critical invariants failed — see results.invariantResults.'
            : null,
        },
      });
    } catch (error) {
      await this.markFailed(
        simulationRunId,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      await app?.close();
    }
  }

  private async isCancelRequested(simulationRunId: string): Promise<boolean> {
    const fresh = await this.prisma.simulationRun.findUnique({
      where: { id: simulationRunId },
      select: { cancelRequested: true },
    });
    return fresh?.cancelRequested ?? false;
  }

  private async markFailed(simulationRunId: string, reason: string) {
    this.logger.error(`SimulationRun ${simulationRunId} failed: ${reason}`);
    await this.prisma.simulationRun.update({
      where: { id: simulationRunId },
      data: {
        status: SimulationStatus.FAILED,
        finishedAt: new Date(),
        failureReason: reason,
      },
    });
  }
}
