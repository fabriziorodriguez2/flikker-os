import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const SUPERSEDED_RUN_IDS = [
  'd23fcec6-567f-4115-84ab-165a1fea0100', // pre-fix Run A iteration
  '7887974c-0e23-4bd2-9b7f-071c143fbd26', // pre-fix Run A iteration
  '529d91e1-e58c-4d14-aa6d-2e881c63430f', // pre-fix Run A iteration
  'a4824d44-83ed-4255-a7f8-7370137c1c52', // post-Bug#5/pre-Bug#6 Run A iteration
  '5424514f-e4be-4ef9-8470-714280233dd5', // batch-script smoke test (5 days, 20 customers)
  'ca05b813-861b-4f12-a523-0f80c028b846', // batch-script smoke test (5 days, 20 customers)
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const adapter = new PrismaPg({ connectionString: url });
  const client = new PrismaClient({ adapter });

  const runs = await client.simulationRun.findMany({
    where: { id: { in: SUPERSEDED_RUN_IDS } },
    select: { id: true, createdByUserId: true },
  });
  const userIds = runs
    .map((r) => r.createdByUserId)
    .filter((v): v is string => !!v);

  const deletedRuns = await client.simulationRun.deleteMany({
    where: { id: { in: SUPERSEDED_RUN_IDS } },
  });
  console.log(`Deleted ${deletedRuns.count} superseded SimulationRun rows.`);

  // Only delete the throwaway users tied to those runs, and only if they are
  // in fact the disposable simulation-runner accounts (never a real user).
  const usersToDelete = await client.user.findMany({
    where: {
      id: { in: userIds },
      email: { endsWith: '@flikker-simulation.local' },
    },
    select: { id: true, email: true },
  });
  const deletedUsers = await client.user.deleteMany({
    where: { id: { in: usersToDelete.map((u) => u.id) } },
  });
  console.log(
    `Deleted ${deletedUsers.count} throwaway simulation-runner users.`,
  );
  console.log(JSON.stringify(usersToDelete, null, 2));

  await client.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
