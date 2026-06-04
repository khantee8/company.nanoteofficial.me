# v1.4 Core — Real-Value Agents + Telegram On-Demand — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the 6 agents' thin mockup runs with real web-research deliverables — provenance-tagged artifacts built from a validated findings contract, mixed-cadence standing mandates, rich linked-KB reports with a knowledge graph, and a Telegram on-demand deep-dive (one-shot web research + 15-min threaded follow-ups).

**Architecture:** Each agent run prompts Claude with `web_search` on and asks for a markdown report PLUS a fenced ` ```json findings ` block. A pure `parse<Dept>Findings()` validates that block (drops uncited `web` figures), then the existing deterministic `<dept>Artifacts()` builders turn findings into charts tagged `provenance: 'api' | 'web'`. The runner assembles a uniform report template and writes an enriched `KbEntry` (slug/theme/sources/related) that forms a knowledge graph (series + cross-agent + tag links) behind a locked, graph-aware `/api/kb`. Telegram `/ask` becomes a real web-research deep-dive with short-lived per-chat focus sessions in Redis.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Anthropic SDK (`web_search_20260209` tool, already wired in `claude.ts`), Upstash Redis, Vitest. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-06-04-v14-real-value-agents-design.md`

---

## Conventions for the executor

- Run a single test file: `npx vitest run src/lib/agents/finance.findings.test.ts`
- Run one test by name: `npx vitest run -t "drops uncited web figure"`
- Full gate before any commit that closes a phase: `npm run lint && npx tsc --noEmit && npm test`
- Body of agent reports is **Thai**; the `## Highlight` / `## Flags` footer headers stay **English** (parser contract — do not change).
- Briefs in `.agents/*.md` ARE the spec: `roles.ts` reads them at runtime and `roles.test.ts` asserts verbatim equality, so when a task says "edit the brief," the brief file is the only place that prompt text lives.
- Commit after each task (messages shown per task). Co-author trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File Structure (what gets created / modified)

**Shared seams**
- Modify `src/lib/agents/artifacts.ts` — `Provenance`, `Citation`, `provenance`/`sources` on `Artifact`, `extractFindingsBlock()`.
- Create `src/lib/agents/findings.ts` — shared findings helpers + per-dept `Findings` types live next to each dept module instead (see per-agent tasks); `findings.ts` holds only the cross-dept `extractFindingsBlock` re-export + `requireCitation` guard.
- Modify `src/lib/agents/types.ts` — extend `KbEntry` (slug, theme, sources, provenance, related).

**KB storage + graph**
- Modify `src/lib/redis.ts` — `normalizeKbEntry` backfill, `deriveSlug`, `KbPatch` additions, `resolveRelated`, `getKbBySlug`, series/tag indexing in `listKb`.
- Modify `src/lib/kb.ts` — `getKnowledgeEntry(repo, {slug|id})` returning entry + resolved related.
- Modify `src/app/api/kb/route.ts` — `?slug=` / `?id=` single-entry path.

**Persona + runner**
- Modify `src/lib/agents/personas.ts` — findings-block contract in the footer/preamble.
- Modify `src/lib/agents/runner.ts` — report template assembly, enriched KB write, slug/theme/related computation.

**Agents**
- Modify `.agents/Finance Agent.md`, `.agents/CyberX Agent.md`, `.agents/AI R&D Agent.md`, `.agents/Marketing & Social Media Agent.md`, `.agents/Operation Agent.md`, `.agents/CEO Agent.md`.
- Modify `src/lib/agents/finance.ts`, `cyberx.ts`, `rnd.ts`, `marketing.ts`, `operations.ts`, `ceo.ts`.

**Charts**
- Modify `src/components/charts/ArtifactRenderer.tsx` — provenance badge.
- Modify `src/components/AgentDetail.tsx` — Sources section + related links.

**Telegram**
- Modify `src/lib/telegram.ts` — `parseCommand` (`/agents`, `/report`), `FocusSession` helpers.
- Modify `src/app/api/telegram/route.ts` — deep-dive `/ask`, threaded follow-ups, `/agents`, `/report`.

**Config**
- Modify `vercel.json` — mixed-cadence cron.
- Modify `package.json` (version), `CLAUDE.md` (docs).

---

# Phase 0 — Shared seams (provenance + findings contract)

### Task 1: Add provenance + citation to the Artifact model

**Files:**
- Modify: `src/lib/agents/artifacts.ts`
- Test: `src/lib/agents/artifacts.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

Create/append `src/lib/agents/artifacts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { withProvenance, type Artifact } from './artifacts';

