# v1.3 — Smart Agents & Optimal Dashboard — Design Spec

**Date:** 2026-06-03
**Project:** company.nanoteofficial.me (AI Company Simulator)
**Status:** Approved for planning

## Summary

Today every agent run is a wall of Thai prose. Each agent already fetches real,
structured data (CoinGecko prices, CISA KEV CVEs, Vercel/GitHub stats) but it is
**discarded** — `AgentRunResult.meta` is stored on `AgentOutput` and never
rendered or archived. Both dashboards (`/dashboard`, `/admin`) only show the
free-text `markdown` through a minimal renderer. The public knowledge base
(`kb:entries` → `/api/kb`) is a flat, uncategorized, unsearchable list.

v1.3 makes **structured data a first-class citizen**. Every agent emits typed
`Artifact[]` (charts/tables/infographics) built **deterministically from its
source data** — the LLM writes only the narrative, so a chart can never be
malformed or hallucinated. Those artifacts render as **hand-rolled SVG**
components across a new **per-agent detail page** (`/dashboard/[dept]`, reached
from a NavBar sub-nav), and a refreshed executive overview anchored by a **CEO
Executive Cockpit**. The knowledge base is enriched with **category + tags +
status + artifacts** and moved to addressable storage so a future Admin **KB
Manager** can search, curate, and publish entries to `kb.nanoteofficial.me`.

**Cost & secrets:** all new data sources are free public APIs (Hacker News
Algolia, Dev.to, GitHub trending) needing **no new secrets**. Marketing's "owned
reach" reuses the existing `VERCEL_TOKEN` and degrades gracefully if Hobby-plan
analytics is unavailable. Charts are dependency-free SVG — no bundle bloat.

## Goals

- Each agent produces structured research data rendered as tables / graphs /
  infographics — especially **Finance, CyberX, Marketing**.
- All six agents get a data representation (R&D and CEO included).
- A NavBar that lands the visitor on a full per-agent detail page.
- The Admin KB is **categorized, searchable, and manageable**, with a clean
  `/api/kb` seam that a separate `kb.nanoteofficial.me` repo will later consume.
- No fabricated metrics: every number traces to a real source.
- Preserve existing contracts: the `## Highlight` / `## Flags` footer, the
  `.agents/*.md` runtime briefs, admin HMAC-cookie auth, no
  `dangerouslySetInnerHTML`.

## Non-Goals (out of scope)

- The public `kb.nanoteofficial.me` front-end — a separate repo/session. v1.3
  delivers only the enriched `/api/kb` it will read.
- Real social posting / live social-account metrics for Marketing.
- A heavyweight charting library — charts are hand-rolled SVG by decision.
- Replacing Redis with a search engine — KB search is in-memory over the bounded
  entry set.

## Key Decisions (from brainstorming)

1. **Data origin:** deterministic from source adapters; the LLM writes narrative
   only. Charts are never LLM-generated.
2. **Marketing data:** add real sources — **both** trend signals (HN + Dev.to)
   and owned reach (Vercel Web Analytics).
3. **Chart tech:** hand-rolled React + SVG primitives, zero dependencies.
4. **Navigation:** route per agent — `/dashboard/[dept]` shareable pages, reached
   from a NavBar sub-nav; overview cards link in. Run-now stays admin-only.
5. **R&D / CEO:** R&D gets a real new source (GitHub trending + HN); CEO
   aggregates the company's own state — no new source.
6. **KB curation:** auto-category + auto-tags on arrival; admin curates and
   explicitly publishes. (Manager UI is phased to v1.3.1; see Phasing.)

---

## Architecture

### 1. Data layer — the `Artifact` model

New discriminated union in `src/lib/agents/types.ts`, the universal shape all
renderers and the KB consume:

```ts
export type KbCategory =
  | 'market-brief' | 'threat-intel' | 'research'
  | 'content-plan' | 'ops-status'  | 'exec-brief';

export type Artifact =
  | { kind: 'bars' | 'divergingBars' | 'donut'; title: string;
      series: { label: string; value: number; color?: string }[]; unit?: string }
  | { kind: 'line' | 'sparkline'; title: string;
      points: { t: string; value: number }[]; unit?: string }
  | { kind: 'table'; title: string;
      columns: string[]; rows: (string | number)[][] }
  | { kind: 'scorecard'; title: string;
      tiles: { label: string; state: 'ok' | 'warn' | 'down' }[] }
  | { kind: 'heatmap'; title: string;
      cells: { label: string; level: number }[] }
  | { kind: 'tags'; title: string; tags: string[] }
  | { kind: 'checklist'; title: string;
      items: { text: string; done: boolean }[] };
```

`AgentRunResult` gains:

```ts
artifacts: Artifact[];   // deterministic, may be []
category: KbCategory;    // stable per dept
tags: string[];          // deterministic entity extraction
```

`AgentOutput` and `KbEntry` carry `artifacts`, `category`, `tags`. The
`## Highlight` / `## Flags` footer parsing in `runner.ts` is **unchanged** —
artifacts are additive metadata, not a replacement for the narrative.

