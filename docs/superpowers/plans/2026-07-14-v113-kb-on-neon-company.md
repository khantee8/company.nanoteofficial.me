# v1.13 KB-on-Neon — Phase A (company repo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the company knowledge base's system of record from the capped Redis list to a `kb_entry` table in the shared Neon Postgres, with EN full-text + Thai trigram search, fail-soft writes, and a one-shot backfill — deleting the Library-sync machinery on the company side.

**Architecture:** New `src/lib/kbDb.ts` (raw SQL via `@neondatabase/serverless`, same pattern as the Library's `db.ts`) implements a `KbStore` interface extracted from the KB methods of `RedisRepo`; `makeRedisRepo` delegates those methods to it so every caller (`runner.ts`, `kb.ts`, `kbGraph.ts`, admin routes, Telegram) is unchanged. A `CRON_SECRET`-protected one-shot route applies the idempotent schema and backfills from Redis + the Library's `item` table (same database).

**Tech Stack:** Next.js 16 / TypeScript, `@neondatabase/serverless` (HTTP driver), Vitest, Upstash Redis (staying, for hot state).

**Spec:** `docs/superpowers/specs/2026-07-14-v113-kb-on-neon-design.md`

## Global Constraints

- KbEntry `status` is `'draft' | 'published' | 'archived'` — the SQL CHECK must include all three (the spec draft omitted `archived`; this plan is correct).
- Existing entry ids (`<dept>:<ts>`) and slugs carry over verbatim — `id text PRIMARY KEY`, no uuids.
- `RedisRepo` call sites must not change — only the store behind `pushKb`/`getKbEntry`/`getKbBySlug`/`updateKbEntry`/`deleteKbEntry`/`listKb` moves.
- KB write failure must never fail a run (`persistRunResult` completes; feed event + ⚠ in Telegram text instead).
- Env: `DATABASE_URL` (or `POSTGRES_URL`) — the SAME Neon database the Library uses. Missing env → reads return `[]`, writes throw (caught fail-soft).
- No ORM. Raw parameterized SQL only. All user-facing route response shapes unchanged.
- Tests must not require a live database: pure builders unit-tested; consumers use `makeMemoryKbStore()`.
- Run all commands from `/project/src/company.nanoteofficial.me`.

---

### Task 1: Dependency + schema file

**Files:**
- Create: `db/schema.sql`
- Modify: `package.json` (dependency), `next.config.ts` (ship schema.sql to serverless bundle)

**Interfaces:**
- Produces: `db/schema.sql` — idempotent DDL applied by Task 6's migrate route (which reads this file at runtime, like `roles.ts` reads `.agents/*.md`).

- [ ] **Step 1: Install the driver**

Run: `npm install @neondatabase/serverless`
Expected: added to `dependencies` in package.json.

- [ ] **Step 2: Write `db/schema.sql`**

```sql
-- company KB system of record (v1.13). Idempotent — applied by /api/admin/migrate-kb.
-- Lives in the SAME Neon database as the Library (kb.nanoteofficial.me).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS kb_entry (
  id          text PRIMARY KEY,            -- existing KbEntry.id (<dept>:<ts>), unchanged
  slug        text NOT NULL,          -- NOT unique: legacy same-day entries can share one; reads pick newest
  dept        text NOT NULL,
  date        date NOT NULL,
  ts          timestamptz NOT NULL,
  category    text NOT NULL,
  theme       text,
  status      text NOT NULL CHECK (status IN ('draft','published','archived')),
  pinned      boolean NOT NULL DEFAULT false,
  incomplete  boolean NOT NULL DEFAULT false,
  provenance  text NOT NULL DEFAULT 'api',
  summary     text NOT NULL DEFAULT '',
  highlight    text NOT NULL DEFAULT '',
  highlight_en text NOT NULL DEFAULT '',
  flags       jsonb NOT NULL DEFAULT '[]',
  flags_en    jsonb NOT NULL DEFAULT '[]',
  tags        text[] NOT NULL DEFAULT '{}',
  artifacts   jsonb NOT NULL DEFAULT '[]',
  sources     jsonb NOT NULL DEFAULT '[]',
  related     text[] NOT NULL DEFAULT '{}',
  markdown    text NOT NULL DEFAULT '',
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
CREATE INDEX IF NOT EXISTS kb_entry_slug_idx   ON kb_entry (slug);
CREATE INDEX IF NOT EXISTS kb_entry_dept_idx   ON kb_entry (dept);
CREATE INDEX IF NOT EXISTS kb_entry_theme_idx  ON kb_entry (theme);
CREATE INDEX IF NOT EXISTS kb_entry_search_idx ON kb_entry USING gin (search);
CREATE INDEX IF NOT EXISTS kb_entry_trgm_idx   ON kb_entry
  USING gin ((summary || ' ' || highlight || ' ' || markdown) gin_trgm_ops);
```

- [ ] **Step 3: Ship the file to the serverless bundle**

In `next.config.ts`, find `outputFileTracingIncludes` (it already includes `.agents/*.md` for `roles.ts`) and add `'./db/schema.sql'` to the include list for the api routes entry (same pattern, e.g. `'/api/**/*': ['./.agents/*.md', './db/schema.sql']` — match the existing key shape in the file).

- [ ] **Step 4: Build to verify config parses**

Run: `npm run build 2>&1 | tail -3`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json db/schema.sql next.config.ts
git commit -m "feat(v1.13): neon driver + kb_entry schema (idempotent DDL)"
```

---

### Task 2: `kbDb.ts` pure builders (row mapping + WHERE builder)

**Files:**
- Create: `src/lib/kbDb.ts`
- Test: `src/lib/kbDb.test.ts`

**Interfaces:**
- Consumes: `KbEntry` from `@/lib/agents/types`; `KbQuery`, `KbPatch` from `@/lib/redis` (import type only — no cycle: redis.ts will import kbDb lazily in Task 4 via function call, and kbDb imports only types from redis).
- Produces (exact exports):
  - `rowToKbEntry(r: Record<string, unknown>): KbEntry`
  - `entryToParams(e: KbEntry): unknown[]` — 21 params in the column order used by `PUSH_SQL` (Task 3)
  - `buildKbWhere(q: KbQuery): { clauses: string[]; params: unknown[] }` — `$1`-based, matching the Library's `buildItemsWhere` style
  - `KB_COLUMNS: string` — the select-list constant

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/kbDb.test.ts
import { describe, it, expect } from 'vitest';
import { rowToKbEntry, entryToParams, buildKbWhere, KB_COLUMNS } from './kbDb';
import type { KbEntry } from './agents/types';

export const ENTRY: KbEntry = {
  id: 'fin:2026-07-14T11:00:00.000Z', slug: 'fin-thai-tax-funds-2026-07-14',
  dept: 'fin', date: '2026-07-14', ts: '2026-07-14T11:00:00.000Z',
  category: 'market-brief', theme: 'thai-tax-funds', tags: ['scbam'],
  status: 'published', pinned: false, summary: 'ส', highlight: 'ห', highlightEn: 'h',
  flags: ['f1'], flagsEn: ['f1e'], artifacts: [], sources: [{ url: 'https://e.com', title: 't', date: '2026-07-14' }],
  provenance: 'web', related: ['cyb:2026-07-14T10:00:00.000Z'],
  markdown: 'ไทย', markdownEn: 'en', incomplete: false,
};

describe('row mapping', () => {
  it('round-trips an entry through params → row → entry', () => {
    const params = entryToParams(ENTRY);
    expect(params[0]).toBe(ENTRY.id);
    // simulate a DB row (snake_case, Date objects, jsonb already parsed)
    const row = {
      id: ENTRY.id, slug: ENTRY.slug, dept: 'fin', date: new Date('2026-07-14'),
      ts: new Date(ENTRY.ts), category: 'market-brief', theme: 'thai-tax-funds',
      status: 'published', pinned: false, incomplete: false, provenance: 'web',
      summary: 'ส', highlight: 'ห', highlight_en: 'h', flags: ['f1'], flags_en: ['f1e'],
      tags: ['scbam'], artifacts: [], sources: ENTRY.sources, related: ENTRY.related,
      markdown: 'ไทย', markdown_en: 'en',
    };
    expect(rowToKbEntry(row)).toEqual(ENTRY);
  });
});

describe('buildKbWhere', () => {
  it('builds parameterized clauses for dept/status/category/date range', () => {
    const { clauses, params } = buildKbWhere({ status: 'published', dept: 'fin', from: '2026-07-01', to: '2026-07-31' });
    expect(clauses).toEqual(['status = $1', 'dept = $2', 'date >= $3', 'date <= $4']);
    expect(params).toEqual(['published', 'fin', '2026-07-01', '2026-07-31']);
  });
  it('q produces a combined FTS-or-trigram clause with ONE param used twice', () => {
    const { clauses, params } = buildKbWhere({ q: 'ThaiESG' });
    expect(clauses).toHaveLength(1);
    expect(clauses[0]).toContain('websearch_to_tsquery');
    expect(clauses[0]).toContain('ILIKE');
    expect(params).toEqual(['ThaiESG', '%ThaiESG%']);
  });
  it('empty query builds nothing', () => {
    expect(buildKbWhere({})).toEqual({ clauses: [], params: [] });
  });
  it('KB_COLUMNS lists snake_case columns, no search vector', () => {
    expect(KB_COLUMNS).toContain('highlight_en');
    expect(KB_COLUMNS).not.toContain('search');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/kbDb.test.ts`
Expected: FAIL — cannot resolve `./kbDb`.

- [ ] **Step 3: Implement the pure half of `src/lib/kbDb.ts`**

```typescript
// KB system of record (v1.13): kb_entry in the shared Neon Postgres.
// Raw SQL via the neon HTTP driver — same pattern as the Library's db.ts.
// Pure helpers up top (unit-tested); the store (network) half is below.
import type { KbEntry } from './agents/types';
import type { KbQuery } from './redis';

export const KB_COLUMNS =
  'id, slug, dept, date, ts, category, theme, status, pinned, incomplete, provenance, ' +
  'summary, highlight, highlight_en, flags, flags_en, tags, artifacts, sources, related, ' +
  'markdown, markdown_en';

const dateOnly = (v: unknown): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '');
const iso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : String(v ?? '');

export function rowToKbEntry(r: Record<string, unknown>): KbEntry {
  return {
    id: String(r.id), slug: String(r.slug), dept: r.dept as KbEntry['dept'],
    date: dateOnly(r.date), ts: iso(r.ts),
    category: r.category as KbEntry['category'],
    theme: (r.theme as string | null) ?? undefined,
    status: r.status as KbEntry['status'],
    pinned: Boolean(r.pinned), incomplete: Boolean(r.incomplete),
    provenance: r.provenance as KbEntry['provenance'],
    summary: String(r.summary ?? ''), highlight: String(r.highlight ?? ''),
    highlightEn: String(r.highlight_en ?? ''),
    flags: (r.flags as string[]) ?? [], flagsEn: (r.flags_en as string[]) ?? [],
    tags: (r.tags as string[]) ?? [],
    artifacts: (r.artifacts as KbEntry['artifacts']) ?? [],
    sources: (r.sources as KbEntry['sources']) ?? [],
    related: (r.related as string[]) ?? [],
    markdown: String(r.markdown ?? ''), markdownEn: String(r.markdown_en ?? ''),
  };
}

/** Params in KB_COLUMNS order — pair with PUSH_SQL's $1..$22 placeholders. */
export function entryToParams(e: KbEntry): unknown[] {
  return [
    e.id, e.slug, e.dept, e.date, e.ts, e.category, e.theme ?? null, e.status,
    e.pinned ?? false, e.incomplete ?? false, e.provenance,
    e.summary, e.highlight, e.highlightEn ?? e.highlight,
    JSON.stringify(e.flags), JSON.stringify(e.flagsEn ?? e.flags),
    e.tags, JSON.stringify(e.artifacts), JSON.stringify(e.sources), e.related,
    e.markdown, e.markdownEn ?? e.markdown,
  ];
}

export function buildKbWhere(q: KbQuery): { clauses: string[]; params: unknown[] } {
  const clauses: string[] = []; const params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length}`; };
  if (q.status) clauses.push(`status = ${p(q.status)}`);
  if (q.dept) clauses.push(`dept = ${p(q.dept)}`);
  if (q.category) clauses.push(`category = ${p(q.category)}`);
  if (typeof q.pinned === 'boolean') clauses.push(`pinned = ${p(q.pinned)}`);
  if (q.from) clauses.push(`date >= ${p(q.from)}`);
  if (q.to) clauses.push(`date <= ${p(q.to)}`);
  if (q.q && q.q.trim()) {
    const term = q.q.trim();
    // EN full-text (ranked at query time) OR Thai/any substring via trigram index.
    clauses.push(
      `(search @@ websearch_to_tsquery('english', ${p(term)}) ` +
      `OR (summary || ' ' || highlight || ' ' || markdown) ILIKE ${p(`%${term}%`)})`,
    );
  }
  return { clauses, params };
}
```

Note: `entryToParams` returns 22 values; `rowToKbEntry(row)` must reproduce the test's ENTRY exactly (theme undefined vs null handled above).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/kbDb.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kbDb.ts src/lib/kbDb.test.ts
git commit -m "feat(v1.13): kbDb pure builders — row mapping + parameterized WHERE"
```

