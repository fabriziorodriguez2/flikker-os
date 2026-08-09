import { OptimizationMode, RetentionExperimentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { bootIsolatedSimulationContext } from './simulation-context';
import { SimulationRootModule } from './simulation-root.module';
import { SimulationSeeder } from './simulation-seeder';
import { SCENARIO_DEFINITIONS } from './scenarios';
import { createSeededRandom } from './prng';
import type { PersonaType } from './personas';

/**
 * §7/§8/§10 — proves the seeder produces a real, valid, RUNNING experiment
 * against a real (isolated) Postgres database, and that the ground-truth
 * persona labels never touch any persisted row (§8's non-negotiable).
 *
 * Same opt-in-via-env pattern as `simulation-context.integration.spec.ts`:
 * skipped, not failed, when `SIMULATION_DATABASE_URL` isn't configured.
 */
const simulationDatabaseUrl = process.env.SIMULATION_DATABASE_URL;
const describeIfConfigured = simulationDatabaseUrl ? describe : describe.skip;

describeIfConfigured(
  'SimulationSeeder (integration) — §7/§8/§10: a real, valid RUNNING experiment',
  () => {
    it('seeds a business, a 4-variant RUNNING experiment summing to 100, and N customers with a hidden persona each', async () => {
      const app = await bootIsolatedSimulationContext(
        SimulationRootModule,
        simulationDatabaseUrl!,
      );
      const prisma = app.get(PrismaService);
      const seeder = app.get(SimulationSeeder);

      const def = SCENARIO_DEFINITIONS.BASELINE_HEALTHY;
      const smallDef = { ...def, customerCount: 25 };
      const runLabel = `test${Date.now()}`;
      const rng = createSeededRandom(smallDef.seed);
      const now = new Date('2026-01-01T11:00:00.000Z');

      let seeded: Awaited<ReturnType<SimulationSeeder['seed']>> | undefined;
      try {
        seeded = await seeder.seed(smallDef, rng, now, runLabel);

        // The business is real, active, CHECKIN_V2, with the scenario's flags.
        const business = await prisma.business.findUniqueOrThrow({
          where: { id: seeded.businessId },
        });
        expect(business.isActive).toBe(true);
        expect(business.retentionEngineV2Enabled).toBe(true);

        const settings = await prisma.retentionSettings.findUniqueOrThrow({
          where: { businessId: seeded.businessId },
        });
        expect(Number(settings.averageTicketAmount)).toBe(600);
        expect(settings.optimizationMode).toBe(OptimizationMode.ASSISTED);

        // The experiment is genuinely RUNNING — RetentionV2EvaluateService
        // (unchanged) will find and recruit against it exactly as it would
        // any real experiment.
        const experiment = await prisma.retentionExperiment.findUniqueOrThrow({
          where: { id: seeded.experimentId },
          include: { variants: true },
        });
        expect(experiment.status).toBe(RetentionExperimentStatus.RUNNING);

        const allocationTotal = experiment.variants.reduce(
          (sum, v) => sum + v.allocationPercent,
          0,
        );
        expect(allocationTotal).toBe(100);
        expect(experiment.variants).toHaveLength(4);

        const softBenefit = experiment.variants.find(
          (v) => v.name === 'SOFT_BENEFIT',
        );
        expect(softBenefit?.incentiveDefinitionId).not.toBeNull();

        // §38 run A regression: every seeded incentive must be BOTH
        // automation-eligible AND reward-goal-eligible — the two are
        // separate opt-ins (Fase E §1); omitting the latter left
        // rewardGoalsCreated at 0 for every scenario, silently, since
        // nothing else in the pipeline errors when there is simply no
        // eligible incentive to promise.
        const incentives = await prisma.retentionIncentiveDefinition.findMany({
          where: { businessId: seeded.businessId },
        });
        expect(incentives.length).toBeGreaterThan(0);
        for (const incentive of incentives) {
          expect(incentive.automationEligible).toBe(true);
          expect(incentive.rewardGoalEligible).toBe(true);
        }

        // Exactly `customerCount` real Customer rows, each with a persona in
        // the returned bookkeeping — but that persona is NEVER on the row.
        expect(seeded.customers).toHaveLength(smallDef.customerCount);
        const dbCustomers = await prisma.customer.findMany({
          where: { businessId: seeded.businessId },
        });
        expect(dbCustomers).toHaveLength(smallDef.customerCount);

        const validPersonas: PersonaType[] = [
          'WEEKLY_REGULAR',
          'BIWEEKLY',
          'MONTHLY',
          'NEW',
          'HIGH_CHURN',
          'IRREGULAR',
          'PROMOTION_SENSITIVE',
          'PROMOTION_INSENSITIVE',
          'PROGRESS_SENSITIVE',
        ];
        for (const c of seeded.customers) {
          expect(validPersonas).toContain(c.persona);
        }

        // §8 — the non-negotiable: no persisted Customer row contains any
        // trace of a persona label anywhere in its own fields.
        const serializedCustomers = JSON.stringify(dbCustomers);
        for (const persona of validPersonas) {
          expect(serializedCustomers.includes(persona)).toBe(false);
        }
      } finally {
        if (seeded) {
          await prisma.retentionVariant.deleteMany({
            where: { businessId: seeded.businessId },
          });
          await prisma.retentionExperiment.deleteMany({
            where: { businessId: seeded.businessId },
          });
          await prisma.retentionIncentiveDefinition.deleteMany({
            where: { businessId: seeded.businessId },
          });
          await prisma.retentionSettings.deleteMany({
            where: { businessId: seeded.businessId },
          });
          await prisma.customer.deleteMany({
            where: { businessId: seeded.businessId },
          });
          await prisma.business.delete({ where: { id: seeded.businessId } });
        }
        await app.close();
      }
    });

    it('is reproducible: the same seed assigns the same persona sequence', async () => {
      const app = await bootIsolatedSimulationContext(
        SimulationRootModule,
        simulationDatabaseUrl!,
      );
      const prisma = app.get(PrismaService);
      const seeder = app.get(SimulationSeeder);
      const def = {
        ...SCENARIO_DEFINITIONS.BASELINE_HEALTHY,
        customerCount: 10,
      };
      const now = new Date('2026-01-01T11:00:00.000Z');

      let seededA: Awaited<ReturnType<SimulationSeeder['seed']>> | undefined;
      let seededB: Awaited<ReturnType<SimulationSeeder['seed']>> | undefined;
      try {
        seededA = await seeder.seed(
          def,
          createSeededRandom(def.seed),
          now,
          `reproA${Date.now()}`,
        );
        seededB = await seeder.seed(
          def,
          createSeededRandom(def.seed),
          now,
          `reproB${Date.now()}`,
        );

        expect(seededA.customers.map((c) => c.persona)).toEqual(
          seededB.customers.map((c) => c.persona),
        );
      } finally {
        for (const seeded of [seededA, seededB]) {
          if (!seeded) continue;
          await prisma.retentionVariant.deleteMany({
            where: { businessId: seeded.businessId },
          });
          await prisma.retentionExperiment.deleteMany({
            where: { businessId: seeded.businessId },
          });
          await prisma.retentionIncentiveDefinition.deleteMany({
            where: { businessId: seeded.businessId },
          });
          await prisma.retentionSettings.deleteMany({
            where: { businessId: seeded.businessId },
          });
          await prisma.customer.deleteMany({
            where: { businessId: seeded.businessId },
          });
          await prisma.business.delete({ where: { id: seeded.businessId } });
        }
        await app.close();
      }
    });
  },
);
