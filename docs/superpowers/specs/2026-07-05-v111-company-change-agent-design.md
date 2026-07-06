# v1.11.0 — "The Company Change Agent" Design

**Date:** 2026-07-05
**Goal:** Agent → Company Intelligence. Split the six agents into **backend**
(internal operations, `/admin`-only) and **frontend** (research → auto-published
knowledge) roles, expose the KB as a typed knowledge graph, and align the agent
company with the product roadmap (finance / cyber / kb / art subdomains).

## Decisions (locked with user, 2026-07-05)

1. **Publish gate:** frontend agents auto-publish + Library-sync **only when a
   quality gate passes**; anything less lands as `draft` for admin review.
2. **Rename scope:** display names + role specs only. Internal dept IDs
   (`ceo, fin, cyb, mkt, rnd, ops`) unchanged — zero Redis/URL migration.
3. **OperX self-heal:** auto-retry a failed dept **once** with safe overrides;
   instant Telegram alert if the retry also fails.
4. **CEOX boards:** SWOT + Business Model Canvas + Five Forces + KPI scorecard.
5. **KB graph:** derived on read (pure function + API route), no storage change.

## Naming

| Dept ID | Old name | New name | Role |
|---------|----------|----------|------|
| `ceo` | NaNote CEO | **CEOX** | backend |
| `ops` | Operations | **OperX** | backend |
| `fin` | Finance | **FinX** | frontend |
| `cyb` | CyberX | **CyberX** (unchanged) | frontend |
| `mkt` | Marketing & Social Media | **M&SX** | frontend |
| `rnd` | AI R&D | **AIX** | frontend |

Names change in `src/lib/data/departments.ts` (`name`/`shortName`), the
`.agents/*.md` role-spec briefs (persona identity), and i18n strings where the
old names appear. IDs, Redis keys, cron URLs, `/dashboard/[dept]` routes,
`CATEGORY_BY_DEPT` all stay.

## 1. Role seam (core)

`Department` (in `src/lib/data/departments.ts`) gains
`role: 'frontend' | 'backend'`. A helper `isFrontendDept(dept)` is exported for
the runner and API layers.

`runner.ts` `runAgent()` fan-out changes:

- **backend** (`ceo`, `ops`): everything as today **except** `repo.pushKb(...)`
  is skipped entirely and no Library sync ever fires. Status, output, history,
  digest, feed, cost ledger, Telegram notify unchanged — reports remain fully
  visible in `/admin` (AgentInspector) and internal context
  (`buildContext` still reads digests, so frontend agents keep seeing CEOX/OperX
  highlights — collaboration is unchanged).
- **frontend** (`fin`, `cyb`, `mkt`, `rnd`): KB entry is written with
  `status: qualityGate(result) ? 'published' : 'draft'`. On `published`,
  `pushLibrarySync(slug, repo)` fires (same fail-soft call the admin PATCH
  uses) and the Telegram notify gains a `📚 published → KB` line with the slug.
  On `draft`, notify says `📝 draft — review in /admin` so the operator knows
  curation is needed.

### Quality gate (pure, unit-tested)

`qualityGate(result: AgentRunResult): boolean` in `src/lib/agents/kbGate.ts`:

- `result.incomplete !== true` (not truncated, no zero-cited-funds Finance case
  — Finance already folds that into `incomplete`), AND
- at least one artifact with `provenance: 'web'` **or** ≥1 entry in
  `result.sources` (i.e. the run produced validated, cited findings), AND
- non-empty `summary`.

Rationale: citations are already enforced upstream by `parse<Dept>Findings()`
(`hasCitation` needs `url`+`date`), so the gate only has to check that cited
material exists and the run finished cleanly. A run that fails the gate is a
normal draft — the existing `/admin` Knowledge panel promotes it manually,
which also covers the migration story (nothing existing changes).

## 2. CEOX — strategy cockpit (backend)

CEOX's Sunday run keeps its synthesis job and adds four boards.

### New artifact kind: `matrix`

One labeled cell-grid covers all three frameworks (SWOT 2×2, Canvas 9-block,
Five Forces 5-cell):

