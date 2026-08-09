import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const businessId = process.argv[2];
  const url = process.env.SIMULATION_DATABASE_URL;
  if (!url || !businessId)
    throw new Error('need SIMULATION_DATABASE_URL and businessId arg');
  const adapter = new PrismaPg({ connectionString: url });
  const client = new PrismaClient({ adapter });
  await client.message.deleteMany({ where: { businessId } });
  await client.benefitParticipation.deleteMany({ where: { businessId } });
  await client.customerRewardGoal.deleteMany({ where: { businessId } });
  await client.retentionDecisionLog.deleteMany({ where: { businessId } });
  await client.retentionOptimizationRun.deleteMany({ where: { businessId } });
  await client.visit.deleteMany({ where: { businessId } });
  await client.retentionAssignment.deleteMany({ where: { businessId } });
  await client.retentionVariant.deleteMany({ where: { businessId } });
  await client.retentionExperiment.deleteMany({ where: { businessId } });
  await client.retentionIncentiveDefinition.deleteMany({
    where: { businessId },
  });
  await client.retentionSettings.deleteMany({ where: { businessId } });
  await client.customer.deleteMany({ where: { businessId } });
  await client.business.delete({ where: { id: businessId } });
  console.log('cleaned', businessId);
  await client.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
