// v1.13 one-shot backfill: Redis kb:* (full fidelity, wins) + the Library's
// item table (pre-cap history Redis already trimmed). Idempotent — every
// insert is ON CONFLICT DO NOTHING; safe to re-run. Delete this in v1.13.1.
import type { KbEntry } from './agents/types';
import type { RedisClientLike } from './redis';
import { normalizeKbEntry } from './redis';
import { entryToParams, KB_COLUMNS } from './kbDb';

const PLACEHOLDERS = Array.from({ length: 22 }, (_, i) => `$${i + 1}`).join(', ');
const INSERT_IGNORE =
  `INSERT INTO kb_entry (${KB_COLUMNS}) VALUES (${PLACEHOLDERS}) ON CONFLICT (id) DO NOTHING`;

const COUNT_SQL = 'SELECT count(*) FROM kb_entry';

// Library rows lack EN/status/sources — published (they only synced on publish),
// empty defaults elsewhere. Slug derived like deriveSlug: dept-category-date.
const LIBRARY_BACKFILL = `
  INSERT INTO kb_entry (id, slug, dept, date, ts, category, status, summary, highlight,
                        highlight_en, flags, flags_en, tags, artifacts, markdown, markdown_en)
  SELECT i.external_id,
         i.dept || '-' || coalesce(i.category,'brief') || '-' || to_char(i.source_date,'YYYY-MM-DD'),
         i.dept, i.source_date, i.source_ts, coalesce(i.category,'market-brief'), 'published',
         i.summary, i.highlight, i.highlight, i.flags, i.flags,
         coalesce((SELECT array_agg(t.slug) FROM item_tag itg JOIN tag t ON t.id=itg.tag_id WHERE itg.item_id=i.id), '{}'),
         i.artifacts, i.body_md, i.body_md
  FROM item i
  WHERE i.kind = 'company_brief' AND i.external_id IS NOT NULL
    AND i.source_date IS NOT NULL AND i.dept IS NOT NULL AND i.source_ts IS NOT NULL
  ON CONFLICT (id) DO NOTHING`;

export interface MigrateDeps {
  redis: RedisClientLike;
  sql: (text: string, params?: unknown[]) => Promise<unknown>;
  schemaSql: string;
}

export interface MigrateResult {
  applied: true;
  fromRedis: number;
  fromLibrary: number;
}

function rowCount(rows: unknown): number {
  const r = (rows as Array<Record<string, unknown>> | undefined)?.[0];
  const raw = r?.count;
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export async function migrateKb({ redis, sql, schemaSql }: MigrateDeps): Promise<MigrateResult> {
  // 1. schema (idempotent) — statement-by-statement, neon http can't multi-statement.
  // Strip `--` comments BEFORE splitting on ';': a semicolon inside a comment
  // otherwise cuts a statement in half (prod incident 2026-07-19). Our DDL has
  // no `--` inside string literals, so line-level stripping is safe.
  const bare = schemaSql.split('\n').map((l) => l.replace(/--.*$/, '')).join('\n');
  for (const stmt of bare.split(';').map((s) => s.trim()).filter(Boolean)) {
    await sql(stmt);
  }
  // 2. redis entries (richer — inserted first so DO NOTHING protects them from step 3)
  const ids = await redis.lrange<string>('kb:index', 0, -1);
  let fromRedis = 0;
  if (ids.length > 0) {
    const raw = await redis.mget<Partial<KbEntry> & { dept: KbEntry['dept']; ts: string }>(
      ids.map((id) => `kb:entry:${id}`));
    for (const r of raw) {
      if (!r) continue;
      await sql(INSERT_IGNORE, entryToParams(normalizeKbEntry(r)));
      fromRedis++;
    }
  }
  // 3. library pre-cap history (same database — one INSERT..SELECT). The neon
  // http driver's .query() doesn't reliably surface a row/insert count across
  // statement shapes, so fromLibrary is a count(*) delta around the insert
  // rather than a parsed rowcount.
  const before = rowCount(await sql(COUNT_SQL));
  await sql(LIBRARY_BACKFILL);
  const after = rowCount(await sql(COUNT_SQL));
  return { applied: true, fromRedis, fromLibrary: after - before };
}