---

### Task 3: `KbStore` implementation + in-memory fake

**Files:**
- Modify: `src/lib/kbDb.ts` (append store half)
- Test: `src/lib/kbDb.test.ts` (append store tests with a stubbed `neon`)

**Interfaces:**
- Produces (exact exports):
  - `interface KbStore { pushKb(e: KbEntry): Promise<void>; getKbEntry(id: string): Promise<KbEntry | null>; getKbBySlug(slug: string): Promise<KbEntry | null>; updateKbEntry(id: string, patch: KbPatch): Promise<KbEntry | null>; deleteKbEntry(id: string): Promise<void>; listKb(opts?: KbQuery): Promise<KbEntry[]> }`
  - `makeKbDbStore(): KbStore` — real Neon-backed store (lazy `getSql()`, throws at call time when env missing — same as the Library)
  - `makeMemoryKbStore(seed?: KbEntry[]): KbStore` — in-memory fake for tests (newest-first list semantics, same filters via `buildKbWhere` logic replicated in JS)

- [ ] **Step 1: Write failing tests (stub the neon driver)**

Append to `src/lib/kbDb.test.ts`:

```typescript
import { vi } from 'vitest';
import { makeMemoryKbStore } from './kbDb';

describe('makeMemoryKbStore', () => {
  it('push → list newest-first with status filter; update patches; delete removes', async () => {
    const s = makeMemoryKbStore();
    await s.pushKb(ENTRY);
    await s.pushKb({ ...ENTRY, id: 'cyb:x', slug: 'cyb-threat-intel-2026-07-15', dept: 'cyb', date: '2026-07-15', ts: '2026-07-15T10:00:00.000Z', status: 'draft' });
    expect((await s.listKb({})).map((e) => e.id)).toEqual(['cyb:x', ENTRY.id]);
    expect(await s.listKb({ status: 'published' })).toHaveLength(1);
    expect((await s.getKbBySlug(ENTRY.slug))?.id).toBe(ENTRY.id);
    const patched = await s.updateKbEntry('cyb:x', { status: 'published' });
    expect(patched?.status).toBe('published');
    await s.deleteKbEntry('cyb:x');
    expect(await s.getKbEntry('cyb:x')).toBeNull();
  });
  it('listKb q matches substring across summary/highlight/markdown', async () => {
    const s = makeMemoryKbStore([ENTRY]);
    expect(await s.listKb({ q: 'ไทย' })).toHaveLength(1);
    expect(await s.listKb({ q: 'nope' })).toHaveLength(0);
  });
});

describe('makeKbDbStore SQL', () => {
  it('pushKb issues an upsert with 22 params; listKb orders ts DESC with limit', async () => {
    const calls: { text: string; params?: unknown[] }[] = [];
    const fakeSql = Object.assign(
      async (text: string, params?: unknown[]) => { calls.push({ text, params }); return []; },
      { query: async (text: string, params?: unknown[]) => { calls.push({ text, params }); return []; } },
    );
    vi.doMock('@neondatabase/serverless', () => ({ neon: () => fakeSql }));
    process.env.DATABASE_URL = 'postgres://x';
    const { makeKbDbStore } = await import('./kbDb');
    const store = makeKbDbStore();
    await store.pushKb(ENTRY);
    await store.listKb({ status: 'published', limit: 5 });
    expect(calls[0].text).toContain('INSERT INTO kb_entry');
    expect(calls[0].text).toContain('ON CONFLICT (id) DO UPDATE');
    expect(calls[0].params).toHaveLength(22);
    expect(calls[1].text).toContain('ORDER BY ts DESC');
    expect(calls[1].text).toContain('LIMIT');
    vi.doUnmock('@neondatabase/serverless');
    delete process.env.DATABASE_URL;
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/kbDb.test.ts`
Expected: FAIL — `makeMemoryKbStore` / `makeKbDbStore` not exported.

