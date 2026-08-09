import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const SUPERSEDED_RUN_IDS = [
  '0a50c2c8-7984-40a8-9f35-66c0f1e8f475',
  '8d0c2f6c-f245-436f-b8f6-076ef7b33c91',
  '0ceed8ff-1fc3-4b1c-b404-a6c15bcfbd00',
  '0c7fc4a1-b0b4-487d-b266-c1eaf5c8b46a',
  '1e5500e0-9129-43e6-a607-5011297acae4',
  'a8460517-59cd-41a3-aedd-42a85cd0a267',
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
  const userIds = runs.map((r) => r.createdByUserId).filter((v): v is string => !!v);
  const deletedRuns = await client.simulationRun.deleteMany({ where: { id: { in: SUPERSEDED_RUN_IDS } } });
  console.log(`Deleted ${deletedRuns.count} superseded STRONG_SIGNAL (pre-split-metric) rows.`);
  const usersToDelete = await client.user.findMany({
    where: { id: { in: userIds }, email: { endsWith: '@flikker-simulation.local' } },
    select: { id: true },
  });
  const deletedUsers = await client.user.deleteMany({ where: { id: { in: usersToDelete.map((u) => u.id) } } });
  console.log(`Deleted ${deletedUsers.count} throwaway users.`);
  const remaining = await client.simulationRun.count();
  console.log(`Remaining SimulationRun rows: ${remaining}`);
  await client.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
