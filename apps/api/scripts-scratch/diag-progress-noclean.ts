import 'dotenv/config';
import { PrismaService } from '../src/prisma/prisma.service';
import { SimulationConfigService } from '../src/modules/simulation/simulation-config.service';
import { SimulationRunnerService } from '../src/modules/simulation/simulation-runner.service';
import { resolveScenarioDefinition } from '../src/modules/simulation/scenarios';
import { SimulationScenario, SimulationStatus } from '@prisma/client';

async function main() {
  const simulationDatabaseUrl = process.env.SIMULATION_DATABASE_URL!;
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

  const def = resolveScenarioDefinition(
    SimulationScenario.REWARD_PROGRESS,
    { days: 20, customerCount: 60, seed: 1 },
    { maxDays: 90, maxCustomers: 1000 },
  );
  const user = await prisma.user.create({
    data: {
      email: `diag-${Date.now()}@flikker-simulation.local`,
      passwordHash: 'x',
      firstName: 'D',
      lastName: 'D',
      isPlatformAdmin: true,
    },
    select: { id: true },
  });
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
  await runner.run(created.id);
  const finished = await prisma.simulationRun.findUniqueOrThrow({
    where: { id: created.id },
  });
  console.log('status', finished.status);
  console.log('SIM_RUN_ID', created.id);

  const { PrismaClient } = require('@prisma/client');

  const { PrismaPg } = require('@prisma/adapter-pg');
  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString: simulationDatabaseUrl }),
  });
  const business = await client.business.findUnique({
    where: { slug: `sim-${created.id}` },
    select: { id: true },
  });
  console.log('BUSINESS_ID', business.id);
  const experiment = await client.retentionExperiment.findFirst({
    where: { businessId: business.id },
    select: { id: true },
  });
  const assignments = await client.retentionAssignment.findMany({
    where: {
      experimentId: experiment.id,
      variant: { strategyType: 'PROGRESS_REMINDER' },
    },
    select: {
      id: true,
      customerId: true,
      sentAt: true,
      skipReason: true,
      status: true,
      assignedAt: true,
      exposedAt: true,
    },
    take: 10,
  });
  console.log(
    'PROGRESS_REMINDER assignments sample:',
    JSON.stringify(assignments, null, 2),
  );
  const decisions = await client.retentionDecisionLog.findMany({
    where: { businessId: business.id },
    select: { decisionCode: true, metadata: true },
  });
  const byCode: Record<string, number> = {};
  for (const d of decisions)
    byCode[d.decisionCode] = (byCode[d.decisionCode] ?? 0) + 1;
  console.log('Decision code counts:', JSON.stringify(byCode, null, 2));

  await client.$disconnect();
  await prisma.onModuleDestroy();
  console.log('DONE — business NOT cleaned up, ID:', business.id);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
