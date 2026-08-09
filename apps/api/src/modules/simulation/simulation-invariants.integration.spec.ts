import { PrismaService } from '../../prisma/prisma.service';
import { bootIsolatedSimulationContext } from './simulation-context';
import { SimulationRootModule } from './simulation-root.module';
import { SimulationSeeder } from './simulation-seeder';
import { SimulationEngineService } from './simulation-engine.service';
import { SimulationInvariantService } from './simulation-invariants.service';
import { SimulationClock } from './simulation-clock';
import { createSeededRandom } from './prng';
import { SCENARIO_DEFINITIONS } from './scenarios';

/**
 * §20 — the invariant checker, run against real data produced by the real
 * seeder + engine (batch 5) over several virtual days. This is the
 * strongest signal available short of a full mandatory run (batch 9): a
 * genuinely-generated simulation should report every invariant PASS.
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
  'SimulationInvariantService (integration) — §20: PASS on a genuinely-generated run',
  () => {
    it('reports every invariant PASS after seeding + running the real engine for 15 days', async () => {
      const app = await bootIsolatedSimulationContext(
        SimulationRootModule,
        simulationDatabaseUrl!,
      );
      const prisma = app.get(PrismaService);
      const seeder = app.get(SimulationSeeder);
      const engine = app.get(SimulationEngineService);
      const invariants = app.get(SimulationInvariantService);

      const def = {
        ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
        customerCount: 80,
      };
      const runLabel = `invarianttest${Date.now()}`;
      const clock = new SimulationClock();

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

        for (let day = 0; day < 15; day++) {
          await engine.runDay(clock);
          clock.advanceDays(1);
        }

        const results = await invariants.checkAll({
          businessId: seeded.businessId,
          experimentId: seeded.experimentId,
          now: clock.now(),
          timezone: 'America/Montevideo',
          expectedSimulationDatabaseName: dbNameOf(simulationDatabaseUrl!),
          maxAiCallsDefault: def.maxAiCallsDefault,
        });

        const failed = results.filter((r) => r.status === 'FAIL');
        expect(failed).toEqual([]);
        expect(results.length).toBeGreaterThanOrEqual(12);
      } finally {
        if (businessId) await cleanup(prisma, businessId);
        await app.close();
      }
    }, 60_000);
  },
);
