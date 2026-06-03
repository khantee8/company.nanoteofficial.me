# v1.3 Core — Smart Agents & Optimal Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the v1.3 **core**: every agent persists typed `Artifact[]` (charts/tables/infographics) built deterministically from its source data; hand-rolled SVG components render them on a refreshed executive overview (anchored by a CEO Executive Cockpit) and on new per-agent detail pages reachable from a NavBar sub-nav; the knowledge base gains category + tags + status + artifacts on addressable storage behind a published-only `/api/kb`. Finance, CyberX, Marketing get full chart treatments; CEO gets the cockpit; R&D and Ops detail pages render text-first this phase.

**Architecture:** A new `Artifact` discriminated union (`types.ts`) is the universal seam. Each department module keeps calling `complete()` for prose, then builds artifacts + tags from the **same raw data it already fetched** via pure, unit-tested `toArtifacts()` / `extractTags()` helpers — the LLM never produces a chart. `runner.ts` derives the per-dept `category` and persists `artifacts`/`category`/`tags` into `AgentOutput` and the enriched `KbEntry`. KB storage moves from one `kb:entries` list of full objects to addressable `kb:entry:<id>` + a `kb:index` id-list so single entries are mutable (the v1.3.1 Manager needs this). Charts are dependency-free `src/components/charts/` SVG primitives behind an `ArtifactRenderer`. The `## Highlight` / `## Flags` footer contract and the `.agents/*.md` runtime briefs are untouched.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind v4, Vitest, `@anthropic-ai/sdk`, Upstash Redis.

**Spec:** `docs/superpowers/specs/2026-06-03-v13-smart-agents-optimal-dashboard-design.md`

**Deferred to v1.3.1 (NOT in this plan):** R&D Research Radar (+ `githubTrending.ts`), Operations charts, the Admin `KbManager.tsx` UI + `/api/admin/kb` mutations + draft→publish gate, bulk actions.

---

## File Structure

**New files:**
- `src/lib/agents/artifacts.ts` — `Artifact` union, `KbCategory`, `CATEGORY_BY_DEPT`, shared helpers.
- `src/lib/agents/artifacts.test.ts` — category-map + helper tests.
- `src/lib/sources/hackernews.ts` + `.test.ts` — HN Algolia adapter (Marketing demand).
- `src/lib/sources/devto.ts` + `.test.ts` — Dev.to adapter (Marketing demand).
- `src/lib/sources/analytics.ts` + `.test.ts` — Vercel Web Analytics reach reader (graceful).
- `src/lib/agents/finance.artifacts.test.ts`, `cyberx.artifacts.test.ts`, `marketing.artifacts.test.ts`, `ceo.artifacts.test.ts` — per-agent builder tests.
- `src/components/charts/Bars.tsx`, `Line.tsx`, `Donut.tsx`, `DataTable.tsx`, `Scorecard.tsx`, `Heatmap.tsx`, `TagCloud.tsx`, `Checklist.tsx`, `ArtifactRenderer.tsx`.
- `src/components/charts/ArtifactRenderer.test.tsx` — static-render smoke test (renderToStaticMarkup, no jsdom).
- `src/components/AgentDetail.tsx` — per-agent detail body.
- `src/app/dashboard/[dept]/page.tsx` — detail route (server component).

**Modified files:**
- `src/lib/agents/types.ts` — extend `AgentRunResult` (`artifacts?`, `tags?`), `AgentOutput`, `KbEntry`; re-export from `artifacts.ts`.
- `src/lib/agents/runner.ts` — derive `category`, persist artifacts/category/tags; export `CATEGORY_BY_DEPT` usage; add `companySnapshot` to `buildContext()`.
- `src/lib/redis.ts` — addressable KB storage + `getKbEntry`/`updateKbEntry`/`deleteKbEntry`/`listKb`; legacy normalization.
- `src/lib/kb.ts` — published-only filter + new query fields.
- `src/lib/agents/finance.ts`, `cyberx.ts`, `marketing.ts`, `ceo.ts` — return `artifacts` + `tags`.
- `src/lib/sources/coingecko.ts` — add `toFinanceArtifacts` / tag helper (or keep builders in `finance.ts`).
- `src/components/NavBar.tsx` — agent sub-nav; bump version label.
- `src/components/ExecDashboard.tsx` — CEO cockpit hero, compact artifacts, cards link to `/dashboard/[dept]`.
- `src/lib/dashboard.ts` — expose `artifacts`/`category`/`tags` already on `AgentOutput` (type flows automatically; verify a per-dept selector exists).
- `package.json` — version bump to `1.3.0`; `CHANGELOG.md`.

