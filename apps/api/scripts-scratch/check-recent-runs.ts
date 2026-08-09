import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const adapter = new PrismaPg({ connectionString: url });
  const client = new PrismaClient({ adapter });
  const runs = await client.simulationRun.findMany({
    orderBy: { createdAt: 'desc' },
    take: 15,
    select: {
      id: true,
      scenario: true,
      seed: true,
      status: true,
      progress: true,
      currentVirtualDay: true,
      createdAt: true,
      finishedAt: true,
    },
  });
  console.log(JSON.stringify(runs, null, 2));
  await client.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
