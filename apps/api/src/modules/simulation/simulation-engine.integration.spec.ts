import { PrismaService } from '../../prisma/prisma.service';
import { bootIsolatedSimulationContext } from './simulation-context';
import { SimulationRootModule } from './simulation-root.module';
import { SimulationSeeder } from './simulation-seeder';
import { SimulationEngineService } from './simulation-engine.service';
import { SimulationClock } from './simulation-clock';
import { createSeededRandom } from './prng';
import { SCENARIO_DEFINITIONS } from './scenarios';

/**
 * §10/§11 — the seeder and the engine, wired together, against the real
 * isolated Postgres database: proves real `Visit` rows land through the
 * unchanged `VisitsRepository`, and that the count of rows created matches
 * exactly the engine's own `visibleReturns` tally — no double-counting, no
 * silent drops. Skipped, not failed, without `SIMULATION_DATABASE_URL`.
 */
const simulationDatabaseUrl = process.env.SIMULATION_DATABASE_URL;
const describeIfConfigured = simulationDatabaseUrl ? describe : describe.skip;

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
  'Seeder + Engine (integration) — §10/§11: real Visit rows, exactly matching the tally',
  () => {
    it('creates exactly one real Visit per visibleReturn, and zero for physical-only returns', async () => {
      const app = await bootIsolatedSimulationContext(
        SimulationRootModule,
        simulationDatabaseUrl!,
      );
      const prisma = app.get(PrismaService);
      const seeder = app.get(SimulationSeeder);
      const engine = app.get(SimulationEngineService);

      const def = {
        ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
        customerCount: 60,
      };
      const runLabel = `enginetest${Date.now()}`;
      const seedRng = createSeededRandom(def.seed);
      const clock = new SimulationClock();

      let businessId: string | undefined;
      try {
        const seeded = await seeder.seed(def, seedRng, clock.now(), runLabel);
        businessId = seeded.businessId;

        const engineRng = createSeededRandom(def.seed + 1);
        engine.init(seeded.businessId, seeded.customers, def, engineRng);

        let totalVisible = 0;
        let totalPhysical = 0;
        for (let day = 0; day < 20; day++) {
          const result = await engine.runDay(clock);
          totalVisible += result.visibleReturns;
          totalPhysical += result.physicalReturns;
          clock.advanceDays(1);
        }

        expect(totalPhysical).toBeGreaterThan(0);
        expect(totalVisible).toBeGreaterThan(0);
        expect(totalVisible).toBeLessThanOrEqual(totalPhysical);

        const realVisitCount = await prisma.visit.count({
          where: { businessId: seeded.businessId },
        });
        expect(realVisitCount).toBe(totalVisible);
      } finally {
        if (businessId) await cleanup(prisma, businessId);
        await app.close();
      }
    }, 60_000); // real DB round-trips per day (recruit+send+deliver+sweep+outcome) × 20 days — sends now actually happen (§38 clock fix)
  },
);