**Sequencing note:** Task 1 introduces the types as **optional** on `AgentRunResult` (`artifacts?`, `tags?`) so existing agent modules keep compiling — each later task fills one agent in isolation, always green. `AgentOutput`/`KbEntry` carry the fields as **required**, with the runner supplying `[]` defaults. Tasks 1–3 are infra (types, charts, storage) and independent of the per-agent tasks 4–7. UI tasks 8–9 depend on 1–7. Task 10 verifies + releases.

---

### Task 1: Artifact model + category map + runner persistence (green-build infra unit)

**Files:**
- Create: `src/lib/agents/artifacts.ts`, `src/lib/agents/artifacts.test.ts`
- Modify: `src/lib/agents/types.ts`, `src/lib/agents/runner.ts`
- Test: extend `src/lib/agents/runner.test.ts`

- [ ] **Step 1: Write the failing test for the artifact module**

Create `src/lib/agents/artifacts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CATEGORY_BY_DEPT } from './artifacts';
import { DEPARTMENTS } from '@/lib/data/departments';

describe('CATEGORY_BY_DEPT', () => {
  it('maps every department to a stable category', () => {
    for (const d of DEPARTMENTS) {
      expect(CATEGORY_BY_DEPT[d.id]).toBeTruthy();
    }
    expect(CATEGORY_BY_DEPT.fin).toBe('market-brief');
    expect(CATEGORY_BY_DEPT.cyb).toBe('threat-intel');
    expect(CATEGORY_BY_DEPT.ceo).toBe('exec-brief');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/agents/artifacts.test.ts`
Expected: FAIL — module `./artifacts` does not exist.

- [ ] **Step 3: Implement `artifacts.ts`**

Create `src/lib/agents/artifacts.ts`:

```ts
import type { DeptId } from '@/lib/data/departments';

export type KbCategory =
  | 'market-brief' | 'threat-intel' | 'research'
  | 'content-plan' | 'ops-status'  | 'exec-brief';

export const CATEGORY_BY_DEPT: Record<DeptId, KbCategory> = {
  fin: 'market-brief',
  cyb: 'threat-intel',
  rnd: 'research',
  mkt: 'content-plan',
  ops: 'ops-status',
  ceo: 'exec-brief',
};

export type Artifact =
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
  | { kind: 'checklist'; title: string; items: { text: string; done: boolean }[] };

/** Deterministic, dedup, lowercase, capped tag list. */
export function normalizeTags(raw: string[], cap = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const v = t.trim().toLowerCase();
    if (v && !seen.has(v)) { seen.add(v); out.push(v); if (out.length >= cap) break; }
  }
  return out;
}
```

- [ ] **Step 4: Extend the shared types**

In `src/lib/agents/types.ts`, import the new types and extend the interfaces:

```ts
import type { Artifact, KbCategory } from './artifacts';
export type { Artifact, KbCategory };
```

- `AgentRunResult` — add **optional** fields (keeps existing modules compiling):
  ```ts
  artifacts?: Artifact[];
  tags?: string[];
  ```
- `AgentOutput` — add **required** fields:
  ```ts
  artifacts: Artifact[];
  category: KbCategory;
  tags: string[];
  ```
- `KbEntry` — replace with the enriched shape:
  ```ts
  export interface KbEntry {
    id: string;
    dept: DeptId;
    date: string;
    ts: string;
    category: KbCategory;
    tags: string[];
    status: 'draft' | 'published' | 'archived';
    pinned?: boolean;
    summary: string;
    highlight: string;
    flags: string[];
    artifacts: Artifact[];
    markdown: string;
  }
  ```

