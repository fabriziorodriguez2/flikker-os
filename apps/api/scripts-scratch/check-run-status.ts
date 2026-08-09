import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const adapter = new PrismaPg({ connectionString: url });
  const client = new PrismaClient({ adapter });
  const run = await client.simulationRun.findUnique({
    where: { id: process.argv[2] },
  });
  console.log(JSON.stringify(run, null, 2));
  await client.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