- [ ] **Step 3: Implement the store half (append to `kbDb.ts`)**

```typescript
import type { KbPatch } from './redis';

export interface KbStore {
  pushKb(e: KbEntry): Promise<void>;
  getKbEntry(id: string): Promise<KbEntry | null>;
  getKbBySlug(slug: string): Promise<KbEntry | null>;
  updateKbEntry(id: string, patch: KbPatch): Promise<KbEntry | null>;
  deleteKbEntry(id: string): Promise<void>;
  listKb(opts?: KbQuery): Promise<KbEntry[]>;
}

type SqlFn = (text: string, params?: unknown[]) => Promise<unknown>;
async function getSql(): Promise<SqlFn> {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL (or POSTGRES_URL) is not set');
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  // neon() returns a tagged template with a .query(text, params) escape hatch.
  return (text, params) => (sql as unknown as { query: SqlFn }).query(text, params ?? []);
}

const PLACEHOLDERS = Array.from({ length: 22 }, (_, i) => `$${i + 1}`).join(', ');
const PUSH_SQL =
  `INSERT INTO kb_entry (${KB_COLUMNS}) VALUES (${PLACEHOLDERS})
   ON CONFLICT (id) DO UPDATE SET
     slug=EXCLUDED.slug, status=EXCLUDED.status, pinned=EXCLUDED.pinned,
     incomplete=EXCLUDED.incomplete, summary=EXCLUDED.summary,
     highlight=EXCLUDED.highlight, highlight_en=EXCLUDED.highlight_en,
     flags=EXCLUDED.flags, flags_en=EXCLUDED.flags_en, tags=EXCLUDED.tags,
     artifacts=EXCLUDED.artifacts, sources=EXCLUDED.sources, related=EXCLUDED.related,
     markdown=EXCLUDED.markdown, markdown_en=EXCLUDED.markdown_en, updated_at=now()`;

export function makeKbDbStore(): KbStore {
  const rows = async (text: string, params?: unknown[]) =>
    (await (await getSql())(text, params)) as Record<string, unknown>[];
  return {
    async pushKb(e) { await rows(PUSH_SQL, entryToParams(e)); },
    async getKbEntry(id) {
      const r = await rows(`SELECT ${KB_COLUMNS} FROM kb_entry WHERE id = $1`, [id]);
      return r[0] ? rowToKbEntry(r[0]) : null;
    },
    async getKbBySlug(slug) {
      const r = await rows(
        `SELECT ${KB_COLUMNS} FROM kb_entry WHERE slug = $1 ORDER BY ts DESC LIMIT 1`, [slug]);
      return r[0] ? rowToKbEntry(r[0]) : null;
    },
    async updateKbEntry(id, patch) {
      const cur = await this.getKbEntry(id);
      if (!cur) return null;
      const next: KbEntry = { ...cur, ...patch };
      await this.pushKb(next); // upsert
      return next;
    },
    async deleteKbEntry(id) { await rows(`DELETE FROM kb_entry WHERE id = $1`, [id]); },
    async listKb(opts = {}) {
      const { clauses, params } = buildKbWhere(opts);
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      const limit = opts.limit && opts.limit > 0 ? Math.min(opts.limit, 500) : 100;
      const r = await rows(
        `SELECT ${KB_COLUMNS} FROM kb_entry ${where} ORDER BY ts DESC LIMIT ${limit}`, params);
      return r.map(rowToKbEntry);
    },
  };
}

/** In-memory KbStore for tests — mirrors listKb filter semantics. */
export function makeMemoryKbStore(seed: KbEntry[] = []): KbStore {
  let entries: KbEntry[] = [...seed];
  const matches = (e: KbEntry, q: KbQuery) => {
    if (q.status && e.status !== q.status) return false;
    if (q.dept && e.dept !== q.dept) return false;
    if (q.category && e.category !== q.category) return false;
    if (typeof q.pinned === 'boolean' && Boolean(e.pinned) !== q.pinned) return false;
    if (q.from && e.date < q.from) return false;
    if (q.to && e.date > q.to) return false;
    if (q.q && q.q.trim()) {
      const t = q.q.trim().toLowerCase();
      const hay = `${e.summary} ${e.highlight} ${e.highlightEn ?? ''} ${e.markdown} ${e.markdownEn ?? ''} ${e.tags.join(' ')}`.toLowerCase();
      if (!hay.includes(t)) return false;
    }
    return true;
  };
  return {
    async pushKb(e) { entries = [e, ...entries.filter((x) => x.id !== e.id)]; },
    async getKbEntry(id) { return entries.find((e) => e.id === id) ?? null; },
    async getKbBySlug(slug) { return entries.find((e) => e.slug === slug) ?? null; },
    async updateKbEntry(id, patch) {
      const cur = entries.find((e) => e.id === id);
      if (!cur) return null;
      const next = { ...cur, ...patch };
      entries = entries.map((e) => (e.id === id ? next : e));
      return next;
    },
    async deleteKbEntry(id) { entries = entries.filter((e) => e.id !== id); },
    async listKb(opts = {}) {
      const out = entries
        .filter((e) => matches(e, opts))
        .sort((a, b) => (a.ts < b.ts ? 1 : -1));
      return out.slice(0, opts.limit && opts.limit > 0 ? opts.limit : 100);
    },
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/kbDb.test.ts`
Expected: PASS (7 tests). If the `vi.doMock` dynamic-import test is flaky under the pool, convert it to `vi.mock` at file top with an importActual passthrough — behavior asserted stays identical.