describe('withProvenance', () => {
  it('tags an artifact api by default with no sources', () => {
    const a: Artifact = { kind: 'bars', title: 't', series: [{ label: 'x', value: 1 }] };
    const out = withProvenance(a, 'api');
    expect(out.provenance).toBe('api');
    expect(out.sources).toEqual([]);
  });

  it('attaches web provenance with sources', () => {
    const a: Artifact = { kind: 'table', title: 't', columns: ['a'], rows: [['x']] };
    const out = withProvenance(a, 'web', [{ url: 'https://e.com', title: 'Fact Sheet', date: '2026-06-01' }]);
    expect(out.provenance).toBe('web');
    expect(out.sources?.[0].url).toBe('https://e.com');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agents/artifacts.test.ts`
Expected: FAIL — `withProvenance` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/agents/artifacts.ts`, above `export type Artifact`, add:

```ts
export type Provenance = 'api' | 'web';
export interface Citation { url: string; title: string; date: string }
```

Add two optional fields to **every** member of the `Artifact` union by appending them to the shared tail. The cleanest edit: change the union so each variant is intersected with a shared `ArtifactMeta`. Replace the `export type Artifact = …` block with:

```ts
interface ArtifactMeta { provenance?: Provenance; sources?: Citation[] }

export type Artifact = ArtifactMeta & (
  | { kind: 'bars' | 'divergingBars' | 'donut'; title: string;
      series: { label: string; value: number; color?: string }[]; unit?: string }
  | { kind: 'line' | 'sparkline'; title: string;
      points: { t: string; value: number }[]; unit?: string }
  | { kind: 'table'; title: string;
      columns: string[]; rows: (string | number)[][] }
  | { kind: 'scorecard'; title: string;
      tiles: { label: string; state: 'ok' | 'warn' | 'down' }[] }
  | { kind: 'heatmap'; title: string; cells: { label: string; level: number }[] }
  | { kind: 'tags'; title: string; tags: string[] }
  | { kind: 'checklist'; title: string; items: { text: string; done: boolean }[] }
);
```

At the end of the file add the helper:

```ts
/** Stamp an artifact with its data provenance. `api` = built from a real API
 *  (deterministic, can't be hallucinated). `web` = researched, MUST carry sources. */
export function withProvenance(a: Artifact, provenance: Provenance, sources: Citation[] = []): Artifact {
  return { ...a, provenance, sources };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agents/artifacts.test.ts`
Expected: PASS

- [ ] **Step 5: Type-check (the union change touches every chart consumer)**

Run: `npx tsc --noEmit`
Expected: PASS — `ArtifactMeta &` is additive; existing artifact literals still satisfy the union.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agents/artifacts.ts src/lib/agents/artifacts.test.ts
git commit -m "feat(artifacts): add provenance + citation to Artifact model"
```

---

### Task 2: Findings extraction + citation guard

**Files:**
- Create: `src/lib/agents/findings.ts`
- Test: `src/lib/agents/findings.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/agents/findings.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractFindingsBlock, hasCitation } from './findings';

describe('extractFindingsBlock', () => {
  it('parses a fenced json findings block', () => {
    const md = 'report text\n```json findings\n{"funds":[{"name":"A"}]}\n```\nmore text';
    expect(extractFindingsBlock<{ funds: { name: string }[] }>(md)).toEqual({ funds: [{ name: 'A' }] });
  });

  it('returns null when no block present', () => {
    expect(extractFindingsBlock('just a report')).toBeNull();
  });

  it('returns null on malformed json', () => {
    expect(extractFindingsBlock('```json findings\n{not json}\n```')).toBeNull();
  });
});

describe('hasCitation', () => {
  it('true when url and date present', () => {
    expect(hasCitation({ citation: { url: 'https://e.com', title: 't', date: '2026-06-01' } })).toBe(true);
  });
  it('false when citation missing or urlless', () => {
    expect(hasCitation({})).toBe(false);
    expect(hasCitation({ citation: { url: '', title: 't', date: '2026-06-01' } })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agents/findings.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/agents/findings.ts`:

```ts
import type { Citation } from './artifacts';

/** Extract and JSON-parse the model's ```json findings block. Returns null if
 *  the block is absent or unparseable — the run still ships its narrative. */
export function extractFindingsBlock<T>(markdown: string): T | null {
  const m = markdown.match(/```json\s+findings\s*\n([\s\S]*?)\n```/i);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as T;
  } catch {
    return null;
  }
}

/** A web-sourced figure is only trustworthy if it carries a real citation. */
export function hasCitation(x: { citation?: Partial<Citation> }): boolean {
  return !!x.citation?.url && !!x.citation?.date;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agents/findings.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/findings.ts src/lib/agents/findings.test.ts
git commit -m "feat(agents): findings block extractor + citation guard"
```

---

# Phase 1 — KB entry v2 + knowledge graph

### Task 3: Extend the KbEntry type

**Files:**
- Modify: `src/lib/agents/types.ts:62-76`

- [ ] **Step 1: Add fields to `KbEntry`**

In `src/lib/agents/types.ts`, extend the `KbEntry` interface (add the 5 fields; keep all existing ones):

```ts
export interface KbEntry {
  id: string;
  slug: string;            // NEW — stable URL slug, e.g. "fin-us-index-sp500-2026-06-04"
  dept: DeptId;
  date: string;
  ts: string;
  category: KbCategory;
  theme?: string;          // NEW — drives the series chain
  tags: string[];
  status: 'draft' | 'published' | 'archived';
  pinned?: boolean;
  summary: string;
  highlight: string;
  flags: string[];
  artifacts: Artifact[];
  sources: Citation[];     // NEW — citations behind the report
  provenance: 'api' | 'web'; // NEW — dominant data source for the entry
  related: string[];       // NEW — linked entry ids (series + cross + tag)
  markdown: string;
}
```

Add `Citation` to the import from `./artifacts`:

```ts
import type { Artifact, KbCategory, Citation } from './artifacts';
export type { Artifact, KbCategory, Citation };
```

- [ ] **Step 2: Type-check (expect failures to fix in next tasks)**

Run: `npx tsc --noEmit`
Expected: FAIL in `redis.ts` (`normalizeKbEntry`) and `runner.ts` (`pushKb`) — they don't supply the new required fields. These are fixed in Tasks 4 and 8. Do not commit yet; proceed to Task 4.

---

### Task 4: normalizeKbEntry backfill + slug derivation

**Files:**
- Modify: `src/lib/redis.ts:34-50` (normalizeKbEntry), `:31` (KbPatch)
- Test: `src/lib/redis.kb.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/redis.kb.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeKbEntry, deriveSlug } from './redis';

describe('deriveSlug', () => {
  it('builds dept-theme-date slug', () => {
    expect(deriveSlug({ dept: 'fin', theme: 'US Index / S&P500', date: '2026-06-04' }))
      .toBe('fin-us-index-s-p500-2026-06-04');
  });
  it('falls back to category when no theme', () => {
    expect(deriveSlug({ dept: 'cyb', date: '2026-06-04', category: 'threat-intel' }))
      .toBe('cyb-threat-intel-2026-06-04');
  });
});

describe('normalizeKbEntry v2 backfill', () => {
  it('backfills new fields on a pre-v1.4 entry', () => {
    const e = normalizeKbEntry({ dept: 'fin', ts: '2026-05-01T10:00:00Z' });
    expect(e.provenance).toBe('api');   // legacy = api/deterministic
    expect(e.related).toEqual([]);
    expect(e.sources).toEqual([]);
    expect(e.slug).toBe('fin-market-brief-2026-05-01');
    expect(e.status).toBe('published'); // unchanged legacy default
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/redis.kb.test.ts`
Expected: FAIL — `deriveSlug` not exported; new fields missing.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/redis.ts`, add `deriveSlug` above `normalizeKbEntry`:

```ts
const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Stable public slug for an entry: <dept>-<theme|category>-<date>. */
export function deriveSlug(e: { dept: DeptId; date?: string; ts?: string; theme?: string; category?: KbEntry['category'] }): string {
  const date = e.date ?? (e.ts ? e.ts.slice(0, 10) : '');
  const mid = e.theme ? slugify(e.theme) : (e.category ?? CATEGORY_BY_DEPT[e.dept]);
  return `${e.dept}-${mid}-${date}`;
}
```

Update `normalizeKbEntry` to fill the new fields (keep existing lines, add the 5 new ones):

```ts
export function normalizeKbEntry(raw: Partial<KbEntry> & { dept: DeptId; ts: string }): KbEntry {
  const date = raw.date ?? raw.ts.slice(0, 10);
  const category = raw.category ?? CATEGORY_BY_DEPT[raw.dept];
  return {
    id: raw.id ?? `${raw.dept}:${raw.ts}`,
    slug: raw.slug ?? deriveSlug({ dept: raw.dept, date, theme: raw.theme, category }),
    dept: raw.dept,
    date,
    ts: raw.ts,
    category,
    theme: raw.theme,
    tags: raw.tags ?? [],
    status: raw.status ?? 'published',
    pinned: raw.pinned,
    summary: raw.summary ?? '',
    highlight: raw.highlight ?? '',
    flags: raw.flags ?? [],
    artifacts: raw.artifacts ?? [],
    sources: raw.sources ?? [],
    provenance: raw.provenance ?? 'api',
    related: raw.related ?? [],
    markdown: raw.markdown ?? '',
  };
}
```

Extend `KbPatch` (line 31) so the Admin KB Manager can edit `theme`/`pinned` etc. (additive — `related`/`slug` stay system-computed):

```ts
export type KbPatch = Partial<Pick<KbEntry, 'status' | 'tags' | 'pinned' | 'category' | 'theme'>>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/redis.kb.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/types.ts src/lib/redis.ts src/lib/redis.kb.test.ts
git commit -m "feat(kb): KbEntry v2 fields + slug derivation + backfill"
```

---

### Task 5: Knowledge-graph resolution (series + cross + tag) and slug lookup

**Files:**
- Modify: `src/lib/redis.ts` (add `getKbBySlug`, `resolveRelated` to the repo)
- Test: `src/lib/redis.graph.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/redis.graph.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { makeRedisRepo, type RedisClientLike } from './redis';
import type { KbEntry } from './agents/types';

// minimal in-memory client (mirrors dashboard.test.ts style)
function memClient(): RedisClientLike {
  const kv = new Map<string, unknown>();
  const lists = new Map<string, unknown[]>();
  return {
    async set(k, v) { kv.set(k, v); return 'OK'; },
    async get(k) { return (kv.get(k) ?? null) as never; },
    async del(...ks) { ks.forEach((k) => kv.delete(k)); return ks.length; },
    async mget(ks) { return ks.map((k) => (kv.get(k) ?? null)) as never; },
    async lpush(k, v) { const l = lists.get(k) ?? []; l.unshift(v); lists.set(k, l); return l.length; },
    async lrem(k, _c, v) { const l = lists.get(k) ?? []; lists.set(k, l.filter((x) => x !== v)); return 1; },
    async ltrim() { return 'OK'; },
    async lrange(k, s, e) { const l = (lists.get(k) ?? []) as never[]; return l.slice(s, e === -1 ? undefined : e + 1); },
  };
}

const entry = (over: Partial<KbEntry> & { dept: KbEntry['dept']; ts: string }): KbEntry => ({
  id: over.id ?? `${over.dept}:${over.ts}`, slug: '', dept: over.dept, date: over.ts.slice(0, 10),
  ts: over.ts, category: 'market-brief', tags: [], status: 'published', summary: '', highlight: '',
  flags: [], artifacts: [], sources: [], provenance: 'api', related: [], markdown: '', ...over,
});

describe('knowledge graph', () => {
  it('getKbBySlug finds a published entry and resolves series + tag neighbours', async () => {
    const repo = makeRedisRepo(memClient());
    await repo.pushKb(entry({ id: 'fin:1', slug: 'fin-sp500-2026-06-01', dept: 'fin', ts: '2026-06-01T10:00:00Z', theme: 'sp500', tags: ['us', 'index'] }));
    await repo.pushKb(entry({ id: 'fin:2', slug: 'fin-sp500-2026-06-04', dept: 'fin', ts: '2026-06-04T10:00:00Z', theme: 'sp500', tags: ['us', 'index'] }));
    await repo.pushKb(entry({ id: 'rnd:1', slug: 'rnd-2026-06-03', dept: 'rnd', ts: '2026-06-03T10:00:00Z', tags: ['index'] }));

    const res = await repo.getKbBySlug('fin-sp500-2026-06-04');
    expect(res?.entry.id).toBe('fin:2');
    const ids = res!.related.map((r) => r.id).sort();
    expect(ids).toContain('fin:1'); // same dept+theme = series
    expect(ids).toContain('rnd:1'); // shared tag "index"
  });

  it('returns null for a draft slug (published-only)', async () => {
    const repo = makeRedisRepo(memClient());
    await repo.pushKb(entry({ id: 'fin:9', slug: 'fin-x-2026-06-04', dept: 'fin', ts: '2026-06-04T10:00:00Z', status: 'draft' }));
    expect(await repo.getKbBySlug('fin-x-2026-06-04')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/redis.graph.test.ts`
Expected: FAIL — `getKbBySlug` not defined.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/redis.ts`, inside `makeRedisRepo`'s returned object (after `listKb`), add:

```ts
    /** Find a PUBLISHED entry by slug, with its graph neighbours resolved.
     *  Related = same dept+theme (series) ∪ shared-tag ∪ explicit entry.related. */
    async getKbBySlug(slug: string): Promise<{ entry: KbEntry; related: KbEntry[] } | null> {
      const all = (await this.listKb({})).filter((e) => e.status === 'published');
      const entry = all.find((e) => e.slug === slug);
      if (!entry) return null;
      const relatedIds = new Set(entry.related);
      const related = all.filter((e) => {
        if (e.id === entry.id) return false;
        if (relatedIds.has(e.id)) return true;
        if (entry.theme && e.dept === entry.dept && e.theme === entry.theme) return true; // series
        if (e.tags.some((t) => entry.tags.includes(t))) return true;                       // tag graph
        return false;
      }).slice(0, 12);
      return { entry, related };
    },
```

Note: `this` inside the object literal resolves correctly because `makeRedisRepo` returns a plain object whose methods call sibling methods via `this`. If the existing code does not use `this` elsewhere, use a local `const repo = { … }` pattern: define the object in a `const repo`, then `return repo;`, and call `repo.listKb` instead of `this.listKb`. Verify which form compiles and keep it consistent.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/redis.graph.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/redis.ts src/lib/redis.graph.test.ts
git commit -m "feat(kb): knowledge-graph slug lookup with series/tag/explicit related"
```

---

### Task 6: Public `/api/kb` single-entry path

**Files:**
- Modify: `src/lib/kb.ts`, `src/app/api/kb/route.ts`
- Test: `src/lib/kb.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test**

Append to `src/lib/kb.test.ts` a case for `getKnowledgeEntry` (mirror the existing repo-stub style in that file):

```ts
import { getKnowledgeEntry } from './kb';

it('getKnowledgeEntry returns entry + related for a slug', async () => {
  // build a repo stub exposing getKbBySlug returning { entry, related }
  const stub = { getKbBySlug: async (slug: string) =>
    slug === 's1' ? { entry: { id: 'fin:1', slug: 's1' }, related: [{ id: 'fin:0' }] } : null } as never;
  const res = await getKnowledgeEntry(stub, { slug: 's1' });
  expect(res?.entry.id).toBe('fin:1');
  expect(res?.related[0].id).toBe('fin:0');
  expect(await getKnowledgeEntry(stub, { slug: 'missing' })).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/kb.test.ts`
Expected: FAIL — `getKnowledgeEntry` not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/kb.ts` add:

```ts
/** Single published entry by slug (or id), with graph neighbours resolved.
 *  Powers /api/kb?slug=… for kb.nanoteofficial.me. */
export async function getKnowledgeEntry(
  repo: RedisRepo,
  q: { slug?: string; id?: string },
): Promise<{ entry: KbEntry; related: KbEntry[] } | null> {
  if (q.slug) return repo.getKbBySlug(q.slug);
  if (q.id) {
    const e = await repo.getKbEntry(q.id);
    if (!e || e.status !== 'published') return null;
    return repo.getKbBySlug(e.slug);
  }
  return null;
}
```

In `src/app/api/kb/route.ts`, before the existing list logic, branch on `slug`/`id` (read the file first; add):

```ts
  const slug = searchParams.get('slug') ?? undefined;
  const id = searchParams.get('id') ?? undefined;
  if (slug || id) {
    const hit = await getKnowledgeEntry(getRepo(), { slug, id });
    if (!hit) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json(hit);
  }
```

Add `getKnowledgeEntry` to the import from `@/lib/kb`.

- [ ] **Step 4: Run tests + type-check**

Run: `npx vitest run src/lib/kb.test.ts && npx tsc --noEmit`
Expected: PASS (tsc may still flag `runner.ts` — fixed in Task 8.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/kb.ts src/app/api/kb/route.ts src/lib/kb.test.ts
git commit -m "feat(api/kb): published single-entry ?slug=/?id= with related graph"
```

---

# Phase 2 — Persona findings contract + runner report assembly

### Task 7: personas.ts findings-block contract

**Files:**
- Modify: `src/lib/agents/personas.ts:24-37` (OUTPUT_FOOTER)
- Test: `src/lib/agents/personas.test.ts` (extend existing)

- [ ] **Step 1: Write the failing test**

Append to `src/lib/agents/personas.test.ts`:

```ts
it('every persona instructs emitting a json findings block before the footer', () => {
  for (const p of Object.values(PERSONAS)) {
    expect(p).toMatch(/```json findings/);
    // findings block must be described BEFORE the mandatory Highlight/Flags footer
    expect(p.indexOf('```json findings')).toBeLessThan(p.indexOf('## Highlight'));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agents/personas.test.ts`
Expected: FAIL — no findings instruction yet.

- [ ] **Step 3: Write minimal implementation**

In `src/lib/agents/personas.ts`, insert a findings contract block into `OUTPUT_FOOTER`, **before** the `## Highlight` section (so it sits between the narrative and the footer). Add immediately after the contract preamble paragraph and before `## Highlight`:

```ts
const FINDINGS_CONTRACT = `

ก่อนถึงสองหัวข้อปิดท้าย ให้แนบ "ข้อมูลที่ใช้สร้างกราฟ" เป็นบล็อกโค้ด JSON หนึ่งบล็อก ใช้รั้วโค้ดหัวว่า \`\`\`json findings (ตามด้วยตัวพิมพ์เล็ก findings):
- ใส่เฉพาะตัวเลข/รายการที่ "ค้นเจอจริง" ในรอบนี้เท่านั้น
- ทุกตัวเลขที่มาจากการค้นเว็บ ต้องมีฟิลด์ citation: { "url": "...", "title": "...", "date": "YYYY-MM-DD" } กำกับ ถ้าไม่มีแหล่งอ้างอิงห้ามใส่
- ถ้ารอบนี้ไม่มีข้อมูลที่ชาร์ตได้จริง ให้ใส่บล็อกว่าง \`\`\`json findings\\n{}\\n\`\`\`
- โครงสร้างภายในบล็อกให้เป็นไปตามที่บทบาทของคุณกำหนด`;
```

Then change the footer composition so it reads `…narrative… + FINDINGS_CONTRACT + Highlight/Flags`. Concretely, prepend `FINDINGS_CONTRACT` to the existing `OUTPUT_FOOTER` string content right after the `---` rule and before the "MANDATORY OUTPUT CONTRACT" paragraph. Keep the English `## Highlight` / `## Flags` headers exactly as-is.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agents/personas.test.ts`
Expected: PASS (existing footer-contract assertions still pass — headers unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/personas.ts src/lib/agents/personas.test.ts
git commit -m "feat(personas): mandatory json findings block contract"
```

---

### Task 8: Runner — report template + enriched KB write

**Files:**
- Modify: `src/lib/agents/runner.ts:109-146` (runAgent) + add helpers
- Modify: `src/lib/agents/types.ts` `AgentRunResult` (add `theme?`, `sources?`, `provenance?`, `related?`)
- Test: `src/lib/agents/runner.test.ts` (extend existing) or create `runner.kb.test.ts`

- [ ] **Step 1: Extend `AgentRunResult`**

In `src/lib/agents/types.ts`, add to `AgentRunResult`:

```ts
  /** Series key for KB graph (e.g. "us-index-sp500"). */
  theme?: string;
  /** Citations behind the report's web-sourced figures. */
  sources?: Citation[];
  /** Dominant data source for this run. */
  provenance?: 'api' | 'web';
  /** Explicit cross-links (CEO synthesis → source entry ids). */
  related?: string[];
```

(Import `Citation` is already re-exported in this file from Task 3.)

- [ ] **Step 2: Write the failing test**

Create `src/lib/agents/runner.kb.test.ts` with an in-memory repo (reuse the `memClient` pattern from Task 5; or import a shared test helper if one exists). Assert that `runAgent` writes a KB entry carrying `slug`, `theme`, `provenance`, `sources`, and `related`:

```ts
import { describe, it, expect } from 'vitest';
import { makeRedisRepo } from '@/lib/redis';
import { runAgent } from './runner';
// memClient: copy from redis.graph.test.ts (or factor into a tiny test helper)

describe('runAgent enriched KB write', () => {
  it('persists slug/theme/provenance/sources on the kb entry', async () => {
    const repo = makeRedisRepo(/* memClient() */ undefined as never);
    const captured: any[] = [];
    const origPush = repo.pushKb.bind(repo);
    repo.pushKb = async (e) => { captured.push(e); return origPush(e); };

    await runAgent(
      { dept: 'fin', run: async () => ({
          markdown: '# r\n## Highlight\nx\n## Flags\nNone.',
          summary: 's', feedMsg: 'f',
          theme: 'us-index-sp500', provenance: 'web',
          sources: [{ url: 'https://e.com', title: 't', date: '2026-06-04' }],
          artifacts: [], tags: ['us'],
        }) },
      { repo, notify: async () => {} },
    );

    const e = captured[0];
    expect(e.theme).toBe('us-index-sp500');
    expect(e.provenance).toBe('web');
    expect(e.slug).toMatch(/^fin-us-index-sp500-/);
    expect(e.sources[0].url).toBe('https://e.com');
    expect(e.status).toBe('draft'); // draft→publish gate unchanged
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/agents/runner.kb.test.ts`
Expected: FAIL — `pushKb` receives an entry without `slug`/`theme`/`sources`/`provenance`.

- [ ] **Step 4: Write minimal implementation**

In `runner.ts`, import `deriveSlug`:

```ts
import { deriveSlug } from '@/lib/redis';
```

In `runAgent`, replace the `pushKb({ … })` call (line ~135) and add slug/fields from the result. After computing `id`, add:

```ts
    const theme = result.theme;
    const provenance = result.provenance ?? 'api';
    const sources = result.sources ?? [];
    const related = result.related ?? [];
    const slug = deriveSlug({ dept, date, theme, category });
```

and change the KB write to:

```ts
      repo.pushKb({
        id, slug, dept, date, ts, category, theme,
        tags, status: 'draft', summary: result.summary, highlight, flags,
        artifacts, sources, provenance, related, markdown: result.markdown,
      }),
```

- [ ] **Step 5: Run tests + type-check**

Run: `npx vitest run src/lib/agents/runner.kb.test.ts && npx tsc --noEmit`
Expected: PASS — all earlier tsc errors from Task 3 now resolved.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agents/types.ts src/lib/agents/runner.ts src/lib/agents/runner.kb.test.ts
git commit -m "feat(runner): enriched KB write (slug/theme/sources/provenance/related)"
```

---

# Phase 3 — Per-agent rewire (real web research)

> Each agent task follows the same shape: (a) edit the `.agents/*.md` brief to define the standing mandate + the dept's `findings` JSON schema; (b) write a pure `parse<Dept>Findings()` validator with tests; (c) rewrite `<dept>Artifacts()` to build from validated findings with `withProvenance`; (d) rewire `run()` to call `complete({ webSearch: true })` and return `{ theme, provenance, sources }`. **Finance (Task 9) is the full worked example — read it before the others.**

### Task 9: Finance — Thai mutual-fund comparison (exemplar)

**Files:**
- Modify: `.agents/Finance Agent.md`
- Modify: `src/lib/agents/finance.ts`
- Test: `src/lib/agents/finance.findings.test.ts` (create), `src/lib/agents/finance.artifacts.test.ts` (rewrite)

- [ ] **Step 1: Edit the brief** — `.agents/Finance Agent.md`

Add a "ภารกิจประจำรอบ (autonomous)" section and a findings-schema section. Append before `## ขั้นตอนสุดท้าย`:

```markdown
## ภารกิจประจำรอบ (โหมดอัตโนมัติ)
รอบอัตโนมัติให้เลือก "ธีมประจำวัน" ตามวันในสัปดาห์ แล้วทำการเปรียบเทียบกองทุนจริงในธีมนั้น:
- จันทร์ → กองดัชนีสหรัฐ / S&P500 (theme: us-index-sp500)
- พุธ → เทคโนโลยีโลก / เซมิคอนดักเตอร์ (theme: global-tech-semiconductor)
- ศุกร์ → กองลดหย่อนภาษี SSF/RMF/Thai ESG (theme: thai-tax-funds)
ค้นข้อมูลจริงจาก Finnomena / WealthMagik / Morningstar / เว็บ บลจ. และอ้างอิงแหล่ง+วันที่ทุกครั้ง
ห้ามใช้ข้อมูลคริปโต (BTC/ETH/SOL) — ถูกถอดออกจากขอบเขตของรอบอัตโนมัติแล้ว

## โครงสร้าง findings (สำหรับบล็อก ```json findings)
{
  "theme": "<us-index-sp500|global-tech-semiconductor|thai-tax-funds>",
  "funds": [
    { "name": "ชื่อกองเต็ม", "amc": "บลจ.", "ter": <number %>, "aum": <number ล้านบาท>,
      "masterFund": "กองแม่/underlying", "return1y": <number %>, "hedged": <true|false>,
      "taxType": "<none|ssf|rmf|thaiesg>",
      "citation": { "url": "...", "title": "...", "date": "YYYY-MM-DD" } }
  ]
}
```

(Removing the crypto behaviour is via the new autonomous mission section; the rest of the interactive brief stays as the on-demand `/ask` workflow.)

- [ ] **Step 2: Write the failing findings test** — `src/lib/agents/finance.findings.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { parseFinanceFindings } from './finance';

const cite = { url: 'https://e.com', title: 'Fact Sheet', date: '2026-06-01' };

describe('parseFinanceFindings', () => {
  it('keeps funds with a valid citation', () => {
    const md = '```json findings\n' + JSON.stringify({ theme: 'us-index-sp500', funds: [
      { name: 'A', amc: 'X', ter: 0.3, aum: 1000, masterFund: 'M', return1y: 18, hedged: false, taxType: 'none', citation: cite },
    ] }) + '\n```';
    const f = parseFinanceFindings(md);
    expect(f?.theme).toBe('us-index-sp500');
    expect(f?.funds).toHaveLength(1);
  });

  it('drops a fund missing its citation', () => {
    const md = '```json findings\n' + JSON.stringify({ theme: 'x', funds: [
      { name: 'B', amc: 'Y', ter: 1, aum: 1, masterFund: 'M', return1y: 1, hedged: false, taxType: 'none' },
    ] }) + '\n```';
    expect(parseFinanceFindings(md)?.funds).toHaveLength(0);
  });

  it('returns null when no findings block', () => {
    expect(parseFinanceFindings('no block here')).toBeNull();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/agents/finance.findings.test.ts`
Expected: FAIL — `parseFinanceFindings` not exported.

- [ ] **Step 4: Rewrite `finance.ts`**

Replace the file body. Remove CoinGecko usage; add findings types, validator, artifact builder, and a web-search run:

```ts
import { complete } from '@/lib/claude';
import { PERSONAS } from './personas';
import { formatContext } from './runner';
import { extractFindingsBlock, hasCitation } from './findings';
import { normalizeTags, withProvenance, type Artifact, type Citation } from './artifacts';
import type { AgentRunResult, AgentContext } from './types';

export interface FundFinding {
  name: string; amc: string; ter: number; aum: number; masterFund: string;
  return1y: number; hedged: boolean; taxType: 'none' | 'ssf' | 'rmf' | 'thaiesg';
  citation: Citation;
}
export interface FinanceFindings { theme: string; funds: FundFinding[] }

const THEME_BY_DOW: Record<number, { theme: string; label: string }> = {
  1: { theme: 'us-index-sp500', label: 'กองดัชนีสหรัฐ / S&P500' },
  3: { theme: 'global-tech-semiconductor', label: 'เทคโนโลยีโลก / เซมิคอนดักเตอร์' },
  5: { theme: 'thai-tax-funds', label: 'กองลดหย่อนภาษี SSF/RMF/Thai ESG' },
};
export function themeForToday(d = new Date()): { theme: string; label: string } {
  return THEME_BY_DOW[d.getUTCDay()] ?? THEME_BY_DOW[1];
}

/** Validate the model's findings block; drop any fund without a real citation. */
export function parseFinanceFindings(markdown: string): FinanceFindings | null {
  const raw = extractFindingsBlock<Partial<FinanceFindings>>(markdown);
  if (!raw || !Array.isArray(raw.funds)) return raw ? { theme: String(raw.theme ?? ''), funds: [] } : null;
  const funds = raw.funds.filter(
    (f): f is FundFinding => !!f && typeof f.name === 'string' && hasCitation(f as { citation?: Partial<Citation> }),
  );
  return { theme: String(raw.theme ?? ''), funds };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Charts built from validated findings, tagged web·cited. */
export function financeArtifacts(f: FinanceFindings): Artifact[] {
  if (f.funds.length === 0) return [];
  const sources = f.funds.map((x) => x.citation);
  return [
    withProvenance({
      kind: 'bars', title: 'ค่าธรรมเนียมรวม (TER %)', unit: '%',
      series: f.funds.map((x) => ({ label: x.name, value: round2(x.ter) })),
    }, 'web', sources),
    withProvenance({
      kind: 'divergingBars', title: 'ผลตอบแทนย้อนหลัง 1 ปี (%)', unit: '%',
      series: f.funds.map((x) => ({ label: x.name, value: round2(x.return1y) })),
    }, 'web', sources),
    withProvenance({
      kind: 'table', title: 'เปรียบเทียบกองทุน',
      columns: ['กอง', 'บลจ.', 'TER%', 'AUM(ลบ.)', 'กองแม่', 'ป้องกันค่าเงิน', '1Y%'],
      rows: f.funds.map((x) => [x.name, x.amc, round2(x.ter), x.aum, x.masterFund, x.hedged ? 'hedged' : 'unhedged', round2(x.return1y)]),
    }, 'web', sources),
  ];
}

export function financeTags(f: FinanceFindings): string[] {
  return normalizeTags([f.theme, ...f.funds.map((x) => x.amc)]);
}

export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const { theme, label } = themeForToday();
  const context = formatContext(ctx);
  const markdown = await complete({
    system: PERSONAS.fin,
    prompt: `${context ? context + '\n\n---\n\n' : ''}ธีมประจำรอบวันนี้: **${label}** (theme: ${theme}).\nค้นหาและเปรียบเทียบกองทุนรวมไทยจริง 3-5 กองในธีมนี้ พร้อมค่าธรรมเนียม กองแม่ AUM และผลตอบแทน อ้างอิงแหล่ง+วันที่ทุกตัวเลข แล้วแนบบล็อก \`\`\`json findings ตามสคีมา`,
    webSearch: true,
    maxSearches: 6,
    maxTokens: 2200,
  });
  const findings = parseFinanceFindings(markdown) ?? { theme, funds: [] };
  const artifacts = financeArtifacts(findings);
  const sources = findings.funds.map((x) => x.citation);
  return {
    markdown,
    summary: `${findings.funds.length} กองในธีม ${label}`,
    feedMsg: `finance: ${label} — ${findings.funds.length} funds`,
    artifacts, tags: financeTags(findings),
    theme, provenance: 'web', sources,
    meta: { theme, fundCount: findings.funds.length },
  };
}
```

- [ ] **Step 5: Rewrite `finance.artifacts.test.ts`**

Replace the CoinGecko-based tests with findings-based ones:

```ts
import { describe, it, expect } from 'vitest';
import { financeArtifacts, type FinanceFindings } from './finance';

const f: FinanceFindings = { theme: 'us-index-sp500', funds: [
  { name: 'A', amc: 'X', ter: 0.3, aum: 1000, masterFund: 'iShares', return1y: 18.2, hedged: false, taxType: 'none', citation: { url: 'https://e.com', title: 't', date: '2026-06-01' } },
]};

describe('financeArtifacts', () => {
  it('builds web·cited charts from findings', () => {
    const a = financeArtifacts(f);
    expect(a).toHaveLength(3);
    expect(a.every((x) => x.provenance === 'web')).toBe(true);
    expect(a[0].sources?.[0].url).toBe('https://e.com');
  });
  it('returns no artifacts when no funds (graceful empty)', () => {
    expect(financeArtifacts({ theme: 't', funds: [] })).toEqual([]);
  });
});
```

- [ ] **Step 6: Run tests + type-check**

Run: `npx vitest run src/lib/agents/finance.findings.test.ts src/lib/agents/finance.artifacts.test.ts && npx tsc --noEmit`
Expected: PASS. (`coingecko.ts` stays in the repo, now unimported by finance — `npm run lint` may warn unused; leave the file, it's intentionally retained per spec.)

- [ ] **Step 7: Verify roles test still passes (brief edited)**

Run: `npx vitest run src/lib/agents/roles.test.ts`
Expected: PASS — `roles.ts` reads the edited `.md` verbatim; the test compares file↔ROLES, so editing the file keeps them equal.

- [ ] **Step 8: Commit**

```bash
git add ".agents/Finance Agent.md" src/lib/agents/finance.ts src/lib/agents/finance.findings.test.ts src/lib/agents/finance.artifacts.test.ts
git commit -m "feat(finance): real Thai fund comparison via web research + findings"
```

---

### Task 10: CyberX — real CVE/threat brief

**Files:** `.agents/CyberX Agent.md`, `src/lib/agents/cyberx.ts`, `src/lib/agents/cyberx.findings.test.ts` (create), `cyberx.artifacts.test.ts` (extend)

Follow Task 9's shape. Specifics:

- [ ] **Brief edit:** add an autonomous daily mandate ("CVEs/ภัยคุกคามจริงใน 24-48 ชม.ที่เกี่ยวกับสแตก: Next.js/Vercel/Node/Redis/Auth0") and findings schema:

```jsonc
{ "items": [ { "cve": "CVE-2026-XXXX", "severity": "critical|high|medium|low",
  "kev": true, "summary": "...", "mitigation": "...",
  "citation": { "url": "...", "title": "...", "date": "YYYY-MM-DD" } } ] }
```

- [ ] **`parseCyberxFindings`** (test: keeps items with `cve` + citation; drops uncited; null when absent). CISA KEV data stays `api`-sourced (keep existing `threatintel.ts` fetch) — KEV-derived chart artifacts use `withProvenance(a, 'api')`; web-researched advisories use `'web'` with citations.
- [ ] **`cyberxArtifacts`:** keep the existing severity-donut/KEV-table built from the CISA KEV API (provenance `api`), add a `table` of researched advisories (provenance `web`, sources = item citations).
- [ ] **`run()`:** `complete({ webSearch: true, maxSearches: 5 })`, prompt asks for the daily threat brief + findings block; merge KEV API data (deterministic) with validated web findings; return `provenance: 'web'` if any web items else `'api'`, `sources` = all item citations. No theme (daily; `theme` undefined → slug falls back to category+date).
- [ ] **Commit:** `feat(cyberx): real daily threat brief (KEV api + cited web advisories)`

---

### Task 11: AI R&D — adoption radar

**Files:** `.agents/AI R&D Agent.md`, `src/lib/agents/rnd.ts`, `rnd.findings.test.ts` (create), `rnd.artifacts.test.ts` (extend)

- [ ] **Brief edit:** rotating focus Tue/Thu (`theme: agents` Tue, `theme: llm-infra` Thu) + findings schema:

```jsonc
{ "theme": "agents|llm-infra", "items": [ { "name": "repo/paper/release", "kind": "repo|paper|release",
  "why": "ทำไมน่าสนใจ/ควรรับมาใช้", "lang": "TypeScript", "stars": 1234,
  "citation": { "url": "...", "title": "...", "date": "YYYY-MM-DD" } } ] }
```

- [ ] **`parseRndFindings`** (keep items with name + citation). GitHub-trending data stays `api` via existing `githubTrending.ts`; web-found papers/releases are `web`+cited.
- [ ] **`rndArtifacts`:** keep the language donut + radar table from `githubTrending` (provenance `api`); add a `table` of researched items (provenance `web`).
- [ ] **`run()`:** `webSearch: true, maxSearches: 5`, theme from day-of-week, return `theme`, `provenance: 'web'`, `sources`.
- [ ] **Commit:** `feat(rnd): adoption radar from real trending repos + cited research`

---

### Task 12: Marketing — demand-driven content plan

**Files:** `.agents/Marketing & Social Media Agent.md`, `src/lib/agents/marketing.ts`, `marketing.findings.test.ts` (create), `marketing.artifacts.test.ts` (extend)

- [ ] **Brief edit:** Mon/Thu mandate (`theme: dev-demand`): "อ่านสัญญาณดีมานด์จริงจาก HN/Dev.to แล้วเสนอแผนคอนเทนต์/โซเชียลที่ผูกกับสิ่งที่กำลังเทรนด์" + findings schema:

```jsonc
{ "theme": "dev-demand", "signals": [ { "topic": "...", "source": "hackernews|devto|web",
  "score": 123, "citation": { "url": "...", "title": "...", "date": "YYYY-MM-DD" } } ],
  "plan": [ { "channel": "blog|x|linkedin", "idea": "...", "tiedTo": "topic" } ] }
```

- [ ] **`parseMarketingFindings`** (keep signals with citation; `plan` items pass through, they're internal recommendations not data). HN/Dev.to/Analytics keep `api`; web signals are `web`+cited.
- [ ] **`marketingArtifacts`:** keep existing demand/reach charts (provenance `api` from HN/Dev.to/Analytics); add a `checklist` artifact for the content plan (no citation needed — it's a plan, provenance `api`/internal) and a `table` of researched signals (provenance `web`).
- [ ] **`run()`:** `webSearch: true, maxSearches: 4`, return `theme: 'dev-demand'`, `provenance: 'web'`, `sources`.
- [ ] **Commit:** `feat(marketing): demand-driven content plan from real signals`

---

### Task 13: Operations — deploy/CI health (mostly API)

**Files:** `.agents/Operation Agent.md`, `src/lib/agents/operations.ts`, `operations.findings.test.ts` (create), `operations.artifacts.test.ts` (extend)

- [ ] **Brief edit:** daily mandate "สรุปสุขภาพ deploy/CI จริงจาก Vercel + GitHub แล้วชี้ 'สิ่งเดียวที่ควรแก้วันนี้'". Findings schema is thin (Ops is API-first, minimal web):

```jsonc
{ "fixToday": "ข้อความสั้นๆ", "notes": [ { "text": "...", "citation": { "url": "...", "title": "...", "date": "YYYY-MM-DD" } } ] }
```

- [ ] **`parseOperationsFindings`** (keep notes with citation; `fixToday` is a string passthrough). Scorecard/repo-activity stay `api` from `vercelApi.ts`/`githubApi.ts`.
- [ ] **`operationsArtifacts`:** keep existing scorecard + activity table, all `withProvenance(a, 'api')`. Add researched `notes` only if any (provenance `web`).
- [ ] **`run()`:** `webSearch: true, maxSearches: 3` (low — mostly internal), `provenance: 'api'` unless web notes exist, no theme.
- [ ] **Commit:** `feat(operations): real deploy-health scorecard + fix-today`

---

### Task 14: CEO — weekly synthesis with cross-links

**Files:** `.agents/CEO Agent.md`, `src/lib/agents/ceo.ts`, `ceo.findings.test.ts` (create), `ceo.artifacts.test.ts` (extend)

CEO aggregates the week's entries — no external research. Key difference: it computes `related` = the source entry ids it synthesised.

- [ ] **Brief edit:** weekly mandate "สังเคราะห์ผลงานทั้งสัปดาห์ของ 6 แผนกเป็นบทสรุปผู้บริหาร: การตัดสินใจ ความเสี่ยง ลำดับความสำคัญ อ้างถึงรายงานต้นทาง". Findings schema:

```jsonc
{ "decisions": ["..."], "risks": ["..."], "priorities": ["..."] }
```

- [ ] **`buildContext` already gives CEO `companySnapshot`.** Extend the CEO run to also read recent KB entry ids for `related`. In `ceo.ts`, after producing markdown, collect the most recent published/draft entry id per other dept from `ctx.companySnapshot` digest or via a new `relatedIds` passed through context. Simplest: in `runner.buildContext`, when `dept === 'ceo'`, also fetch `repo.listKb({ limit: 12 })` and attach ids to `companySnapshot.relatedEntryIds`. Add that field to `AgentContext.companySnapshot`.
- [ ] **Test `parseCeoFindings`** (decisions/risks/priorities arrays; tolerant of missing keys → empty arrays; null when no block).
- [ ] **`ceoArtifacts`:** keep the Executive Cockpit scorecard/heatmap (provenance `api` — built from internal company state), add a `checklist` of decisions/priorities.
- [ ] **`run()`:** no `webSearch` (internal synthesis), return `provenance: 'api'`, `related: relatedEntryIds`, `theme: 'weekly-synthesis'`.
- [ ] **Commit:** `feat(ceo): weekly synthesis with cross-links to source entries`

---

### Task 15: Provenance badge + Sources in the UI

**Files:** `src/components/charts/ArtifactRenderer.tsx`, `src/components/AgentDetail.tsx`

No unit tests (visual). Verify with dev server + screenshot.

- [ ] **Step 1: Badge in ArtifactRenderer**

Read `ArtifactRenderer.tsx`. In the card wrapper around each chart, render a small badge from `artifact.provenance`:

```tsx
{artifact.provenance && (
  <span className={`prov-badge prov-${artifact.provenance}`}>
    {artifact.provenance === 'api' ? 'api' : 'web · cited'}
  </span>
)}
```

Add minimal Tailwind classes (e.g. `text-[10px] uppercase tracking-wide rounded px-1.5 py-0.5`; `api` neutral, `web` accent). Keep SSR-safe (no client-only APIs).

- [ ] **Step 2: Sources list in AgentDetail**

Read `AgentDetail.tsx`. Below the artifact grid, render a "แหล่งอ้างอิง / Sources" block from the union of `entry.sources` (and any artifact `sources`), de-duplicated by URL, each a safe `<a href target="_blank" rel="noreferrer">{title} — {date}</a>`. If `related` entries are available from the API payload, render a "Related" list linking to `/dashboard/[dept]` or the entry slug.

- [ ] **Step 3: Verify visually**

Run: `npm run dev`, open `http://localhost:3000/dashboard/fin` (needs Redis with a published web entry; or temporarily seed one). Screenshot the badge + Sources section. Confirm `api` vs `web · cited` render and links open.

- [ ] **Step 4: Commit**

```bash
git add src/components/charts/ArtifactRenderer.tsx src/components/AgentDetail.tsx
git commit -m "feat(charts): provenance badge + Sources/Related in detail page"
```

---

# Phase 4 — Telegram on-demand deep-dive

### Task 16: parseCommand + focus-session helpers

**Files:** `src/lib/telegram.ts`, `src/lib/telegram.test.ts` (create/extend)

- [ ] **Step 1: Write the failing test** — `src/lib/telegram.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import { parseCommand } from './telegram';

describe('parseCommand v1.4', () => {
  it('parses /agents and /report', () => {
    expect(parseCommand('/agents')?.cmd).toBe('agents');
    expect(parseCommand('/report fin')).toEqual({ cmd: 'report', args: ['fin'] });
  });
  it('still parses /ask dept question', () => {
    expect(parseCommand('/ask fin compare S&P500 funds')).toEqual({ cmd: 'ask', args: ['fin', 'compare S&P500 funds'] });
  });
  it('returns null for plain text (handled as a focus follow-up)', () => {
    expect(parseCommand('what about RMF?')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/telegram.test.ts`
Expected: FAIL — `agents`/`report` not in `KNOWN`.

- [ ] **Step 3: Implement**

In `src/lib/telegram.ts`: extend the `TgCommand` union and `KNOWN` with `'agents'` and `'report'`. Add a focus-session type + key helpers (storage is done in the route via Redis `set`/`get` with TTL; here just the pure shape + key):

```ts
export type TgCommand = 'status' | 'run' | 'ask' | 'agents' | 'report' | 'help';
// …add 'agents','report' to KNOWN…

export interface FocusSession { dept: string; turns: { role: 'user' | 'assistant'; text: string }[]; until: number }
export const FOCUS_TTL_MS = 15 * 60 * 1000;
export const focusKey = (chatId: string | number) => `tg:focus:${chatId}`;
export function isFocusLive(s: FocusSession | null, now = Date.now()): boolean {
  return !!s && s.until > now;
}
```

Add a small test for `isFocusLive` (live vs expired). Keep `parseCommand`'s existing `/ask` branch.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/telegram.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/telegram.ts src/lib/telegram.test.ts
git commit -m "feat(telegram): /agents, /report commands + focus-session model"
```

---

### Task 17: Telegram route — deep-dive /ask + threaded follow-ups

**Files:** `src/app/api/telegram/route.ts`

No unit test (integration/manual). The `NAME_TO_ID` map is missing `cyb` — add it.

- [ ] **Step 1: Fix NAME_TO_ID + add /agents, /report**

Add `cyberx: 'cyb', cyb: 'cyb'` to `NAME_TO_ID`. Add handlers:
- `/agents` → list the six depts with cadence (static text from a small `CADENCE` map).
- `/report <dept>` → `getKnowledge(getRepo(), { dept, limit: 1 })` → reply with title + highlight + slug link.

- [ ] **Step 2: Upgrade `/ask` to deep research + open a focus session**

In the `ask` branch, change `complete` to use web search and a bigger budget, then persist a focus session:

```ts
const answer = await complete({ system: PERSONAS[id], prompt: question, webSearch: true, maxSearches: 5, maxTokens: 1800 });
await sendMessage(`*${id.toUpperCase()}*: ${answer}`, String(chatId));
const repo = getRepo();
await repo.setFocus(String(chatId), { dept: id, turns: [{ role: 'user', text: question }, { role: 'assistant', text: answer }], until: Date.now() + FOCUS_TTL_MS });
```

Add `setFocus`/`getFocus`/`clearFocus` to `redis.ts` (thin wrappers over `client.set`/`get`/`del` on `focusKey`; Upstash `set` supports `{ ex }`, but to stay within `RedisClientLike` keep a plain `set` and rely on the `until` timestamp + `isFocusLive` for expiry, clearing lazily).

- [ ] **Step 3: Handle plain-text follow-ups (no command)**

When `parseCommand` returns `null` and a live focus session exists, treat the text as a follow-up turn: append to `turns`, call `complete` with the dept persona + the turn history as the prompt (web search on), reply, and update the session. If `/end` is sent or the session is expired, clear it and reply with a hint. Run all of this inside `after()` like the existing pattern; re-check `isAllowedChat` first.

- [ ] **Step 4: Manual verification**

With `TELEGRAM_*` env set and webhook pointed at a deployed preview (or local tunnel): send `/agents`, `/report fin`, `/ask fin เปรียบเทียบกอง S&P500`, then a plain follow-up `แล้ว RMF ล่ะ?` within 15 min → confirm the agent continues the thread; confirm it expires after 15 min. Document the result in the PR description.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/telegram/route.ts src/lib/redis.ts
git commit -m "feat(telegram): web-research /ask + 15-min threaded follow-ups + /agents /report"
```

---

# Phase 5 — Cron, docs, deploy

### Task 18: Mixed-cadence cron

**Files:** `vercel.json`

- [ ] **Step 1: Rewrite crons** (Vercel cron uses UTC; day-of-week field is 0=Sun):

```json
{
  "crons": [
    { "path": "/api/cron/run?dept=cyb", "schedule": "0 10 * * *" },
    { "path": "/api/cron/run?dept=ops", "schedule": "0 14 * * *" },
    { "path": "/api/cron/run?dept=fin", "schedule": "0 11 * * 1,3,5" },
    { "path": "/api/cron/run?dept=rnd", "schedule": "0 12 * * 2,4" },
    { "path": "/api/cron/run?dept=mkt", "schedule": "0 13 * * 1,4" },
    { "path": "/api/cron/run?dept=ceo", "schedule": "0 15 * * 0" }
  ]
}
```

- [ ] **Step 2: Verify schema** (no test; Vercel validates at deploy). Confirm JSON is valid: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8'))"` → no output = valid.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "chore(cron): mixed per-agent cadence (cyb/ops daily, fin 3x, rnd/mkt 2x, ceo weekly)"
```

> **Note (Hobby plan limits):** Vercel Hobby caps cron jobs/frequency. If the dashboard rejects 6 crons, consolidate into a single daily dispatcher route that internally decides which depts run today based on `new Date().getUTCDay()`, and keep one cron `0 10 * * *`. Decide at deploy time based on the plan's actual limit.

---

### Task 19: Full verification + docs + version bump

**Files:** `package.json`, `CLAUDE.md`

- [ ] **Step 1: Full gate**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: all PASS. Fix any fallout (most likely: lingering CoinGecko import in a test, or an artifact literal missing under the new union — both additive fixes).

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: succeeds; confirm `.agents/*.md` still included via `outputFileTracingIncludes` (briefs were edited, not moved).

- [ ] **Step 3: Bump version + CLAUDE.md**

Set `package.json` version to `1.4.0`. Update `CLAUDE.md` architecture section: provenance model (replaces "deterministic-only" invariant with "never uncited"), findings contract, mixed cadence, KB graph + `?slug=`, Telegram deep-dive + focus sessions. Note CoinGecko retired from Finance.

- [ ] **Step 4: Commit**

```bash
git add package.json CLAUDE.md
git commit -m "release: v1.4.0 core — real-value agents, KB graph, telegram deep-dive"
```

---

### Task 20: base-deployment

- [ ] Invoke the **base-deployment** skill to ship v1.4.0: it runs the verify → commit → push → confirm-Vercel-production flow. After deploy: (a) verify the new crons appear in the Vercel dashboard; (b) trigger one `/api/admin/run` per agent (or `/run` via Telegram) to produce real entries; (c) publish one via the Admin KB Manager and hit `/api/kb?slug=…` to confirm the graph payload; (d) smoke-test Telegram `/ask` + a follow-up.

---

## Self-Review (run against the spec)

**1. Spec coverage**
- §4 Hybrid model → Tasks 9–14 (autonomous mandate) + 16–17 (on-demand `/ask` threading). ✓
- §5 Provenance / §5.1 findings contract → Tasks 1, 2, 7, 9–14. ✓
- §6 Per-agent mandate/cadence/data → Tasks 9–14 + 18. ✓
- §7 Report template → Task 7 (findings contract) + per-agent prompts; uniform headers enforced by personas. ✓ (The Thai section headers `## สรุป / ## ผลการวิเคราะห์ / ## แหล่งอ้างอิง / ## ข้อจำกัด` are guided by the brief edits in Tasks 9–14; the parser-critical `## Highlight`/`## Flags` stay enforced by `personas.test.ts`.)
- §8 KB persistence + graph + `/api/kb` contract → Tasks 3–6, 8, 15. ✓
- §9 Telegram → Tasks 16–17. ✓
- §11 Testing → each task ships its tests; visual items (15) verified by screenshot. ✓
- §12 Risks (cost/cadence, graceful degrade, publish gate) → cadence in 18; degrade in 2/9 (null findings → narrative ships); publish gate unchanged in 8. ✓
- §14 Deploy → Tasks 18–20. ✓
- §3 Non-goals (TH/EN, /doc, kb reader site, MCP) → not in any task. ✓ (correctly excluded)

**2. Placeholder scan:** No "TBD/TODO". Repetitive agent tasks (10–14) carry concrete schemas + builder/run specifics, not "same as Task 9" — they reference Task 9 as a worked example but each lists its own schema, data-source split, and commit. Acceptable per "show the actual content."

**3. Type consistency:** `Citation`/`Provenance` defined in Task 1, re-exported via `types.ts` in Task 3, consumed in Tasks 8–14. `parse<Dept>Findings` naming consistent. `deriveSlug` defined in Task 4, imported in runner Task 8 and used in graph Task 5 via stored `slug`. `getKbBySlug` defined Task 5, consumed Task 6. `FocusSession`/`focusKey`/`isFocusLive` defined Task 16, consumed Task 17 (with `setFocus`/`getFocus`/`clearFocus` added to redis in Task 17 — flagged there explicitly).

**Open executor decisions (call them out, don't block):**
- Task 5 `this` vs `const repo` form in `makeRedisRepo` — pick whichever compiles, stay consistent.
- Task 18 Hobby cron limit — fall back to single dispatcher if 6 crons rejected.
