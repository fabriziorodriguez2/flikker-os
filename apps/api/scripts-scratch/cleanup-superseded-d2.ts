import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const SUPERSEDED_RUN_IDS = [
  // Structural smoke tests (validated design, not reportable evidence)
  'c77e8e35-63b9-4094-9027-9a50f16a33ad',
  '8b6bd9ea-ac41-42d3-ac1f-e7d978068983',
  '7004f89c-642b-4eb0-a91f-01f2bb642a69',
  '0e819809-25c1-4a46-89f2-b9908f758de3',
  'c447235e-92bb-4a7e-8217-1f6bfd2f37f6',
  '6f348517-24c3-467c-a7d8-155c6e4506ae',
  // Batch-script smoke test
  'b9f14dfb-f27f-4178-af19-9249260f79c2',
  '4068af36-ec44-4bc3-8a9e-958cd4df3360',
  // REWARD_PROGRESS send-time bug diagnosis (pre/post fix)
  '0ed775f6-41e0-46b0-a0e8-7df2629e4a72',
  '3a3f1d78-3238-4d76-be4c-34ec7c5e845f',
  'da1f80b2-824c-44b4-9927-eb5ea99bcbf8',
  'e5f900a6-daf8-4ccc-b74f-331f4487c75d',
  // TWO_ARM_REMINDER first batch — superseded by the ground-truth fix re-run
  '0744a090-1013-4945-bc7d-8008fa3c1b1b',
  '9e9d8bab-f4e1-4c94-ab5c-39eeb2802ca5',
  'b7b670b6-0ced-4f99-a50c-89bb4d795ea1',
  '0a313d02-02e7-4f50-a3c7-dc53322bb045',
  '121ffd3a-4245-48e7-ad2c-91460dc2a11f',
  '5399e9bc-1c1b-445c-b543-b25ce443a934',
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

  const deletedRuns = await client.simulationRun.deleteMany({
    where: { id: { in: SUPERSEDED_RUN_IDS } },
  });
  console.log(`Deleted ${deletedRuns.count} superseded SimulationRun rows.`);

  const usersToDelete = await client.user.findMany({
    where: { id: { in: userIds }, email: { endsWith: '@flikker-simulation.local' } },
    select: { id: true },
  });
  const deletedUsers = await client.user.deleteMany({
    where: { id: { in: usersToDelete.map((u) => u.id) } },
  });
  console.log(`Deleted ${deletedUsers.count} throwaway simulation-runner users.`);

  const remaining = await client.simulationRun.count();
  console.log(`Remaining SimulationRun rows: ${remaining}`);

  await client.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