```ts
{ kind: 'matrix'; title: string; layout: 'swot' | 'canvas' | 'forces';
  cells: { label: string; items: string[] }[] }
```

- `artifacts.ts`: add to the `Artifact` union.
- `charts/MatrixBoard.tsx`: one SSR-safe, zero-dep renderer (CSS grid; column
  template chosen by `layout`); empty-state safe like the other charts.
- `ArtifactRenderer.tsx`: new `matrix` case.
- `chartTitles.ts`: TH/EN titles for the new boards.

### Data flow

- The CEOX findings-block schema (`ceo.ts`) is extended with an optional
  `boards` object: `{ swot: { strengths, weaknesses, opportunities, threats:
  string[] }, canvas: { <9 keys>: string[] }, forces: { <5 keys>: string[] } }`.
  `parseCeoFindings()` validates shape and drops malformed/absent boards
  (fail-soft — a missing board never fails the run).
- `ceoBoardArtifacts(findings)` (pure, tested) builds the `matrix` artifacts
  deterministically from validated findings. Provenance `'api'` — boards are a
  synthesis of internal agent reports, not web claims.
- **KPI scorecard** is fully deterministic (no LLM): `ceoKpiArtifact(...)`
  builds a `scorecard` (existing kind) from real data already available to the
  run — runs succeeded last 7d (history), KB published count (kb index), cost
  MTD (v1.8 usage ledger), product list (static). Passed into the run via
  context deps like the existing source adapters.
- The CEOX brief (`.agents/ceo.md`) is updated: identity → CEOX, output
  contract gains the `boards` schema, role narrows to internal strategy
  synthesis for the operator (no public KB).

### Where it renders

`/admin` → Agents → CEOX inspector already renders `result.artifacts` through
`ArtifactRenderer`, so boards appear with **zero new admin plumbing** beyond
the `matrix` case. (They will also render on the public `/dashboard/ceo`
detail page, which keeps working as today — acceptable: boards contain
portfolio-level strategy, no secrets. Public dashboard layout is otherwise
untouched.)

## 3. OperX — watchdog + self-heal (backend)

Deterministic code does the healing; the LLM only narrates.

### Retry sweep (new, no LLM)

