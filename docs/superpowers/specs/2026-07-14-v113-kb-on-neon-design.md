# v1.13 — KB on Neon (design)

2026-07-14 · brainstormed and approved section-by-section.

## Problem

The knowledge base — the product's core asset — lives in a Redis list capped
at 300 entries: silent data loss past the cap, no full-text search, no backup,
and a whole sync subsystem (`librarySync.ts` → Library `/api/sync` → sync log)
exists only to copy entries into the Library's Neon database, lossily.

## Decisions (made with user)

1. **Shared Neon DB, new `kb_entry` table** — the company owns a
   full-fidelity table in the same Neon database the Library uses. Not a
   separate DB (keeps sync alive), not the Library's `item` table (two
   writers, note-model pollution).
2. **The Library is rewired in this release** — it reads `kb_entry` directly;
   all sync machinery is deleted in both repos. No dual-path release.
3. **Search = EN full-text + Thai substring** — `tsvector('english')` over
   summary/EN fields/tags (ranked, websearch syntax) plus a `pg_trgm` GIN
   index over the Thai text for substring matching. No external search
   service; PGroonga isn't on Neon and real Thai segmentation is YAGNI.

## Architecture

- Company gains `DATABASE_URL` (same Neon as Library) and a new
  `src/lib/kbDb.ts` — raw SQL via `@neondatabase/serverless`, mirroring the
  Library's `getSql()` pattern. No ORM.
- **Moves to Neon:** KB entries — writes from `persistRunResult`, reads for
  `/api/kb`, `/api/kb/graph`, `/api/admin/kb`, Telegram `/report`.
- **Stays in Redis (unchanged):** agent status/output/history/digest, feed,
  usage ledger, pending batch runs, focus sessions, disabled flags.
- **Deleted:** `librarySync.ts` + `pushLibrarySync()` call sites, sync log
  (`/api/admin/synclog`, ActivityPanel sync section), `LIBRARY_SYNC_URL`/
  `LIBRARY_SYNC_SECRET`; Library's `/api/sync`, `SYNC_SECRET`, daily sync cron.
- **Repo seam preserved:** `runner.ts`/`asyncRun.ts` keep calling the same
  `pushKb`/`listKb`-shaped interface; only the backing store changes.
- **KB writes are fail-soft:** a Neon failure must not kill a run —
  `persistRunResult` completes, pushes a feed event, and appends a ⚠ to the
  Telegram notify instead. (KB is now a second network dependency.)

## Schema (company repo, `db/schema.sql`, idempotent)

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS kb_entry (
  id          text PRIMARY KEY,            -- existing KbEntry.id, unchanged
  slug        text UNIQUE NOT NULL,
  dept        text NOT NULL,               -- fin | cyb | mkt | rnd
  date        date NOT NULL,
  ts          timestamptz NOT NULL,
  category    text NOT NULL,
  theme       text,
  status      text NOT NULL CHECK (status IN ('draft','published')),
  pinned      boolean NOT NULL DEFAULT false,
  incomplete  boolean NOT NULL DEFAULT false,
  provenance  text,                        -- 'api' | 'web'
  summary     text NOT NULL DEFAULT '',
  highlight    text NOT NULL DEFAULT '',   -- TH
  highlight_en text NOT NULL DEFAULT '',
  flags       jsonb NOT NULL DEFAULT '[]',
  flags_en    jsonb NOT NULL DEFAULT '[]',
  tags        text[] NOT NULL DEFAULT '{}',
  artifacts   jsonb NOT NULL DEFAULT '[]',
  sources     jsonb NOT NULL DEFAULT '[]',
  related     text[] NOT NULL DEFAULT '{}',
  markdown    text NOT NULL DEFAULT '',    -- TH narrative
  markdown_en text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  search      tsvector GENERATED ALWAYS AS (
                to_tsvector('english',
                  coalesce(summary,'') || ' ' || coalesce(highlight_en,'') || ' ' ||
                  coalesce(markdown_en,'') || ' ' || array_to_string(tags,' '))
              ) STORED
);
CREATE INDEX IF NOT EXISTS kb_entry_status_date_idx ON kb_entry (status, date DESC);
CREATE INDEX IF NOT EXISTS kb_entry_dept_idx   ON kb_entry (dept);
CREATE INDEX IF NOT EXISTS kb_entry_theme_idx  ON kb_entry (theme);
CREATE INDEX IF NOT EXISTS kb_entry_search_idx ON kb_entry USING gin (search);
CREATE INDEX IF NOT EXISTS kb_entry_trgm_idx   ON kb_entry
  USING gin ((summary || ' ' || highlight || ' ' || markdown) gin_trgm_ops);
