import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const target =
    process.argv[2] === 'sim'
      ? process.env.SIMULATION_DATABASE_URL
      : process.env.DATABASE_URL;
  if (!target) throw new Error('url not set');
  const adapter = new PrismaPg({ connectionString: target });
  const client = new PrismaClient({ adapter });
  const rows: any[] = await client.$queryRawUnsafe(`
    select pid, state, wait_event_type, wait_event, (now()-query_start)::text as duration, left(query,120) as query
    from pg_stat_activity
    where datname is not null
    order by duration desc
    limit 20
  `);
  console.log(JSON.stringify(rows, null, 2));
  await client.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
