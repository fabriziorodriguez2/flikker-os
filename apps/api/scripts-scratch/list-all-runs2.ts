import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const url = process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString: url });
  const client = new PrismaClient({ adapter });
  const runs = await client.simulationRun.findMany({
    orderBy: { createdAt: 'asc' },
    select: { id: true, scenario: true, seed: true, createdAt: true, createdByUserId: true },
  });
  console.log(`Total: ${runs.length}`);
  console.log(JSON.stringify(runs, null, 2));
  await client.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
