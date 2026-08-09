/**
 * Batch 9 — runs ONE mandatory simulation (A-E) end to end using the exact
 * same SimulationRunnerService the real queue worker calls, against the
 * real isolated simulation database. Never touches production data.
 *
 * Usage: npx ts-node scripts-scratch/run-mandatory-simulation.ts <LABEL> <SCENARIO> <DAYS> <CUSTOMERS> [SEED] [WITH_AI] [OPT_MODE]
 */
import 'dotenv/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { SimulationConfigService } from '../src/modules/simulation/simulation-config.service';
import { SimulationRunnerService } from '../src/modules/simulation/simulation-runner.service';
import { resolveScenarioDefinition } from '../src/modules/simulation/scenarios';
import {
  SimulationScenario,
  SimulationStatus,
  OptimizationMode,
} from '@prisma/client';

async function main() {
  const [
    label,
    scenarioArg,
    daysArg,
    customersArg,
    seedArg,
    withAiArg,
    optModeArg,
  ] = process.argv.slice(2);
  if (!label || !scenarioArg) {
    console.error(
      'Usage: run-mandatory-simulation.ts <LABEL> <SCENARIO> <DAYS> <CUSTOMERS> [SEED] [WITH_AI] [OPT_MODE]',
    );
    process.exit(1);
  }

  const simulationDatabaseUrl = process.env.SIMULATION_DATABASE_URL;
  if (!simulationDatabaseUrl) {
    console.error('SIMULATION_DATABASE_URL is not set.');
    process.exit(1);
  }

  const prisma = new PrismaService();
  await prisma.onModuleInit();

  const config = {
    available: true,
    enabled: true,
    databaseUrl: simulationDatabaseUrl,
    unavailableReason: null,
    maxConcurrentRuns: 1,
    maxCustomers: 1000,
    maxDays: 90,
  } as unknown as SimulationConfigService;

  const runner = new SimulationRunnerService(prisma, config);

  // Platform-admin throwaway user for the FK.
  const user = await prisma.user.create({
    data: {
      email: `mandatory-run-${label}-${Date.now()}@flikker-simulation.local`,
      passwordHash: 'not-a-real-hash',
      firstName: 'Simulation',
      lastName: 'RunnerScript',
      isPlatformAdmin: true,
    },
    select: { id: true },
  });

  const scenario = scenarioArg as SimulationScenario;
  const days = daysArg ? Number(daysArg) : undefined;
  const customerCount = customersArg ? Number(customersArg) : undefined;
  const seed = seedArg ? Number(seedArg) : undefined;
  const withAi = withAiArg === 'true';
  const optimizationMode = optModeArg
    ? (optModeArg as OptimizationMode)
    : undefined;

  const def = resolveScenarioDefinition(
    scenario,
    { days, customerCount, seed, withAi, optimizationMode },
    { maxDays: 90, maxCustomers: 1000 },
  );

  console.log(
    `\n=== RUN ${label} — ${scenario} — days=${def.days} customers=${def.customerCount} seed=${def.seed} withAi=${def.withAiDefault} optMode=${def.business.optimizationMode} ===`,
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

  console.log(`SimulationRun id: ${created.id}`);
  const startedAt = Date.now();
  await runner.run(created.id);
  const elapsedMs = Date.now() - startedAt;

  const finished = await prisma.simulationRun.findUniqueOrThrow({
    where: { id: created.id },
  });
  console.log(
    `status=${finished.status} progress=${finished.progress} elapsedMs=${elapsedMs} failureReason=${finished.failureReason ?? 'none'}`,
  );

  console.log('\n--- RESULTS ---');
  console.log(JSON.stringify(finished.results, null, 2));
  console.log('\n--- SUMMARY (diagnosis) ---');
  console.log(JSON.stringify(finished.summary, null, 2));

  console.log(`\nSIMULATION_RUN_ID=${created.id}`);
  console.log(`THROWAWAY_USER_ID=${user.id}`);

  // Clean only the ISOLATED simulated business data (never production) —
  // keep the SimulationRun bookkeeping row + results/summary for the report.
  await cleanupIsolatedBusiness(simulationDatabaseUrl, created.id);

  await prisma.onModuleDestroy();
}

async function cleanupIsolatedBusiness(
  simulationDatabaseUrl: string,
  simulationRunId: string,
) {
  const { PrismaClient } = require('@prisma/client');

  const { PrismaPg } = require('@prisma/adapter-pg');
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
    await client.message.deleteMany({ where: { businessId } });
    await client.benefitParticipation.deleteMany({ where: { businessId } });
    await client.visit.deleteMany({ where: { businessId } });
    await client.retentionVariant.deleteMany({ where: { businessId } });
    await client.retentionExperiment.deleteMany({ where: { businessId } });
    await client.retentionIncentiveDefinition.deleteMany({
      where: { businessId },
    });
    await client.retentionSettings.deleteMany({ where: { businessId } });
    await client.customer.deleteMany({ where: { businessId } });
    await client.business.delete({ where: { id: businessId } });
    console.log(
      `Cleaned isolated business ${businessId} from the simulation database.`,
    );
  } finally {
    await client.$disconnect();
  }
}

main().catch((e) => {
  console.error('SCRIPT_FAILED', e);
  process.exit(1);
});
