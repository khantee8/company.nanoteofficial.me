import { it, expect } from 'vitest';
import { migrateKb } from './kbMigrate';

function fakeSql(log: { text: string; params?: unknown[] }[]) {
  let countCalls = 0;
  return async (text: string, params?: unknown[]) => {
    log.push({ text, params });
    if (text.includes('count(*)')) {
      countCalls++;
      // before LIBRARY_BACKFILL: 3 rows; after: 5 rows → delta of 2 "fromLibrary"
      return [{ count: countCalls === 1 ? '3' : '5' }];
    }
    return [];
  };
}
const redisWith = (ids: string[], entries: Record<string, unknown>) => ({
  async lrange() { return ids; },
  async mget(keys: string[]) { return keys.map((k) => entries[k] ?? null); },
  // unused members can throw
} as never);

it('applies schema, upserts redis entries, then INSERT..SELECTs library history', async () => {
  const log: { text: string; params?: unknown[] }[] = [];
  const redis = redisWith(['fin:t'], { 'kb:entry:fin:t': { dept: 'fin', ts: '2026-07-14T11:00:00.000Z', summary: 's', markdown: 'm' } });
  const out = await migrateKb({ redis, sql: fakeSql(log), schemaSql: 'CREATE TABLE IF NOT EXISTS kb_entry ()' });
  expect(log[0].text).toContain('CREATE TABLE');            // schema first
  expect(log.some((c) => c.text.includes('ON CONFLICT (id) DO NOTHING'))).toBe(true); // redis rows
  expect(log.some((c) => c.text.includes("kind = 'company_brief'"))).toBe(true);      // library rows
  expect(log.some((c) => c.text.includes('source_date IS NOT NULL'))).toBe(true);     // NULL guard on nullable Library cols
  expect(out.fromRedis).toBe(1);
  expect(out.applied).toBe(true);
  expect(typeof out.fromLibrary).toBe('number');
  expect(out.fromLibrary).toBe(2);
  // count(*) issued twice (before + after the library backfill)
  expect(log.filter((c) => c.text.includes('count(*) FROM kb_entry')).length).toBe(2);
});

it('handles an empty redis index without calling mget', async () => {
  const log: { text: string; params?: unknown[] }[] = [];
  const redis = {
    async lrange() { return []; },
    async mget() { throw new Error('mget should not be called for an empty index'); },
  } as never;
  const out = await migrateKb({ redis, sql: fakeSql(log), schemaSql: 'CREATE TABLE IF NOT EXISTS kb_entry ()' });
  expect(out.fromRedis).toBe(0);
});

it('skips null entries from mget (deleted/expired legacy keys)', async () => {
  const log: { text: string; params?: unknown[] }[] = [];
  const redis = redisWith(['fin:t', 'cyb:missing'], {
    'kb:entry:fin:t': { dept: 'fin', ts: '2026-07-14T11:00:00.000Z', summary: 's', markdown: 'm' },
  });
  const out = await migrateKb({ redis, sql: fakeSql(log), schemaSql: 'CREATE TABLE IF NOT EXISTS kb_entry ()' });
  expect(out.fromRedis).toBe(1);
});

// Regression (prod 2026-07-19): a `--` comment containing a semicolon split the
// CREATE TABLE mid-comment → Postgres "syntax error at end of input".
it('strips -- comments before splitting the schema on semicolons', async () => {
  const log: { text: string; params?: unknown[] }[] = [];
  const redis = redisWith([], {});
  await migrateKb({
    redis,
    sql: fakeSql(log),
    schemaSql: 'CREATE TABLE IF NOT EXISTS t (\n  a text, -- note: one; two\n  b text\n);\nCREATE INDEX IF NOT EXISTS i ON t (a);',
  });
  const schemaStmts = log.filter((c) => c.text.startsWith('CREATE'));
  expect(schemaStmts).toHaveLength(2);
  expect(schemaStmts[0].text).toContain('b text');       // table statement stayed whole
  expect(schemaStmts[0].text).not.toContain('one');      // comment gone
});
