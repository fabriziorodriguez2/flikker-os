import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from '../../prisma/prisma.module';
import { CheckinModule } from '../checkin/checkin.module';
import { RetentionV2Module } from '../retention-v2/retention-v2.module';
import { RewardGoalsModule } from '../reward-goals/reward-goals.module';
import { RetentionExperimentMetricsService } from '../retention-v2/retention-experiment-metrics.service';
import { SimulationSeeder } from './simulation-seeder';
import { SimulationEngineService } from './simulation-engine.service';
import { SimulationInvariantService } from './simulation-invariants.service';
import { SimulationResultsService } from './simulation-results.service';

/**
 * §1 — the isolated Nest application context every simulation run boots
 * into via `bootIsolatedSimulationContext`. Imports the REAL, unchanged
 * `PrismaModule` — isolation comes entirely from which `DATABASE_URL` is in
 * `process.env` at the moment this context boots (see
 * `simulation-context.ts`), never from a different Prisma wiring here.
 *
 * `CheckinModule` is imported for its exported `VisitsRepository` only —
 * the engine calls that directly (§11's physical-vs-visible distinction)
 * rather than `CheckinService`, which bundles session/token/real-messaging
 * side effects meant for the HTTP QR flow (see `simulation-engine.service.ts`
 * for the full rationale). `CheckinModule` transitively imports
 * `RetentionV2Module` → the real `AiModule` — exactly why
 * `bootIsolatedSimulationContext` already blanks `OPENAI_API_KEY`/
 * `AI_ENABLED` for the boot window (§4/§43), regardless of what real
 * `OpenAiProviderService` ends up instantiated, unreachable, in this graph.
 *
 * `ThrottlerModule.forRoot(...)` — `CheckinController` (inside
 * `CheckinModule`, unchanged) guards its routes with `ThrottlerGuard`,
 * which needs `THROTTLER:MODULE_OPTIONS` available somewhere in the graph.
 * The main app gets this for free from `AppModule`'s own registration;
 * this isolated context needs the identical registration repeated here —
 * same config, no HTTP server ever listens on it since this context never
 * calls `.listen()`.
 *
 * `RetentionV2Module` is imported directly too (not only transitively via
 * `CheckinModule`) so `SimulationEngineService` can inject
 * `RetentionV2EvaluateService`/`RetentionV2SendService`/
 * `RetentionOutcomeService` — `CheckinModule` doesn't re-export them.
 * Importing the same module twice in one graph is fine in Nest; it stays a
 * single shared instance.
 *
 * `RewardGoalsModule` — for `RewardGoalSweepService` (creates new ACTIVE
 * goals) and `RewardGoalOrchestratorService` (the real per-visit unlock
 * entry point the check-in flow calls, reused directly since the engine
 * bypasses `CheckinService` itself — see `simulation-engine.service.ts`).
 *
 * `RetentionExperimentMetricsService` is registered directly here (not only
 * via `RetentionV2Module`, which does not export it) — its own constructor
 * needs nothing beyond `PrismaService`, already in this graph, so a second
 * instance is harmless (it is stateless/read-only) and no real module file
 * needs editing just to export one more name.
 */
@Module({
  imports: [
    PrismaModule,
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    CheckinModule,
    RetentionV2Module,
    RewardGoalsModule,
  ],
  providers: [
    SimulationSeeder,
    SimulationEngineService,
    SimulationInvariantService,
    RetentionExperimentMetricsService,
    SimulationResultsService,
  ],
  exports: [
    SimulationSeeder,
    SimulationEngineService,
    SimulationInvariantService,
    SimulationResultsService,
  ],
})
export class SimulationRootModule {}