### 2. Sources & agents (deterministic builders)

Each department module keeps calling `complete()` for prose, then builds
artifacts from the **same raw data it already fetched**. Pattern: a pure
`toArtifacts(rawData): Artifact[]` + `extractTags(rawData): string[]` per dept,
unit-tested against fixtures.

| Agent | Source(s) | Artifacts | Tags |
|-------|-----------|-----------|------|
| **Finance** (`fin`) | CoinGecko *(exists)* | `divergingBars` 24h %, `donut` breadth, `table` prices | tickers |
| **CyberX** (`cyb`) | CISA KEV *(exists)* | `donut` severity, `line` 7-day CVE trend, `table` CVEs | CVE IDs, vendors |
| **Operations** (`ops`) | Vercel + GitHub *(exists)* | `donut` deploy health, `table` per-project, `bars` commits | repos, build-state |
| **Marketing** (`mkt`) | **+HN +Dev.to +Vercel Analytics** | `bars` topic momentum (demand), `line` site reach, `table` content plan | topics, channels |
| **AI R&D** (`rnd`) | **+GitHub trending +HN** | `bars` repo/story momentum, `table` citations+links, `tags` trends | repos, topics |
| **CEO** (`ceo`) | aggregates company state *(no new source)* | `scorecard` 6 depts, `bars` flags/dept, `heatmap` 7-day activity, `checklist` decisions | — |

New source adapters under `src/lib/sources/`:
- `hackernews.ts` — HN Algolia search by keyword; returns `{title, url, points, comments}`. Free, no key.
- `devto.ts` — Dev.to articles by tag; returns `{title, url, reactions, comments}`. Free, no key.
- `githubTrending.ts` — trending repos by topic (reuses `GITHUB_TOKEN`); returns `{repo, stars, url}`.
- Vercel Web Analytics reach reader (in `vercelApi.ts` or a sibling) using `VERCEL_TOKEN`; **degrades gracefully** to omitting the reach artifact if unavailable.

The 7-day CVE trend (CyberX) and 7-day activity heatmap (CEO) derive from
`ownHistory` / company digest already in `AgentContext`. CEO additionally needs
a `companySnapshot` (all six dept statuses + digest) — extend `buildContext()`
to populate it; only CEO reads it.

### 3. Rendering — SVG chart primitives

New `src/components/charts/`:
- `Bars.tsx` (supports `bars` + `divergingBars`), `Line.tsx` (supports
  `line` + `sparkline`), `Donut.tsx`, `DataTable.tsx`, `Scorecard.tsx`,
  `Heatmap.tsx`, `TagCloud.tsx`, `Checklist.tsx`.
- `ArtifactRenderer.tsx` — switches on `artifact.kind` → the right primitive.

All pure SVG/HTML, server-renderable, no deps, **no `dangerouslySetInnerHTML`**.
A `compact` prop gives the dense overview-card variant vs the full detail-page
variant. Styling matches the existing glassmorphism palette.

### 4. Routing & pages

- `NavBar.tsx` — add a 6-agent sub-nav shown on dashboard routes (CEO · Finance ·
  CyberX · Marketing · R&D · Ops), plus existing Office / Overview links.
- **New route** `src/app/dashboard/[dept]/page.tsx` — server component; validates
  `dept`, reads that dept's dashboard slice, renders `AgentDetail.tsx`: hero
  (name/status/last-run) → KPI strip → `ArtifactRenderer` over `artifacts` →
  analyst narrative (`Markdown`) → flags/history → exports (MD / PDF / CSV /
  JSON). Public, read-only. Unknown dept → `notFound()`.
- `ExecDashboard.tsx` — CEO Cockpit becomes the hero; the six cards gain compact
  artifacts and link to `/dashboard/[dept]`.
- Run-now (`/api/admin/run`) stays admin-only; no public run trigger.

### 5. Knowledge base — storage, categorization, API

**Enriched `KbEntry`:**