- [ ] **Step 5: Write the failing runner-persistence test**

Append to `src/lib/agents/runner.test.ts` a case asserting the runner stores artifacts/category/tags and a published KB entry. Use the existing in-memory repo pattern in that file (mirror its `setOutput`/`pushKb` capture). Assert:
- `setOutput` received `category: 'market-brief'`, `artifacts` from the agent, `tags` from the agent (for a `fin` run).
- `pushKb` received an entry with `id` (`${dept}:${ts}`), `status: 'published'`, the same `category`/`tags`/`artifacts`.

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test -- src/lib/agents/runner.test.ts`
Expected: FAIL — runner does not yet set category/artifacts/tags.

- [ ] **Step 7: Update `runner.runAgent()` persistence**

In `src/lib/agents/runner.ts`:
- Import `CATEGORY_BY_DEPT` from `./artifacts`.
- After `const result = await agent.run(ctx);`, derive:
  ```ts
  const artifacts = result.artifacts ?? [];
  const tags = result.tags ?? [];
  const category = CATEGORY_BY_DEPT[dept];
  const id = `${dept}:${ts}`;
  ```
- Pass `artifacts`, `category`, `tags` into `repo.setOutput({ ... })`.
- Replace the `repo.pushKb({...})` call with the enriched entry:
  ```ts
  repo.pushKb({ id, dept, date, ts, category, tags, status: 'published',
    summary: result.summary, highlight, flags, artifacts, markdown: result.markdown }),
  ```

- [ ] **Step 8: Verify green**

Run: `npm test -- src/lib/agents/runner.test.ts src/lib/agents/artifacts.test.ts`
Run: `npx tsc --noEmit`
Expected: PASS; no type errors (the optional `AgentRunResult` fields keep the five untouched modules compiling).

- [ ] **Step 9: Commit**

```bash
git add src/lib/agents/artifacts.ts src/lib/agents/artifacts.test.ts src/lib/agents/types.ts src/lib/agents/runner.ts src/lib/agents/runner.test.ts
git commit -m "feat: artifact model + category map + runner persistence (v1.3 infra)"
```

---

### Task 2: SVG chart primitives + ArtifactRenderer

Charts have no visual unit tests (per CLAUDE.md) — but a static-render smoke test guards that each `kind` produces markup without throwing. All components are pure SVG/HTML, server-renderable, no deps, no `dangerouslySetInnerHTML`.

**Files:**
- Create: `src/components/charts/*.tsx` + `ArtifactRenderer.tsx`
- Test: `src/components/charts/ArtifactRenderer.test.tsx`

- [ ] **Step 1: Write the failing smoke test**

Create `src/components/charts/ArtifactRenderer.test.tsx`:

```ts
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArtifactRenderer } from './ArtifactRenderer';
import type { Artifact } from '@/lib/agents/artifacts';

const samples: Artifact[] = [
  { kind: 'divergingBars', title: 'moves', series: [{ label: 'BTC', value: 2.1 }, { label: 'ETH', value: -1.3 }] },
  { kind: 'donut', title: 'breadth', series: [{ label: 'up', value: 6 }, { label: 'down', value: 2 }] },
  { kind: 'line', title: 'trend', points: [{ t: 'Mon', value: 3 }, { t: 'Tue', value: 5 }] },
  { kind: 'table', title: 'prices', columns: ['a', 'b'], rows: [['x', 1]] },
  { kind: 'scorecard', title: 'health', tiles: [{ label: 'FIN', state: 'ok' }] },
  { kind: 'heatmap', title: '7d', cells: [{ label: 'd1', level: 2 }] },
  { kind: 'tags', title: 'trends', tags: ['agents', 'rag'] },
  { kind: 'checklist', title: 'decisions', items: [{ text: 'ship', done: true }] },
];

describe('ArtifactRenderer', () => {
  it('renders every artifact kind to non-empty markup', () => {
    for (const a of samples) {
      const html = renderToStaticMarkup(<ArtifactRenderer artifact={a} />);
      expect(html.length).toBeGreaterThan(0);
    }
  });

  it('renders empty series without NaN geometry', () => {
    const html = renderToStaticMarkup(<ArtifactRenderer artifact={{ kind: 'bars', title: 't', series: [] }} />);
    expect(html).not.toContain('NaN');
  });
});
```

> Note: this test file is `.tsx` and uses JSX. Confirm `vitest.config` / `tsconfig` resolve `react-dom/server` (React 19 ships it). If vitest needs the jsx transform, the existing setup already compiles `.tsx` for the app; no extra config expected.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- src/components/charts/ArtifactRenderer.test.tsx`
Expected: FAIL — components do not exist.

- [ ] **Step 3: Implement the chart primitives**

Create each component under `src/components/charts/`. Keep them small, prop-driven, and palette-matched (`#0b0b1e` panels, `#3ddc97`/`#ff6b86` accents, `#7a7ca6` labels). Each takes its slice of an `Artifact` plus an optional `compact?: boolean`. Guard against empty data (render an empty-state, never compute on a zero-length array).

- `Bars.tsx` — horizontal bars; `diverging` mode centers a zero axis (green ≥0, red <0).
- `Line.tsx` — polyline over `points`; `sparkline` variant = no axes/labels.
- `Donut.tsx` — stacked-arc ring from `series` with a center total.
- `DataTable.tsx` — `<table>` from `columns`/`rows`; right-align numeric cells.
- `Scorecard.tsx` — tile grid; color by `state` (ok/warn/down).
- `Heatmap.tsx` — row of cells shaded by `level`.
- `TagCloud.tsx` — pill list from `tags`.
- `Checklist.tsx` — ☑/☐ list from `items`.

- [ ] **Step 4: Implement `ArtifactRenderer.tsx`**

```tsx
import type { Artifact } from '@/lib/agents/artifacts';
import { Bars } from './Bars';
import { Line } from './Line';
import { Donut } from './Donut';
import { DataTable } from './DataTable';
import { Scorecard } from './Scorecard';
import { Heatmap } from './Heatmap';
import { TagCloud } from './TagCloud';
import { Checklist } from './Checklist';

export function ArtifactRenderer({ artifact, compact }: { artifact: Artifact; compact?: boolean }) {
  switch (artifact.kind) {
    case 'bars':
    case 'divergingBars': return <Bars a={artifact} compact={compact} />;
    case 'donut':         return <Donut a={artifact} compact={compact} />;
    case 'line':
    case 'sparkline':     return <Line a={artifact} compact={compact} />;
    case 'table':         return <DataTable a={artifact} compact={compact} />;
    case 'scorecard':     return <Scorecard a={artifact} compact={compact} />;
    case 'heatmap':       return <Heatmap a={artifact} compact={compact} />;
    case 'tags':          return <TagCloud a={artifact} compact={compact} />;
    case 'checklist':     return <Checklist a={artifact} compact={compact} />;
  }
}
```

(Use a discriminated-union switch with no `default` so TS flags an unhandled future kind.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm test -- src/components/charts/ArtifactRenderer.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/charts/
git commit -m "feat: hand-rolled SVG chart primitives + ArtifactRenderer"
```

---

### Task 3: KB storage redesign + published-only `/api/kb` + legacy migration

**Files:**
- Modify: `src/lib/redis.ts`, `src/lib/kb.ts`
- Test: extend `src/lib/kb.test.ts`; add `src/lib/redis.test.ts` cases

- [ ] **Step 1: Write the failing tests**

Extend `src/lib/kb.test.ts` (and/or `redis.test.ts`) against the in-memory client used in the existing tests. Cover:
- `pushKb` writes `kb:entry:<id>` and prepends `id` to `kb:index`.
- `getKbEntry(id)` round-trips; `updateKbEntry(id, { status:'archived', pinned:true })` mutates only those fields; `deleteKbEntry(id)` removes entry + index id.
- `listKb({ status:'published' })` returns only published, newest-first; `listKb({ dept:'cyb' })`, `{ category:'threat-intel' }`, `{ q:'cve' }` (matches title/tags/markdown), and `{ from, to }` date-range filter.
- Legacy normalization: a raw object lacking `id/status/category/tags/artifacts` (the old shape) is normalized to `status:'published'`, `category = CATEGORY_BY_DEPT[dept]`, `tags:[]`, `artifacts:[]`, synthetic `id`.
- `getKnowledge()` returns **published only** and honors `category`/`q` filters.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/lib/kb.test.ts src/lib/redis.test.ts`
Expected: FAIL — new methods/filters absent.

- [ ] **Step 3: Redesign KB storage in `redis.ts`**

- Replace `KB_KEY`/`KB_CAP` list usage with:
  - `kb:entry:<id>` (set/get/del individual JSON).
  - `kb:index` (lpush id, ltrim to a cap ~300, lrange).
- Extend `RedisClientLike` with `del(key)` (Upstash supports it).
- Implement repo methods:
  ```ts
  pushKb(entry)        // set kb:entry:<id>, lpush id to kb:index, ltrim
  getKbEntry(id)       // get one, normalize legacy
  updateKbEntry(id, p) // get→merge→set
  deleteKbEntry(id)    // del entry, remove id from index (lrem or rebuild)
  listKb(opts)         // lrange index → mget entries → normalize → filter in memory → cap
  ```
- Add a `normalizeKbEntry(raw, dept?)` that fills missing fields (the migration seam). Keep a `getKb(limit)` shim that delegates to `listKb({ limit })` so existing callers don't break, or update them.

- [ ] **Step 4: Update `kb.ts` query surface**

Extend `KnowledgeQuery` with `category?`, `q?`, `from?`, `to?`, and filter to `status === 'published'` inside `getKnowledge()` (delegating filtering to `listKb` where possible).

- [ ] **Step 5: Verify the public API route**

Confirm `src/app/api/kb/route.ts` passes through the new query params (`?dept=&category=&q=&limit=`) to `getKnowledge()`. Update it to read the extra params. The response now includes `artifacts`, `category`, `tags`, `status` per entry.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test -- src/lib/kb.test.ts src/lib/redis.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/redis.ts src/lib/kb.ts src/app/api/kb/route.ts src/lib/kb.test.ts src/lib/redis.test.ts
git commit -m "feat: addressable KB storage, categories/tags/status, published-only /api/kb"
```

---

### Task 4: Finance artifacts + tags

**Files:**
- Modify: `src/lib/sources/coingecko.ts` (add builder) or `src/lib/agents/finance.ts`
- Create: `src/lib/agents/finance.artifacts.test.ts`
- Modify: `src/lib/agents/finance.ts`

- [ ] **Step 1: Write the failing builder test**

Create `src/lib/agents/finance.artifacts.test.ts` testing a pure `financeArtifacts(raw: CoinGeckoResponse)` and `financeTags(raw)`:
- Input the `CoinGeckoResponse` shape `{ bitcoin: { usd, usd_24h_change }, ... }`.
- Assert a `divergingBars` artifact whose series values equal the `usd_24h_change` per symbol (BTC/ETH/SOL).
- Assert a `donut` breadth artifact with `up`/`down` counts.
- Assert a `table` artifact with columns `['asset','price','24h %']` and a row per coin.
- Assert `financeTags` returns lowercased tickers `['btc','eth','sol']`.

- [ ] **Step 2: Run to verify it fails**, then **Step 3: Implement** the pure builders (deriving from `usd`/`usd_24h_change`, reusing `SYMBOL`), then wire into `finance.ts` `run()`:

```ts
const prices = await fetchPrices();
// ...existing prose call...
return { markdown, summary: briefSummary(lines),
  feedMsg: `market: ${lines[0] ?? 'n/a'}`,
  artifacts: financeArtifacts(prices), tags: financeTags(prices),
  meta: { lines } };
```

- [ ] **Step 4: Run to verify it passes** — `npm test -- src/lib/agents/finance.artifacts.test.ts`
- [ ] **Step 5: Commit** — `feat: Finance structured artifacts (24h bars, breadth donut, price table)`

---

### Task 5: CyberX artifacts + tags

**Files:**
- Create: `src/lib/agents/cyberx.artifacts.test.ts`
- Modify: `src/lib/agents/cyberx.ts` (+ a builder, reading `KevEntry[]`/`NewsItem[]` and `ctx.ownHistory` for the trend)

- [ ] **Step 1: Failing test** — pure `cyberxArtifacts(kev, news, history)` and `cyberxTags(kev)`:
- `donut` severity (bucket KEV by a derived severity heuristic — e.g., known ransomware/`vulnerabilityName` keyword → high; fall back to a count-by-vendor donut if severity is not in the feed). Assert series sums to `kev.length`.
- `line` 7-day new-CVE trend from `history` dates (count per day; zero-fill missing days).
- `table` CVEs with columns `['CVE','product','added']`.
- `cyberxTags` returns lowercased CVE IDs + vendor names.

> Implementation note: the KEV feed has no numeric CVSS; derive a coarse severity bucket deterministically from fields present (vendor/product/known-ransomware flag) — document the heuristic in a comment. No fabricated CVSS numbers.

- [ ] **Step 2–3:** verify-fail, implement, wire into `cyberx.ts` `run()` (`artifacts`, `tags` alongside existing return; keep `meta`).
- [ ] **Step 4:** `npm test -- src/lib/agents/cyberx.artifacts.test.ts`
- [ ] **Step 5: Commit** — `feat: CyberX structured artifacts (severity donut, CVE trend, KEV table)`

---

### Task 6: Marketing artifacts + new sources (HN, Dev.to, Analytics)

**Files:**
- Create: `src/lib/sources/hackernews.ts` + `.test.ts`, `src/lib/sources/devto.ts` + `.test.ts`, `src/lib/sources/analytics.ts` + `.test.ts`
- Create: `src/lib/agents/marketing.artifacts.test.ts`
- Modify: `src/lib/agents/marketing.ts`

- [ ] **Step 1: Source adapters (TDD each)** — follow the `coingecko`/`threatintel` convention (pure parse/select fns + network fetchers that swallow errors → `[]`):
- `hackernews.ts` — `fetchHN(query)` via HN Algolia `https://hn.algolia.com/api/v1/search?query=&tags=story`; map to `{ title, url, points, comments }`. Pure `selectHN(raw, limit)` is the tested unit.
- `devto.ts` — `fetchDevto(tag)` via `https://dev.to/api/articles?tag=&top=7`; map to `{ title, url, reactions, comments }`. Pure `selectDevto(raw, limit)` tested.
- `analytics.ts` — `fetchReach()` via Vercel Web Analytics using `VERCEL_TOKEN`; returns `{ day, visits }[]` or `[]` if the token/endpoint is unavailable (**graceful** — never throws). Pure shaper tested; network path guarded.

- [ ] **Step 2: Marketing builder test** — `marketingArtifacts({ hn, devto, reach })` and `marketingTags(...)`:
- `bars` topic momentum: top items by `points + comments` (HN) and `reactions + comments` (Dev.to), merged/labeled. (Demand.)
- `line` site reach from `reach` (omit this artifact when `reach` is empty — assert the array simply lacks a `line`).
- `table` content plan: derive channel/format/hook rows from the agent's own three sections — for the artifact, a deterministic skeleton table `[['X','post','…'],['LinkedIn','post','…'],['Blog','idea','…']]` keyed off the top trending topic. (No fabricated engagement on owned channels.)
- `marketingTags` returns lowercased trending topics + channels.

- [ ] **Step 3: Wire into `marketing.ts`** — fetch the three sources (`Promise.all`, each `.catch(()=>[])`), feed the trending summary into the existing prose prompt **and** build artifacts/tags; return them. Reach degrades gracefully.

- [ ] **Step 4: Run** — `npm test -- src/lib/sources/hackernews.test.ts src/lib/sources/devto.test.ts src/lib/sources/analytics.test.ts src/lib/agents/marketing.artifacts.test.ts`
- [ ] **Step 5: Commit** — `feat: Marketing real data sources (HN+Dev.to+Analytics) + demand/reach/plan artifacts`

---

### Task 7: CEO Executive Cockpit + `companySnapshot`

**Files:**
- Modify: `src/lib/agents/runner.ts` (`buildContext` adds `companySnapshot`), `src/lib/agents/types.ts` (`AgentContext.companySnapshot?`)
- Create: `src/lib/agents/ceo.artifacts.test.ts`
- Modify: `src/lib/agents/ceo.ts`

- [ ] **Step 1: Extend context** — add optional `companySnapshot?: { statuses: AgentStatus[]; digest: DigestEntry[] }` to `AgentContext`. In `buildContext()`, when `dept === 'ceo'`, populate it (read all six `getStatus` + `getDigest`). Keep it absent for other depts (cheap).

- [ ] **Step 2: CEO builder test** — `ceoArtifacts(snapshot)`:
- `scorecard` — one tile per dept; `state` from each status (`done`→ok, `error`→down, stale/idle→warn).
- `bars` — open flags per dept, from the digest's `flags.length`.
- `heatmap` — 7-day activity from digest dates (level = runs that day).
- `checklist` — parse the CEO `## Decisions` bullets into items (all `done:false`); this one reads the model's own markdown, deterministically split by line.

- [ ] **Step 3: Wire into `ceo.ts`** — build artifacts from `ctx.companySnapshot` (guard when absent → `[]`), parse decisions from the produced markdown for the checklist, return `artifacts`/`tags`.

- [ ] **Step 4: Run** — `npm test -- src/lib/agents/ceo.artifacts.test.ts`
- [ ] **Step 5: Commit** — `feat: CEO Executive Cockpit artifacts (scorecard, flags, heatmap, decisions)`

---

### Task 8: NavBar sub-nav + `/dashboard/[dept]` detail pages

Visual; ends in browser verification.

**Files:**
- Modify: `src/components/NavBar.tsx`
- Create: `src/app/dashboard/[dept]/page.tsx`, `src/components/AgentDetail.tsx`

- [ ] **Step 1: NavBar sub-nav** — add a secondary row of agent links (`/dashboard/[dept]`) shown when `pathname.startsWith('/dashboard')`. Source labels/ids/colors from `DEPARTMENTS`. Keep the existing Office/Dashboard primary links + mobile menu. Bump `nav-version` to `v1.3.0`.

- [ ] **Step 2: Detail route** — create `src/app/dashboard/[dept]/page.tsx` (server component). Read the `dept` param; validate with `isDeptId` → else `notFound()`. Fetch that dept's slice via the dashboard read (reuse `getDashboardData` and select the dept, or add a `getAgentDashboard(repo, dept)` to `dashboard.ts`). Render `<AgentDetail agent={...} />`. Wrap with the shared nav/layout used by `/dashboard`.

- [ ] **Step 3: `AgentDetail.tsx`** — hero (name/status/last-run) → KPI strip (derive 3–4 KPIs from artifacts/flags) → `artifacts.map(a => <ArtifactRenderer artifact={a} />)` (full variant) → analyst narrative via `Markdown` → flags + history dots → export buttons (reuse the MD/PDF/CSV helpers; add a JSON export of the artifacts). Public, read-only — **no Run button** (admin-only stays in `/admin`).

- [ ] **Step 4: Build + type-check** — `npx tsc --noEmit` && `npm run build` (expected: clean).

- [ ] **Step 5: Visual verification** — `npm run dev`, open `http://localhost:3000/dashboard`:
- Sub-nav lists all six agents; clicking lands on `/dashboard/finance` etc.
- Finance/CyberX/Marketing pages show their charts; R&D/Ops show text-first (no charts yet — expected this phase); CEO shows the cockpit.
- Unknown dept (`/dashboard/zzz`) → 404.
- Capture screenshots of the Finance and CEO pages for the commit.

- [ ] **Step 6: Commit** — `feat: agent sub-nav + /dashboard/[dept] detail pages`

---

### Task 9: Executive overview refresh (CEO cockpit hero + linked cards)

Visual; ends in browser verification.

**Files:**
- Modify: `src/components/ExecDashboard.tsx`

- [ ] **Step 1:** Render the CEO cockpit artifacts as the overview hero (above the KPI strip or replacing the static hero copy), pulling the `ceo` agent's `artifacts` from the dashboard payload.
- [ ] **Step 2:** Make each `ExecCard` a link to `/dashboard/[dept]`, and embed up to one **compact** artifact (`<ArtifactRenderer compact />`) under the highlight when the agent has artifacts.
- [ ] **Step 3:** Keep the Company Pulse feed. Ensure the public dashboard still loads with empty data (no artifacts → cards fall back to text, as today).
- [ ] **Step 4: Build + visual verify** — `npm run build`; `npm run dev` → `/dashboard` shows the cockpit hero and cards link through; screenshot.
- [ ] **Step 5: Commit** — `feat: exec overview — CEO cockpit hero + linked cards with compact charts`

---

### Task 10: Full verification + release

**Files:** `package.json`, `CHANGELOG.md`

- [ ] **Step 1: Full suite** — `npm test` (all prior + new builder/storage/renderer tests green).
- [ ] **Step 2: Type-check** — `npx tsc --noEmit`.
- [ ] **Step 3: Lint** — `npm run lint`.
- [ ] **Step 4: Production build** — `npm run build`.
- [ ] **Step 5: Optional live smoke** (needs env) — trigger a Finance run and confirm the dashboard payload + `/api/kb` include `artifacts`/`category`/`tags`/`status`:
  ```bash
  curl -s -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/cron/run?dept=fin" | head
  curl -s "http://localhost:3000/api/kb?dept=fin&limit=1" | head
  ```
- [ ] **Step 6: Version + changelog** — bump `package.json` to `1.3.0`; add a `CHANGELOG.md` v1.3 entry summarizing structured artifacts, detail pages/sub-nav, CEO cockpit, KB storage redesign. Update the project `CLAUDE.md` "current = v1.2" line to v1.3 core (note v1.3.1 pending).
- [ ] **Step 7: Commit + tag** — `release: v1.3 core — smart agents, charts, detail pages, KB storage`.

---

## Self-Review

**Spec coverage:**
- §Data layer (Artifact union, persistence) → Task 1. ✓
- §Sources & agents (Finance/CyberX/Marketing/CEO builders + HN/Dev.to/Analytics) → Tasks 4–7. ✓
- §Rendering (SVG primitives + ArtifactRenderer) → Task 2. ✓
- §Routing (NavBar sub-nav + /dashboard/[dept] + AgentDetail) → Task 8; exec overview → Task 9. ✓
- §KB (enriched entry, addressable storage, published-only /api/kb, migration) → Task 3. ✓
- §Phasing — R&D/Ops charts + Admin KB Manager + mutations + bulk = explicitly **deferred to v1.3.1**. ✓
- §Testing — builders/sources/storage/renderer all TDD; charts via static-render smoke + dev-server screenshots. ✓
- §Error handling — graceful source `.catch(()=>[])`, empty-series chart guards, optional reach artifact. ✓

**Type consistency:** `Artifact`/`KbCategory` defined once in `artifacts.ts`, re-exported via `types.ts`, consumed by builders, `ArtifactRenderer`, `AgentOutput`, `KbEntry`. `AgentRunResult.artifacts?/tags?` optional keeps the five not-yet-updated modules compiling after Task 1; runner defaults to `[]`. `KbEntry.id = ${dept}:${ts}` set in runner (Task 1) and used by storage (Task 3). `companySnapshot` optional on `AgentContext`, populated only for `ceo` (Task 7). ✓

**Green-build ordering:** Task 1 makes the union optional on the result type, so Tasks 4–7 each touch one agent without breaking others. Tasks 1–3 (infra) and 4–7 (agents) precede UI Tasks 8–9. ✓

**Placeholder scan:** No TBD/TODO. The two heuristic spots are called out explicitly (CyberX coarse-severity bucket — no fabricated CVSS; Marketing content-plan skeleton — no fabricated owned-channel engagement) with the determinism rule preserved. UI tasks end in build + screenshot verification since pixel layout can't be unit-tested (per CLAUDE.md). ✓
