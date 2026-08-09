import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set');
  const adapter = new PrismaPg({ connectionString: url });
  const client = new PrismaClient({ adapter });
  const businesses = await client.business.findMany({
    where: { name: 'Reward Progress Co' },
    select: { id: true },
  });
  for (const { id: businessId } of businesses) {
    await client.retentionAssignment.deleteMany({ where: { businessId } });
    await client.customerRewardGoal.deleteMany({ where: { businessId } });
    await client.retentionVariant.deleteMany({ where: { businessId } });
    await client.retentionExperiment.deleteMany({ where: { businessId } });
    await client.retentionIncentiveDefinition.deleteMany({
      where: { businessId },
    });
    await client.retentionSettings.deleteMany({ where: { businessId } });
    await client.customer.deleteMany({ where: { businessId } });
    await client.business.delete({ where: { id: businessId } });
  }
  console.log(
    `Cleaned ${businesses.length} leftover "Reward Progress Co" business(es).`,
  );
  await client.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