```ts
export interface KbEntry {
  id: string;            // stable: `${dept}:${ts}`
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

Stable category map: `fin→market-brief, cyb→threat-intel, rnd→research,
mkt→content-plan, ops→ops-status, ceo→exec-brief`.

**Storage redesign** (`src/lib/redis.ts`): replace the single `kb:entries` list
of full objects with **addressable entries** so a single entry can be mutated:
- `kb:entry:<id>` — the entry JSON.
- `kb:index` — id list, newest-first, capped.
- New repo methods: `getKbEntry(id)`, `updateKbEntry(id, patch)`,
  `deleteKbEntry(id)`, `listKb({ status?, category?, dept?, q?, from?, to?,
  limit? })`. `listKb` loads the bounded set and filters **in memory** (q matches
  title/tags/markdown) — no Redis search module.
- `pushKb` writes the entry + prepends to the index.

**Migration:** legacy `kb:entries` items lack `id/status/category/tags/artifacts`.
A one-time read-time normalization (or a small migration) assigns a synthetic
`id`, `status: 'published'` (so `/api/kb` does not regress), the dept's category,
empty `tags`/`artifacts`. New entries in v1.3 default `status: 'published'` (the
draft→publish gate turns on in v1.3.1).

**APIs:**
- `/api/kb` (public) — returns **published only**; supports `?dept=&category=&q=&limit=`; includes `artifacts` so the future KB site can render charts. `getKnowledge()` in `kb.ts` gains the new filters.
- `/api/admin/kb` (v1.3.1, session-cookie gated, re-checks like `/api/admin/run`) — `GET` list-all with filters; `PATCH` publish/archive/pin/edit-tags; `DELETE`.

### 6. Admin KB Manager (v1.3.1)

`src/components/KbManager.tsx` mounted as a second section/tab in
`AdminClient.tsx`: search box + filters (dept/category/date/status), a left
folder rail (by Status, by Category with counts), entry rows (dept · title ·
category · tags · status) with row actions (view, edit tags, pin, archive,
delete, publish), and **export the filtered set** (JSON/CSV, reusing the existing
formula-injection-safe `csvCell`). Bulk actions are a stretch, default off.

---

## Phasing

**v1.3 — Core**
- `Artifact` types + `AgentRunResult`/`AgentOutput`/`KbEntry` extension +
  `runner.ts` persistence (artifacts/category/tags) — shared infra, all agents.
- SVG chart primitives + `ArtifactRenderer`.
- Finance, CyberX, Marketing artifact builders (+ HN / Dev.to / Analytics
  sources).
- CEO Executive Cockpit (overview hero) + `companySnapshot` in context.
- NavBar sub-nav + `/dashboard/[dept]` detail pages (R&D/Ops pages render but
  stay text-first this phase).
- KB storage redesign + enriched entries + published-only `/api/kb`. Entries
  auto-publish for now. **Storage migration happens once, here.**

**v1.3.1 — The rest**
- R&D Research Radar (+ `githubTrending.ts`) and Ops charts.
- Admin **KB Manager** UI + `/api/admin/kb` mutations; the draft→publish gate
  turns on.
- Bulk actions (stretch).

## Data Flow

```
cron / admin run / telegram
   └─> runner.runAgent()
         ├─ buildContext()  (+ companySnapshot for CEO)
         ├─ dept.run(ctx)
         │     ├─ fetch source data ──> toArtifacts() ─┐ deterministic
         │     │                          extractTags() ┘
         │     └─ complete()  ──> markdown (narrative only)
         └─ persist (Promise.all): status, output(+artifacts),
                history, digest, kb(+category/tags/status/artifacts), telegram
                                   │
        ┌──────────────────────────┼───────────────────────────┐
   /api/dashboard            /dashboard/[dept]              /api/kb (published)
   ExecDashboard +           AgentDetail +                  → future kb.nanote…
   CEO Cockpit               ArtifactRenderer
                                   │
                          /admin KbManager (v1.3.1) → /api/admin/kb
```

## Error Handling

- Source fetch failures are caught per-source (existing `.catch(() => [])`
  pattern); a missing source yields **no artifact for that block**, never a
  crash. Detail pages render whatever artifacts exist.
- Vercel Analytics unavailable → Marketing omits the reach `line`, keeps demand
  bars + content plan.
- Artifact builders are total functions over possibly-empty inputs (empty series
  → an empty-state in the chart component, no NaN geometry).
- Local dev without Upstash: dashboards stay empty (unchanged behaviour);
  artifact builders are independently unit-tested with fixtures, no Redis.

## Testing (vitest)

- Artifact builders & tag extractors per dept — fixture-driven, deterministic.
- New source adapters — parse fixtures (HN/Dev.to/githubTrending), graceful
  empty handling.
- KB repo against the in-memory client — `listKb` filtering (status/category/
  dept/q/date), `updateKbEntry`, publish/archive/pin, `deleteKbEntry`, legacy
  normalization.
- `getKnowledge()` published-only + filters; category map exhaustiveness over
  `DeptId`.
- Chart components have no visual unit tests (per CLAUDE.md) — verify via dev
  server + screenshots.
- Untouched contracts re-asserted by existing tests: `personas.test.ts`,
  `roles.test.ts`, footer parsing.

## Env Vars

No new **required** secrets. Reuses `GITHUB_TOKEN` (trending) and `VERCEL_TOKEN`
(analytics reach, optional/graceful). HN + Dev.to are keyless public APIs.

## Risks & Mitigations

- **Storage migration** is the riskiest change → done once in v1.3, legacy
  entries normalized to `published`, covered by repo tests before any UI.
- **Scope creep** (6 agents × charts) → phased; v1.3 ships the three priority
  agents + CEO, v1.3.1 finishes R&D/Ops + Manager.
- **Analytics API limits on Hobby** → reach artifact is optional by design.
- **Bundle size** → hand-rolled SVG keeps the dependency-light footprint.
