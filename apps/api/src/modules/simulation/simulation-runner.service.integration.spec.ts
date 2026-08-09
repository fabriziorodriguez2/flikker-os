import { PrismaClient, SimulationStatus } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaService } from '../../prisma/prisma.service';
import { SimulationConfigService } from './simulation-config.service';
import { SimulationRunnerService } from './simulation-runner.service';
import { resolveScenarioDefinition } from './scenarios';

/**
 * §26/§27/§28 — the runner end to end, exactly the code path
 * `SimulationWorker.process()` calls, exercised directly (no BullMQ/Redis
 * needed — this environment has none configured, matching every other
 * worker's own test convention in this codebase: construct it and call the
 * method). Needs BOTH `DATABASE_URL` (the `SimulationRun` bookkeeping row)
 * and `SIMULATION_DATABASE_URL` (the isolated business data) — skipped, not
 * failed, without the latter.
 */
const simulationDatabaseUrl = process.env.SIMULATION_DATABASE_URL;
const describeIfConfigured = simulationDatabaseUrl ? describe : describe.skip;

function makeConfig(databaseUrl: string) {
  return {
    available: true,
    enabled: true,
    databaseUrl,
    unavailableReason: null,
    maxConcurrentRuns: 1,
    maxCustomers: 1000,
    maxDays: 90,
  } as unknown as SimulationConfigService;
}

/**
 * The runner passes the `SimulationRun.id` itself as the seeder's
 * `runLabel`, so the isolated business ends up with slug `sim-<id>` — reuse
 * that to clean it up afterward, using a plain client pointed directly at
 * the simulation database (not the isolated Nest context, which the
 * runner's own `bootIsolatedSimulationContext` already closed by the time
 * this runs).
 */
async function cleanupIsolatedBusiness(
  simulationDatabaseUrl: string,
  simulationRunId: string,
) {
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: simulationDatabaseUrl }),
  });
  try {
    const business = await client.business.findUnique({
      where: { slug: `sim-${simulationRunId}` },
      select: { id: true },
    });
    if (!business) return;
    const businessId = business.id;
    await client.visit.deleteMany({ where: { businessId } });
    await client.message.deleteMany({ where: { businessId } });
    await client.benefitParticipation.deleteMany({ where: { businessId } });
    await client.retentionVariant.deleteMany({ where: { businessId } });
    await client.retentionExperiment.deleteMany({ where: { businessId } });
    await client.retentionIncentiveDefinition.deleteMany({
      where: { businessId },
    });
    await client.retentionSettings.deleteMany({ where: { businessId } });
    await client.customer.deleteMany({ where: { businessId } });
    await client.business.delete({ where: { id: businessId } });
  } finally {
    await client.$disconnect();
  }
}

async function makeThrowawayUser(prisma: PrismaService, suffix: string) {
  return prisma.user.create({
    data: {
      email: `sim-runner-test-${suffix}@example.com`,
      passwordHash: 'not-a-real-hash',
      firstName: 'Sim',
      lastName: 'Runner',
      isPlatformAdmin: true,
    },
    select: { id: true },
  });
}

describeIfConfigured(
  'SimulationRunnerService (integration) — §26/§27/§28: the full run, end to end',
  () => {
    it('drives a small real run from PENDING to COMPLETED, with progress and a full result/summary persisted', async () => {
      const prisma = new PrismaService();
      await prisma.onModuleInit();
      const config = makeConfig(simulationDatabaseUrl!);
      const runner = new SimulationRunnerService(prisma, config);

      const suffix = `${Date.now()}`;
      const user = await makeThrowawayUser(prisma, suffix);
      const def = resolveScenarioDefinition(
        'BASELINE_HEALTHY',
        { days: 5, customerCount: 30 },
        { maxDays: 90, maxCustomers: 1000 },
      );

      const created = await prisma.simulationRun.create({
        data: {
          scenario: def.scenario,
          status: SimulationStatus.PENDING,
          seed: def.seed,
          days: def.days,
          customerCount: def.customerCount,
          withAi: def.withAiDefault,
          configuration: def as never,
          createdByUserId: user.id,
        },
        select: { id: true },
      });

      try {
        await runner.run(created.id);

        const finished = await prisma.simulationRun.findUniqueOrThrow({
          where: { id: created.id },
        });

        expect(finished.status).toBe(SimulationStatus.COMPLETED);
        expect(finished.progress).toBe(100);
        expect(finished.currentVirtualDay).toBe(5);
        expect(finished.startedAt).not.toBeNull();
        expect(finished.finishedAt).not.toBeNull();
        expect(finished.failureReason).toBeNull();
        expect(finished.results).not.toBeNull();
        expect(finished.summary).not.toBeNull();

        const results = finished.results as {
          customersCreated: number;
          invariantResults: { status: string }[];
        };
        expect(results.customersCreated).toBe(30);
        expect(results.invariantResults.every((r) => r.status !== 'FAIL')).toBe(
          true,
        );

        const summary = finished.summary as { pilotReadiness: string };
        expect(['PILOT_READY', 'PILOT_READY_WITH_WARNINGS']).toContain(
          summary.pilotReadiness,
        );
      } finally {
        await cleanupIsolatedBusiness(simulationDatabaseUrl!, created.id);
        await prisma.simulationRun.delete({ where: { id: created.id } });
        await prisma.user.delete({ where: { id: user.id } });
        await prisma.onModuleDestroy();
      }
    }, 60_000);

    it('marks the run FAILED (never leaves it stuck) when the stored configuration is invalid', async () => {
      const prisma = new PrismaService();
      await prisma.onModuleInit();
      const config = makeConfig(simulationDatabaseUrl!);
      const runner = new SimulationRunnerService(prisma, config);

      const suffix = `${Date.now()}bad`;
      const user = await makeThrowawayUser(prisma, suffix);
      const created = await prisma.simulationRun.create({
        data: {
          scenario: 'BASELINE_HEALTHY',
          status: SimulationStatus.PENDING,
          seed: 1,
          days: 1,
          customerCount: 1,
          withAi: false,
          configuration: { not: 'a valid scenario definition' } as never,
          createdByUserId: user.id,
        },
        select: { id: true },
      });

      try {
        await runner.run(created.id);
        const finished = await prisma.simulationRun.findUniqueOrThrow({
          where: { id: created.id },
        });
        expect(finished.status).toBe(SimulationStatus.FAILED);
        expect(finished.failureReason).not.toBeNull();
      } finally {
        await prisma.simulationRun.delete({ where: { id: created.id } });
        await prisma.user.delete({ where: { id: user.id } });
        await prisma.onModuleDestroy();
      }
    });
  },
);
