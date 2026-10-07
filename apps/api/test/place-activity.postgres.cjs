// Isolated PostgreSQL verification: in-memory PGlite, never the application DB.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require('reflect-metadata');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, experimentalDecorators: true, emitDecoratorMetadata: true, esModuleInterop: true } }).outputText, filename);
const { PlaceActivityService } = require('../src/modules/flikker-account/place-activity.service.ts');
async function main() {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const owned = `id text primary key, business_id text, customer_id text`;
  await db.exec(`
    CREATE TABLE visits (${owned}, occurred_at timestamp(3));
    CREATE TABLE customer_reward_goals (${owned}, activated_at timestamp(3), unlocked_at timestamp(3), cancelled_at timestamp(3), expires_at timestamp(3), status text);
    CREATE TABLE reward_goal_bonus_stamps (${owned}, created_at timestamp(3), reason_code text);
    CREATE TABLE benefit_participations (${owned}, created_at timestamp(3), redeemed_at timestamp(3), expires_at timestamp(3), redemption_code text, benefit_title_snapshot text);
    CREATE TABLE missions (id text primary key, business_id text, name text);
    CREATE TABLE customer_missions (${owned}, mission_id text, completed_at timestamp(3));
    CREATE TABLE return_challenges (${owned}, completed_at timestamp(3));
    CREATE TABLE checkin_feedback (${owned}, created_at timestamp(3));
    CREATE TABLE "FeedbackResponse" (id text primary key, "businessId" text, "customerId" text, "createdAt" timestamp(3));
    INSERT INTO customer_reward_goals VALUES ('g','a','ca','2025-01-01 12:00','2025-01-02 15:00',null,null,'UNLOCKED');
    INSERT INTO visits VALUES ('before','a','ca','2025-01-01 12:00'), ('earned','a','ca','2025-01-02 14:00'), ('after','a','ca','2025-01-02 16:00'), ('foreign','b','cb','2025-01-02 18:00'), ('same-business-other','a','other','2025-01-02 19:00');
    INSERT INTO reward_goal_bonus_stamps VALUES ('bonus','a','ca','2025-01-02 14:01','feedback_completed');
    INSERT INTO benefit_participations VALUES ('redeemed','a','ca','2025-01-02 15:00','2025-01-03 15:00','2025-01-04 15:00','code','Nombre histórico'), ('expired','a','ca','2025-01-02 15:00',null,'2025-01-04 15:00','code2','Premio vencido'), ('raffle','a','ca','2025-01-02 15:00',null,null,null,'Participación');
    INSERT INTO missions VALUES ('m','a','Misión real'), ('foreign','b','Otra misión');
    INSERT INTO customer_missions VALUES ('mission','a','ca','m','2025-01-02 14:00'), ('corrupt-cross-tenant','a','ca','foreign','2025-01-02 14:00');
    INSERT INTO return_challenges VALUES ('return','a','ca','2025-01-02 14:00');
    INSERT INTO checkin_feedback VALUES ('feedback','a','ca','2025-01-02 14:00');
    INSERT INTO "FeedbackResponse" VALUES ('opinion','a','ca','2025-01-02 14:00');
  `);
  const queries = [];
  const prisma = {
    customer: { findFirst: async ({ where }) => where.businessId === 'a' && where.flikkerAccountId === 'account' ? { id: 'ca', business: { name: 'Negocio real', timezone: 'America/Montevideo' } } : null },
    $queryRaw: async query => { queries.push(query); return (await db.query(query.text, query.values)).rows; },
  };
  const service = new PlaceActivityService(prisma);
  const first = await service.list('account','a');
  assert.equal(first.total, 12);
  assert.equal(first.items.find(i => i.id === 'visit:earned').type, 'STAMP_EARNED');
  assert.equal(first.items.find(i => i.id === 'visit:before').type, 'VISIT');
  assert.equal(first.items.find(i => i.id === 'visit:after').type, 'VISIT');
  assert.equal(first.items.filter(i => i.id === 'visit:earned').length, 1);
  assert(!first.items.some(i => i.id.includes('foreign') || i.id.includes('raffle') || i.id.includes('corrupt') || i.id.includes('same-business-other')));
  assert(!first.items.some(i => i.id === 'expired:redeemed'));
  assert.equal(first.items.find(i => i.id === 'redeemed:redeemed').description, 'Nombre histórico');
  assert.equal(new Set(first.items.map(i => i.type)).size, 7);
  await assert.rejects(service.list('other-account','a'), /Business not found/);
  await assert.rejects(service.list('account','b'), /Business not found/);
  // Many identical timestamps exercise the tie breaker, not just date order.
  for (let i=0;i<45;i++) await db.query('INSERT INTO visits VALUES ($1,$2,$3,$4)', [`page-${String(i).padStart(2,'0')}`, 'a', 'ca', '2025-02-01 12:00:00.123']);
  let page = await service.list('account','a');
  const seen = []; const snapshot = page.snapshot;
  await db.query('INSERT INTO visits VALUES ($1,$2,$3,$4)', ['new-after-snapshot','a','ca',new Date(Date.now()+3600000).toISOString()]);
  while (true) { seen.push(...page.items); assert.equal(page.total,57); assert.equal(page.snapshot,snapshot); if (!page.nextCursor) break; page = await service.list('account','a',page.nextCursor); }
  assert.equal(seen.length,57); assert.equal(new Set(seen.map(i=>i.id)).size,57);
  for (let i=1;i<seen.length;i++) { const prev=seen[i-1],current=seen[i]; assert(prev.occurredAt > current.occurredAt || (prev.occurredAt === current.occurredAt && prev.id < current.id)); }
  await db.exec('TRUNCATE visits, customer_reward_goals, reward_goal_bonus_stamps, benefit_participations, customer_missions, return_challenges, checkin_feedback, "FeedbackResponse"');
  const empty = await service.list('account','a'); assert.equal(empty.total,0); assert.deepEqual(empty.items,[]);
  await db.close();
  const result = { passed: true, checks: ['all seven event types', 'tenant isolation', 'joined tenant isolation', 'one event per credited visit', 'activation/closure boundaries', 'no raffle unlock', 'redeemed benefit never expired', 'historic benefit name', 'real totals', 'stable pagination with identical timestamps', 'empty history'], paginatedRows: seen.length };
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error(error); process.exitCode=1; });
