import { PrismaService } from '../../prisma/prisma.service';
import { bootIsolatedSimulationContext } from './simulation-context';
import { SimulationRootModule } from './simulation-root.module';
import { SimulationSeeder } from './simulation-seeder';
import {
  SimulationEngineService,
  type DayResult,
} from './simulation-engine.service';
import { SimulationInvariantService } from './simulation-invariants.service';
import { SimulationResultsService } from './simulation-results.service';
import { SimulationClock } from './simulation-clock';
import { createSeededRandom } from './prng';
import { SCENARIO_DEFINITIONS } from './scenarios';

/**
 * §21/§22/§23 — the full pipeline, end to end, against real Postgres:
 * seed → run the real engine N days → check invariants → compute results.
 * Skipped, not failed, without `SIMULATION_DATABASE_URL`.
 */
const simulationDatabaseUrl = process.env.SIMULATION_DATABASE_URL;
const describeIfConfigured = simulationDatabaseUrl ? describe : describe.skip;

function dbNameOf(url: string): string {
  return new URL(url).pathname.replace(/^\//, '');
}

async function cleanup(prisma: PrismaService, businessId: string) {
  await prisma.visit.deleteMany({ where: { businessId } });
  await prisma.message.deleteMany({ where: { businessId } });
  await prisma.benefitParticipation.deleteMany({ where: { businessId } });
  await prisma.retentionVariant.deleteMany({ where: { businessId } });
  await prisma.retentionExperiment.deleteMany({ where: { businessId } });
  await prisma.retentionIncentiveDefinition.deleteMany({
    where: { businessId },
  });
  await prisma.retentionSettings.deleteMany({ where: { businessId } });
  await prisma.customer.deleteMany({ where: { businessId } });
  await prisma.business.delete({ where: { id: businessId } });
}

describeIfConfigured(
  'Simulation pipeline (integration) — §21/§22/§23: seed → run → invariants → results',
  () => {
    it('produces a structured, internally-consistent SimulationResult from a real 20-day run', async () => {
      const app = await bootIsolatedSimulationContext(
        SimulationRootModule,
        simulationDatabaseUrl!,
      );
      const prisma = app.get(PrismaService);
      const seeder = app.get(SimulationSeeder);
      const engine = app.get(SimulationEngineService);
      const invariants = app.get(SimulationInvariantService);
      const resultsService = app.get(SimulationResultsService);

      // Skewed toward PROGRESS_SENSITIVE so there is a real, detectable
      // ground-truth winner to check the pipeline's numbers against.
      const def = {
        ...SCENARIO_DEFINITIONS.PROGRESS_SENSITIVE,
        customerCount: 150,
      };
      const runLabel = `resultstest${Date.now()}`;
      const clock = new SimulationClock();
      const startedAt = Date.now();

      let businessId: string | undefined;
      try {
        const seeded = await seeder.seed(
          def,
          createSeededRandom(def.seed),
          clock.now(),
          runLabel,
        );
        businessId = seeded.businessId;
        engine.init(
          seeded.businessId,
          seeded.customers,
          def,
          createSeededRandom(def.seed + 1),
        );

        const dayHistory: DayResult[] = [];
        for (let day = 0; day < 20; day++) {
          dayHistory.push(await engine.runDay(clock));
          clock.advanceDays(1);
        }

        const invariantResults = await invariants.checkAll({
          businessId: seeded.businessId,
          experimentId: seeded.experimentId,
          now: clock.now(),
          timezone: 'America/Montevideo',
          expectedSimulationDatabaseName: dbNameOf(simulationDatabaseUrl!),
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

        // Internal consistency, not exact magic numbers — those depend on
        // the seeded random walk and would make this test brittle.
        expect(result.customersCreated).toBe(150);
        expect(result.visibleReturns).toBeLessThanOrEqual(
          result.physicalReturns,
        );
        expect(result.checkinVisibilityRate).toBeGreaterThanOrEqual(0);
        expect(result.checkinVisibilityRate).toBeLessThanOrEqual(1);
        expect(result.trueWinner).toBe('PROGRESS_REMINDER');
        expect(['CORRECT', 'NO_CONCLUSION', 'INCORRECT']).toContain(
          result.winnerAccuracy,
        );
        expect(
          Object.values(result.finalAllocation).reduce((s, v) => s + v, 0),
        ).toBe(100);
        expect(result.invariantResults.every((r) => r.status !== 'FAIL')).toBe(
          true,
        );
        expect(result.durationMs).toBeGreaterThan(0);
      } finally {
        if (businessId) await cleanup(prisma, businessId);
        await app.close();
      }
    }, 60_000);
  },
);