- [ ] **Step 5: Commit**

```bash
git add src/lib/kbDb.ts src/lib/kbDb.test.ts
git commit -m "feat(v1.13): KbStore — neon-backed store + in-memory fake"
```

---

### Task 4: Repo seam — `makeRedisRepo` delegates KB methods to `KbStore`

**Files:**
- Modify: `src/lib/redis.ts`
- Test: `src/lib/redis.kb.test.ts` (rewrite), plus fix construction sites in `src/lib/kb.test.ts`, `src/lib/redis.graph.test.ts` (if it builds a repo), `src/lib/agents/runner.kb.test.ts`, `src/lib/dashboard.test.ts` — anywhere `makeRedisRepo(memoryClient())` exercises KB methods, pass a memory store.

**Interfaces:**
- Consumes: `KbStore`, `makeKbDbStore`, `makeMemoryKbStore` from `./kbDb`.
- Produces: `makeRedisRepo(client: RedisClientLike, kb: KbStore = makeKbDbStore()): RedisRepo` — same `RedisRepo` type as today; the six KB methods now delegate to `kb`. `deriveSlug` and `normalizeKbEntry` remain exported (Task 6's backfill uses `normalizeKbEntry`); `matchesKbQuery`, `KB_INDEX`, `KB_CAP`, `kbKey`, and the legacy `kb:entries` fallback are deleted.

- [ ] **Step 1: Write the failing test (rewrite `src/lib/redis.kb.test.ts`)**

Replace the file's contents with:

```typescript
import { describe, it, expect } from 'vitest';
import { makeRedisRepo, type RedisClientLike } from './redis';
import { makeMemoryKbStore } from './kbDb';

const noopClient = {
  async set() { return 'OK'; }, async get() { return null; }, async del() { return 0; },
  async mget(ks: string[]) { return ks.map(() => null); },
  async lpush() { return 1; }, async lrem() { return 0; },
  async ltrim() { return 'OK'; }, async lrange() { return []; },
} as unknown as RedisClientLike;

describe('repo KB delegation', () => {
  it('pushKb/listKb/updateKbEntry go through the injected KbStore', async () => {
    const kb = makeMemoryKbStore();
    const repo = makeRedisRepo(noopClient, kb);
    await repo.pushKb({
      id: 'fin:t', slug: 'fin-market-brief-2026-07-14', dept: 'fin', date: '2026-07-14',
      ts: '2026-07-14T11:00:00.000Z', category: 'market-brief', tags: [], status: 'draft',
      summary: 's', highlight: 'h', flags: [], artifacts: [], sources: [],
      provenance: 'api', related: [], markdown: 'm',
    });
    expect(await kb.getKbEntry('fin:t')).not.toBeNull();
    expect((await repo.listKb({ status: 'draft' }))).toHaveLength(1);
    expect((await repo.updateKbEntry('fin:t', { status: 'published' }))?.status).toBe('published');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/redis.kb.test.ts`
Expected: FAIL — `makeRedisRepo` doesn't accept a second argument / KB methods still hit Redis keys.

- [ ] **Step 3: Implement in `redis.ts`**

- Add `import { makeKbDbStore, type KbStore } from './kbDb';`
- Change the factory signature: `export function makeRedisRepo(client: RedisClientLike, kb: KbStore = makeKbDbStore())`.
- Replace the bodies of `pushKb`, `getKbEntry`, `getKbBySlug`, `updateKbEntry`, `deleteKbEntry`, `listKb` inside the returned object with one-line delegations, e.g.:

```typescript
    pushKb: (entry: KbEntry) => kb.pushKb(entry),
    getKbEntry: (id: string) => kb.getKbEntry(id),
    getKbBySlug: (slug: string) => kb.getKbBySlug(slug),
    updateKbEntry: (id: string, patch: KbPatch) => kb.updateKbEntry(id, patch),
    deleteKbEntry: (id: string) => kb.deleteKbEntry(id),
    listKb: (opts: KbQuery = {}) => kb.listKb(opts),
```

- Delete now-dead code: `KB_INDEX`, `KB_CAP`, `kbKey`, `matchesKbQuery`, and the legacy `kb:entries` read-fallback block. KEEP `deriveSlug` and `normalizeKbEntry` (backfill + `persistRunResult` still use them).
- Wherever the singleton repo is built for routes (the module-level `repo`/`getRepo()` in redis.ts or its consumers), no change is needed — the default `makeKbDbStore()` kicks in.

- [ ] **Step 4: Run the full suite and fix construction sites**

Run: `npx vitest run`
Expected: `redis.kb.test.ts` passes. Any test that previously exercised KB methods through `memoryClient()` now fails on `DATABASE_URL is not set` — fix each by passing `makeMemoryKbStore()` as the second argument to `makeRedisRepo(...)` (and seed entries through `repo.pushKb` instead of `client.lpush('kb:index', ...)`). Repeat until the suite is green.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add -A src/lib src/app
git commit -m "feat(v1.13): repo KB methods delegate to KbStore (Neon) — Redis kb:* retired"
```

---

### Task 5: Fail-soft KB writes in `persistRunResult`

**Files:**
- Modify: `src/lib/agents/runner.ts` (the `Promise.all` block ~line 220 and the `related` lookup ~line 212)
- Test: `src/lib/agents/runner.kb.test.ts` (add case)

**Interfaces:**
- Consumes: repo interface unchanged.
- Produces: no new exports — behavior only: a throwing `pushKb`/`listKb` must not reject `persistRunResult`; it pushes a feed event containing `KB write failed` and appends `⚠ KB write failed` to the Telegram notify text.

- [ ] **Step 1: Write the failing test (append to `runner.kb.test.ts`)**

```typescript
it('a throwing KbStore does not fail the run — feed event + notify warning instead', async () => {
  const kb = makeMemoryKbStore();
  kb.pushKb = async () => { throw new Error('neon down'); };
  kb.listKb = async () => { throw new Error('neon down'); };
  const repo = makeRedisRepo(memoryClient(), kb);
  const notify = vi.fn(async () => {});
  await persistRunResult('cyb', {
    markdown: '# x\n\n## Highlight\nh\n\n## Flags\nNone', summary: 's', feedMsg: 'm',
    sources: [{ url: 'https://x', title: 't', date: '2026-07-14' }], provenance: 'web',
  }, { repo, notify });
  const feed = await repo.getFeed?.() ?? [];
  const events = JSON.stringify(feed);
  expect(events).toContain('KB write failed');
  expect(notify).toHaveBeenCalledWith(expect.stringContaining('KB write failed'));
});
```

(Adapt the feed read to this test file's existing helper for reading pushed events — it already asserts on feed events elsewhere; reuse that accessor.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/agents/runner.kb.test.ts`
Expected: FAIL — `persistRunResult` rejects with `neon down`.

- [ ] **Step 3: Implement in `runner.ts`**

- Wrap the `related` recent-lookup: `const recent = await repo.listKb({ limit: 24 }).catch(() => [] as KbEntry[]);`
- Pull the `repo.pushKb(...)` entry out of the `Promise.all` array. After the `Promise.all`, run:

```typescript
  let kbFailed = false;
  if (frontend) {
    try {
      await repo.pushKb({ id, slug, dept, date, ts, category, theme,
        tags, status: kbStatus, summary: result.summary, highlight, highlightEn, flags, flagsEn, artifacts,
        sources, provenance, related, markdown, markdownEn, incomplete });
    } catch (err) {
      kbFailed = true;
      // ponytail: fail-soft — KB is a second network dependency and must not kill a run
      await repo.pushEvent({ dept, msg: `${dept.toUpperCase()} KB write failed: ${err instanceof Error ? err.message : String(err)}`, ts });
    }
  }
```

- In the notify text construction, append: `const kbWarn = kbFailed ? '\n⚠ KB write failed — entry not archived' : '';` and include `kbWarn` next to the existing `warn`/`kbNote` suffixes (suppress `kbNote` when `kbFailed`).
- Library sync is gone in the next task; if `pushLibrarySync` was invoked adjacent to `pushKb`, leave it for Task 6 to delete.

- [ ] **Step 4: Run to verify pass + full suite**

Run: `npx vitest run src/lib/agents/runner.kb.test.ts && npx vitest run`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/runner.ts src/lib/agents/runner.kb.test.ts
git commit -m "feat(v1.13): fail-soft KB writes — a Neon outage cannot fail a run"
```

---

### Task 6: Delete the Library-sync machinery

**Files:**
- Delete: `src/lib/librarySync.ts`, `src/lib/librarySync.test.ts`, `src/app/api/admin/synclog/route.ts`
- Modify: `src/lib/agents/runner.ts` (remove `pushLibrarySync` import + call), `src/app/api/admin/kb/route.ts` (remove publish-PATCH sync fire), `src/components/admin/ActivityPanel.tsx` (remove the sync-log section + its fetch), `src/components/admin/AdminNav.tsx` (remove footer sync status if present), `src/lib/redis.ts` (remove `library:synclog` list helpers `pushSyncLog`/`getSyncLog` if defined there)

**Interfaces:**
- Produces: nothing — pure deletion. `/api/admin/kb` PATCH keeps its response shape.

- [ ] **Step 1: Delete + strip call sites**

```bash
git rm src/lib/librarySync.ts src/lib/librarySync.test.ts
git rm -r src/app/api/admin/synclog
```

Then remove every remaining reference: `grep -rn "librarySync\|pushLibrarySync\|synclog\|SyncLog\|LIBRARY_SYNC" src/ --include='*.ts*'` and edit each hit (runner.ts, admin kb route, ActivityPanel, AdminNav, redis.ts, adminPalette if it indexes the synclog view).

- [ ] **Step 2: Verify no references + suite green**

Run: `grep -rn "librarySync\|LIBRARY_SYNC" src/ | wc -l` → Expected: `0`
Run: `npx vitest run && npx tsc --noEmit && npm run lint`
Expected: all green (delete any orphaned tests that asserted sync behavior).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(v1.13): delete Library-sync machinery — shared kb_entry table replaces it"
```

---

### Task 7: One-shot backfill route `/api/admin/migrate-kb`

**Files:**
- Create: `src/app/api/admin/migrate-kb/route.ts`
- Test: `src/lib/kbMigrate.test.ts` + Create: `src/lib/kbMigrate.ts` (pure + orchestration, so the route is thin)

**Interfaces:**
- Consumes: `normalizeKbEntry` from `./redis`, `entryToParams`, `KB_COLUMNS` from `./kbDb`; raw Redis client via `RedisClientLike` (reads legacy keys directly — repo no longer exposes them).
- Produces: `migrateKb(deps: { redis: RedisClientLike; sql: (text: string, params?: unknown[]) => Promise<unknown> ; schemaSql: string }): Promise<{ applied: true; fromRedis: number; fromLibrary: number }>`

- [ ] **Step 1: Write failing tests**

```typescript
// src/lib/kbMigrate.test.ts
import { describe, it, expect } from 'vitest';
import { migrateKb } from './kbMigrate';

function fakeSql(log: { text: string; params?: unknown[] }[]) {
  return async (text: string, params?: unknown[]) => {
    log.push({ text, params });
    if (text.includes('FROM item')) return [{ inserted: 2 }];
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
  expect(out.fromRedis).toBe(1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/kbMigrate.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `src/lib/kbMigrate.ts`**

```typescript
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
  ON CONFLICT (id) DO NOTHING`;

export interface MigrateDeps {
  redis: RedisClientLike;
  sql: (text: string, params?: unknown[]) => Promise<unknown>;
  schemaSql: string;
}

export async function migrateKb({ redis, sql, schemaSql }: MigrateDeps) {
  // 1. schema (idempotent) — statement-by-statement, neon http can't multi-statement
  for (const stmt of schemaSql.split(';').map((s) => s.trim()).filter(Boolean)) {
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
  // 3. library pre-cap history (same database — one INSERT..SELECT)
  await sql(LIBRARY_BACKFILL);
  return { applied: true as const, fromRedis, fromLibrary: -1 }; // -1: neon http returns no rowcount; verify via SELECT count(*)
}
```

Adjust the test's `fromLibrary` expectation to match (`-1`), or have `migrateKb` run `SELECT count(*) FROM kb_entry` before/after step 3 and report the delta — pick the count-delta version and assert `fromLibrary` is a number.

- [ ] **Step 4: Implement the thin route**

```typescript
// src/app/api/admin/migrate-kb/route.ts — one-shot v1.13 backfill (delete in v1.13.1).
// CRON_SECRET-gated like /api/cron/*: Authorization: Bearer <CRON_SECRET>.
import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import path from 'path';
import { getRedisClient } from '@/lib/redis';   // use the same client accessor the repo uses
import { migrateKb } from '@/lib/kbMigrate';

export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) return NextResponse.json({ error: 'DATABASE_URL not set' }, { status: 503 });
  const { neon } = await import('@neondatabase/serverless');
  const sqlClient = neon(url);
  const sql = (text: string, params?: unknown[]) =>
    (sqlClient as unknown as { query: (t: string, p?: unknown[]) => Promise<unknown> }).query(text, params ?? []);
  const schemaSql = readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8');
  const out = await migrateKb({ redis: getRedisClient(), sql, schemaSql });
  return NextResponse.json(out);
}
```

(If `redis.ts` doesn't export a raw client accessor, add `export function getRedisClient(): RedisClientLike` returning the module's singleton client.)

- [ ] **Step 5: Run tests + typecheck, commit**

Run: `npx vitest run src/lib/kbMigrate.test.ts && npx tsc --noEmit`
Expected: PASS.

```bash
git add src/lib/kbMigrate.ts src/lib/kbMigrate.test.ts src/app/api/admin/migrate-kb src/lib/redis.ts
git commit -m "feat(v1.13): one-shot /api/admin/migrate-kb — schema apply + redis/library backfill"
```

---

### Task 8: Docs + release v1.13.0

**Files:**
- Modify: `package.json` (1.13.0), `CHANGELOG.md`, `CLAUDE.md` (storage architecture, env vars, Key Constraints), `docs` spec status note.

- [ ] **Step 1: Bump + document**

- `package.json` version → `1.13.0`.
- `CHANGELOG.md`: new `## [1.13.0]` entry — KB system of record on Neon `kb_entry` (shared with the Library); EN FTS + Thai trigram search on `/api/kb?q=`; fail-soft KB writes; Library-sync machinery deleted; one-shot `/api/admin/migrate-kb`; Redis `kb:*` retained one release as rollback.
- `CLAUDE.md`: update the Integrations/Env/Key Constraints sections — add `DATABASE_URL`, remove `LIBRARY_SYNC_URL`/`LIBRARY_SYNC_SECRET`, replace the "addressable KB in Redis" description with kb_entry/Neon, note the rollback story.

- [ ] **Step 2: Full verification**

Run: `npx vitest run && npx tsc --noEmit && npm run lint && npm run build 2>&1 | tail -3`
Expected: all green.

- [ ] **Step 3: Commit (do NOT push yet — deploy checklist below)**

```bash
git add -A
git commit -m "release: v1.13.0 — KB system of record on Neon (shared kb_entry, FTS + trigram search)"
```

---

## Deploy & verify checklist (operator-driven, after Task 8)

1. Vercel → company project → add `DATABASE_URL` (copy the value from the Library project's env). **Env applies to new builds only.**
2. `git push origin main` → wait for READY.
3. Dry-run choice: hit a Neon **branch** first if desired (set `DATABASE_URL` to the branch URL in a preview env), else go direct — the schema is additive and idempotent.
4. Run the backfill: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://company.nanoteofficial.me/api/admin/migrate-kb` → expect `{applied:true, fromRedis:~300, fromLibrary:N}`.
5. Verify: `/api/kb?limit=5` returns entries; `/api/kb?q=ThaiESG` returns ranked hits; `/api/kb?slug=<known>` resolves; `/admin` Knowledge panel lists drafts; run **Run now** on a frontend dept and confirm the new entry lands in Neon (`/api/kb` shows it) and Telegram notes publish.
6. Rollback if needed: revert the deploy — Redis `kb:*` is untouched.

Phase B (Library rewire — reader on `kb_entry`, `ref_id` state migration, sync deletion) is a separate plan, written after this phase ships.