- `src/lib/agents/watchdog.ts`:
  - `decideRetry(statuses, retriedToday): DeptId | null` — pure. Picks **one**
    dept whose status is `error` and that has no retry recorded today
    (`agent:retried:<dept>:<yyyy-mm-dd>` Redis flag); respects the
    `agent:disabled:<dept>` flag; `ceo`/`ops` excluded (they don't research).
  - `safeOverrides(dept): RunOverrides` — pure. Conservative retry settings:
    `maxSearches: 1` and the default Haiku model (drops Finance to Haiku for
    the retry — a thin report beats a dead one; the primary next-day run is
    unaffected).
- Cron route: `GET /api/cron/run?sweep=1` (same route file, same CRON_SECRET
  guard) runs the sweep instead of a dept: decide → set retried flag → rerun
  via the existing `runAgent` path with `safeOverrides`. One dept per sweep
  keeps the invocation well inside the 300s cap.
- Outcomes → Redis sweep log (`ops:sweeplog`, capped like `library:synclog`)
  and Telegram: retry succeeded → `🔧 OperX self-heal: <dept> recovered`;
  retry failed → `🚨 OperX: <dept> failed twice — needs you` (instant alert).
- `vercel.json`: add `{ "path": "/api/cron/run?sweep=1", "schedule": "0 16 * * *" }`
  (2h after the last dept slot, so the day's failures are visible). If Vercel
  Hobby rejects a 7th cron, fall back to folding the sweep into the `ops`
  14:00 invocation (documented constraint, decided at implementation time).

### OperX report

`operations.ts` gains the sweep log as context; its brief (`.agents/ops.md`)
is updated: identity → OperX, and the report structure adds a "self-heal
actions" section (what failed, what was auto-retried, outcome, what needs the
operator). As a backend dept it no longer writes KB (role seam handles this —
no ops-specific code).

## 4. Knowledge graph

- `src/lib/kbGraph.ts` — `buildKbGraph(entries: KbEntry[]): KbGraph`, pure:

```ts
type KbNode = { id: string; slug: string; dept: DeptId;
  title: string;  // = entry summary (KB entries have no separate title field)
  category: KbCategory; theme?: string; tags: string[]; date: string };
type KbEdge = { from: string; to: string; type: 'builds_on' | 'same_theme' | 'shares_tag';
  weight: number };  // shares_tag weight = shared-tag count
type KbGraph = { nodes: KbNode[]; edges: KbEdge[] };
```

  - `builds_on`: from each entry's `related` ids (directed, weight 1).
  - `same_theme`: entries sharing a non-empty `theme` (undirected — emit one
    edge per pair, `from < to` by id).
  - `shares_tag`: ≥1 shared normalized tag; weight = number of shared tags.
  - Deduplication: if a pair already has `builds_on`, skip weaker derived
    edges for that pair.
- `GET /api/kb/graph` — **published-only** (same rule as `/api/kb`), optional
  `?dept=&category=` filters applied before building. Response
  `{ nodes, edges, generatedAt }`. Consumers: kb.nanoteofficial.me (future
  graph view), future product backends.
- KB size is tens of entries — O(n²) pair scan is fine
  (ponytail: revisit only if the KB grows to thousands).

## 5. Roadmap alignment (documented, not built)

The role seam and graph API are the hooks; no product integration ships in
v1.11.0:

- **FinX → finance.nanoteofficial.me**: future — the finance app reads FinX's
  published fund research via `/api/kb?dept=fin` + `/api/kb/graph`.
- **CyberX → cyber.nanoteofficial.me**: future — same pattern for threat intel.
- **AIX / M&SX**: general product research support via the KB.
- **All agents → kb.nanoteofficial.me**: live now via publish→sync; the graph
  endpoint is the next data structure the Library can adopt.
- **art.nanoteofficial.me**: parked (user decision).

## Explicitly out of scope

- No dept-ID/Redis/cron-URL migration; no public `/dashboard` redesign.
- No autonomous fixes beyond the one retry (no env edits, no deploys).
- No stored graph edges; no KB schema change.
- No changes to auth, `/api/kb` list/entry behavior, or Telegram commands.

## Error handling

- Quality-gate failure is not an error — it's a `draft` (existing flow).
- Library sync remains fail-soft (`pushLibrarySync` never throws; synclog +
  daily Library cron backstop).
- Sweep: a retry that throws is caught; flag already set prevents retry loops
  (max one retry per dept per day, enforced by the Redis flag written
  *before* the rerun).
- Missing/malformed CEOX boards → boards simply absent from artifacts (report
  still ships).
- `matrix` renderer: empty cells render as an empty state, never crash.

## Testing

Pure units, vitest, in-memory Redis stubs (existing pattern):

- `kbGate.test.ts` — gate truth table (incomplete / no sources / clean).
- `runner.test.ts` — backend dept skips `pushKb`; frontend publishes on gate
  pass (+ sync fired), drafts on gate fail.
- `kbGraph.test.ts` — each edge type, dedup, filters, empty KB.
- `ceo.findings.test.ts` / `ceo.artifacts.test.ts` — boards schema validation
  (malformed dropped), `matrix` builders, KPI scorecard from fixtures.
- `watchdog.test.ts` — decideRetry (error dept picked, retried-today skipped,
  disabled skipped, none → null), safeOverrides values.
- Cron route test for `?sweep=1` auth + dispatch (if route tests exist;
  otherwise covered via watchdog units + dev-server verification).
- Renames: update existing snapshot/name assertions; `roles.test.ts` keeps
  asserting brief-file identity.

UI (`MatrixBoard`, admin) verified via dev server + screenshots (no visual
unit tests — repo convention).

## Versioning & release

`package.json` → **1.11.0**, CHANGELOG entry, CLAUDE.md current-version
paragraph. Ship via the base-deployment workflow (verify → commit → push →
Vercel auto-deploy), followed by code review per the user's step-5/6 request.
