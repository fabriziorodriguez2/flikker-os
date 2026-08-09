import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const url = process.env.SIMULATION_DATABASE_URL;
  if (!url) throw new Error('SIMULATION_DATABASE_URL not set');
  const adapter = new PrismaPg({ connectionString: url });
  const client = new PrismaClient({ adapter });
  const businesses = await client.business.findMany({
    select: { id: true, name: true, createdAt: true },
  });
  console.log('Residual businesses in flikker_simulation:', businesses.length);
  console.log(JSON.stringify(businesses, null, 2));
  await client.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