```

- `related` stays an id array; `kbGraph.ts` keeps deriving edges in app code
  (a join table is YAGNI at this scale).
- `/api/kb?q=` runs `websearch_to_tsquery` (ranked) OR trigram `ILIKE`,
  union with FTS hits first.

## Company code changes

- **New `src/lib/kbDb.ts`:** `pushKb`, `listKb` (dept/category/q/from/to/limit
  as SQL WHERE), `getKbBySlug`, `getKbById`, `updateKbEntry`
  (status/pinned/tags/category), `deleteKbEntry`. Pure query-builder helpers,
  unit-tested without a DB.
- **Re-pointed, contracts unchanged:** `kb.ts` (`getKnowledge`/
  `getKnowledgeEntry`), `kbGraph.ts`, `/api/admin/kb` (publish PATCH no longer
  fires a sync), Telegram `/report`.
- **Dead code removed:** `redis.ts` KB functions + `kb:*` handling, legacy
  `kb:entries` read-fallback, pre-v1.3.1 `normalizeKbEntry` shims (backfill
  normalizes once).
- **Tests:** existing KB tests move to an in-memory fake of the kbDb
  interface (same pattern as the Redis stubs); SQL builders get unit tests.
  Real-DB verification runs against a **Neon branch**, not vitest.
- **Env:** `DATABASE_URL` on the company Vercel project. Missing locally →
  KB reads empty, writes fail-soft (same degradation story as missing Upstash).

## Library changes

- Reader queries `kb_entry WHERE status='published'` for company briefs;
  `item` keeps only `kind='note'`. List/search merge the two sources in the
  query layer; UI unchanged.
- **User-state migration:** `item_state`, `collection_item`, `item_tag` move
  from uuid `item_id` to **`ref_id text`** — briefs use `kb_entry.id`
  (backfilled via `item.external_id`), notes use the item uuid as text. Ships
  as an idempotent SQL file in the Library repo (`db/migrations/`), applied
  via the Neon console — the same way the Library's v0.2 migration was
  applied. It remaps the keys, then deletes brief rows from `item`.
- Deleted: `/api/sync`, `SYNC_SECRET`, daily sync cron.
- The Library keeps working on its old `item` rows until its rewire deploys —
  company can cut over first.

## Migration & rollout

Backfill = union, deduped by id, **Redis wins** (richer):
1. Redis `kb:index` entries (~300, full fidelity).
2. Library `item` rows `kind='company_brief'` not already inserted — the
   pre-cap history Redis dropped; `status='published'`, empty defaults for
   missing fields.

No local secrets on the dev box → backfill ships as a one-shot
`CRON_SECRET`-protected route **`/api/admin/migrate-kb`** (idempotent,
`ON CONFLICT DO NOTHING`), run via curl on Vercel, deleted in v1.13.1.

Order (each step verified before the next):
1. Apply `db/schema.sql` to Neon (touches nothing of the Library's).
2. Deploy company v1.13 → run backfill → verify `/api/kb` counts, admin CRUD,
   next agent run publishes to Neon.
3. Deploy Library rewire (reader + `ref_id` migration) → verify briefs,
   collections, read-state.
4. Sync deletions ride in those deploys.

**Rollback:** Redis KB keys stay untouched for one full release — redeploying
the previous company version restores the old world (minus post-cutover
entries). Redis `kb:*` cleanup is a v1.14 chore.

## Error handling

- KB write failure: run completes; feed event + ⚠ on Telegram notify.
- `/api/kb` on DB error: 500 with empty payload, never a crash page.
- Neon serverless cold start is single-digit ms over HTTP — no caching layer
  needed at current traffic.

## Testing

- Unit: query builders (pure), kbDb fake for runner/kb/graph/admin tests.
- Integration: schema + backfill dry-run on a Neon branch.
- E2E: preview deploys, then the prod rollout order above.
