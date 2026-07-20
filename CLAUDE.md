# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Note:** This is Next.js 16 with React 19 — APIs and conventions may differ from your training data. When in doubt, read `node_modules/next/dist/docs/` or use the context7 MCP tool to fetch live docs.

## Commands

```bash
npm run dev        # dev server — http://localhost:3000
npm run build      # production build
npm run lint       # ESLint
npm test           # vitest unit tests (single run)
npm run test:watch # vitest watch mode
npx tsc --noEmit   # type-check only

# single test
npx vitest run src/lib/kb.test.ts                 # one file
npx vitest run -t "archives entries"              # tests matching a name
npx vitest run src/lib/agents/finance.artifacts.test.ts  # a dept's chart builder
```

Chart builders are pure and tested in `src/lib/agents/<dept>.artifacts.test.ts`;
data adapters in `src/lib/sources/<name>.test.ts`. There are **no visual unit
tests** for the iso/canvas or charts — verify those with the dev server +
screenshots.

## Architecture

**AI Company Simulator** — a pixel-art, two-floor isometric office where **6 AI department agents** (CEOX, FinX, CyberX, M&SX, AIX, OperX) run real, scheduled Claude work from detailed `.agents/*.md` role specs. CEO + Finance occupy a raised executive **mezzanine (2nd floor)**; the other four the **ground floor** (coffee bar, snack station, break room, meeting area). User-facing surfaces: the live office (`/`), a public glassmorphism **`/dashboard`** + per-agent **`/dashboard/[dept]`**, a private **`/admin`** console (username+password), a bilingual **`/doc`** operator guide, a two-way **Telegram** bot, and a published-only **`/api/kb`** knowledge API.

**Current version: 1.14.0** (`package.json` — the NavBar reads it). v1.14.0 ("AI Slides") adds an admin-gated `/plan` module for one-click AI slide-deck generation: users draft presentation outlines in the web UI, the 4-step anti-slop pipeline (outline → draft → lint → critic-revise) runs on `claude-sonnet-5` via synchronous `completeRaw()`, and the Manus-split UI streams SSE thinking (left) + live deck render (right). Validated JSON deck model (8 layouts, per-layout field validation) guarantees well-formed output; per-plan version history lives in new Neon tables `plan` + `deck_version` with cost ledger at standard Sonnet rates; PPTX export via `pptxgenjs` + PDF via print CSS. v1.13.0 ("KB on Neon") moves the knowledge base's system of record off the capped-300 Redis `kb:index` list and onto a `kb_entry` table in the same Neon Postgres the Library (`kb.nanoteofficial.me`) uses: `src/lib/kbDb.ts`'s `KbStore` (fail-soft reads, throwing writes) sits behind the existing `RedisRepo` KB methods so call sites are unchanged, `/api/kb?q=` gains EN full-text (generated tsvector column) + Thai/any-substring trigram search, KB writes in `persistRunResult()` are fail-soft (a Neon outage degrades to a feed/Telegram warning, not a failed run), and the old push-based Library-sync machinery (`librarySync.ts`, `/api/admin/synclog`, sync-status UI, `LIBRARY_SYNC_URL`/`LIBRARY_SYNC_SECRET`) is deleted now that both apps read the same table. A one-shot `Bearer $CRON_SECRET`-gated `/api/admin/migrate-kb` applies the schema and backfills from both Redis and the Library's own history; Redis `kb:*` keys are kept untouched for one release as a rollback path. v1.12.2 closes the cost-ledger gap: `UsageEntry.batch` (set by the batch collector) makes `costOf()` price batch runs at the 50% Batches rate, so cost tiles and budget alerts stop overstating spend. v1.12.1 is a Finance run-quality patch on top of v1.12.0: the findings validator accepts a cited fund with partial numbers (nullable TER/AUM/1Y, per-chart filtering in `financeArtifacts`), Finance `maxTokens` is 16000, the MCP submit-fallback pushes a feed event, and `splitBilingual` no longer loses the findings/Highlight/Flags head on a truncated report (see `CHANGELOG.md`; companion `list_thai_funds` server-side-filter fix in the `thai-funds-mcp` repo). v1.12.0 ("Async Company") replaces every synchronous, timeout-bound agent run with an Anthropic **Message Batch** submission: each dept module is split into `prepare`/`finalize` halves, `submitRun()` submits one batch (50% token pricing) and self-polls in-request for ~3 minutes, and a `CRON_SECRET`-protected `/api/cron/poll` collector — driven by a 10-minute GitHub Actions schedule — is the backstop that finishes anything slower. A new `queued` agent state, Redis `PendingRun` records (with `pause_turn` continuation, a 6h staleness kill, and atomic collection claims), and `submitRunSafe` failure surfacing round out the substrate. Finance regains `web_search` alongside its `thai-funds-mcp` connector now that there's no request-duration cap forcing MCP-only. Also new: a full chibi-shonen manga sprite crew (14×18 pixel grid, six original characters) replacing the old blob sprites. The architecture is the cumulative result of every feature line from the **v1.3 foundation** through **v1.14**; the current release is described just below, and the full per-version history (v0.1.0 → current) lives in **`CHANGELOG.md`**. The load-bearing invariants are restated in **Key Constraints**.

**v1.12.0 (current) — async batch substrate + chibi shonen crew.** `asyncRun.ts` owns the batch lifecycle: `submitRun()` (called by every trigger — Vercel cron, `/api/admin/run`, Telegram `/run`) builds the request via `buildContext()`/`PREPARES[dept]`, submits an Anthropic Message Batch (`createAgentBatch`), and self-polls for up to `DEFAULT_SELF_POLL_MS` (~3 min); if the batch is still `in_progress` when the window closes, the trigger returns `{ queued: true }` and the run is picked up later. `decidePoll()` is the pure decision table (`wait` / `continue` / `finalize` / `fail`) shared by the self-poll loop and the standalone `/api/cron/poll` collector: it checks `STALE_MS` (6h) first, then a `pause_turn` stop reason (resume via `MAX_CONTINUATIONS` = 3), then hands a finished message to `collect()`, which claims the run atomically (`repo.claimPendingRun()`, `SET NX` + 10-min TTL — the loser of a self-poll/backstop-poller race skips silently) before running the same `FINALIZES[dept]` → `persistRunResult()` path a synchronous run always used. `submitRunSafe` wraps submission so an Anthropic-side failure surfaces as a normal `error` status + Telegram alert rather than a silently stuck dept. `sprites.ts` was rebuilt as six original chibi-shonen manga pixel characters (14×18 grid) per an approved mockup, replacing the old 9×11 blob sprites.

**v1.11.0 — backend/frontend agent roles + knowledge graph.** Every entry in `departments.ts` now carries a `role`; `runner.ts` reads it via `isFrontendDept()` to decide whether a run writes KB at all, and — for frontend depts — whether the pure `qualityGate()` (`kbGate.ts`: finished, has a summary, carries cited material) promotes the entry straight to `published` (+ `pushLibrarySync()`) instead of the old always-`draft` path. CEOX's report includes a `matrix` artifact (`MatrixBoard` renderer, `layout: 'swot' | 'canvas' | 'forces'`) alongside a deterministic KPI scorecard. `watchdog.ts` implements the OperX self-heal sweep behind `/api/cron/run?sweep=1` (16:00 UTC, `vercel.json`): it finds at most one frontend dept that failed today, reruns it with safe overrides (1 search, Haiku), and alerts Telegram on a repeat failure. `kbGraph.ts` `buildKbGraph()` derives typed edges (`builds_on`, `same_theme`, `shares_tag`) over published KB entries, served at `GET /api/kb/graph`.

**v1.10.0 — `/admin` orchestrator console.** The `/admin` page is rebuilt from a single scrolling dashboard into an orchestration console (`src/components/admin/`): `AdminConsole` shell + `AdminNav` left nav with four sections (Overview / Agents / Knowledge / Activity), `⌘1`–`⌘4` switching, and a hand-rolled `⌘K` `CommandPalette` (pure `adminPalette.ts` index). **Overview** = health/cost cockpit (reuses `/api/dashboard`). **Agents** = per-agent list + `AgentInspector` (telemetry, latest-report view + MD/PDF/CSV export via `admin/exporters.ts`, **Run now**, **Run with options** = `maxSearches`+`model` overrides, **enable/disable scheduled runs**). **Knowledge** = KB curation + a **safe review-read pane** (`Markdown` + `ArtifactRenderer`). **Activity** = run feed + Library sync log. Three new backend seams: an `agent:disabled:<dept>` Redis flag honored by the cron route (`PATCH`/`GET /api/admin/agent`); optional `overrides` on `AgentContext` applied by `applyOverrides()` in `claude.ts` and threaded through `runAgent`; and a fail-soft `pushLibrarySync()` (`librarySync.ts`) fired on KB publish that POSTs to the Library's `/api/sync` (`LIBRARY_SYNC_URL`/`LIBRARY_SYNC_SECRET`, no-op when unset) + a capped Redis sync log (`GET /api/admin/synclog`). `AdminClient.tsx`/`KbManager.tsx` were retired. See `docs/superpowers/specs/2026-06-17-v110-admin-orchestrator-console-design.md`.

_Earlier releases (**v0.1.0 → v1.9.0**) are summarized in [`CHANGELOG.md`](./CHANGELOG.md)._

### Isometric Engine (`src/lib/iso/`)

Vanilla HTML5 Canvas isometric renderer — no game library. `camera.ts` handles world-to-screen projection; `engine.ts` manages the render loop, tile map, and sprite layering. `room.ts` `drawMezzanine()` draws the raised 2nd-floor deck (via the engine's `pz` elevation); agents carry a per-dept `elevation` (`departments.ts` `MEZZANINE_ELEVATION` / `RAISED_DEPTS`).

### Agent System (`src/lib/agents/`)

- `Agent.ts` — base agent class with state machine (idle → working → done)
- `types.ts` — shared types for agent state, tasks, artifacts
- `roles.ts` — **loads** each department's role spec verbatim from `.agents/*.md` at runtime (`readFileSync` at cold start, keyed by `DeptId` via `BRIEF_FILES`). The brief file IS the spec — no hand-copied duplicate to drift.
- `personas.ts` — system prompt = autonomous-operation preamble (adapts interactive briefs to unattended cron runs) + the `roles.ts` brief + the English `## Highlight` / `## Flags` output footer the runner parses
- `runner.ts` — `buildContext()`, `persistRunResult()`, and the legacy synchronous `runAgent()`; owns `DEPT_ORDER` (collaboration order) and the `## Highlight`/`## Flags` parsers. `persistRunResult()` is the single post-LLM pipeline (bilingual split, role-gated KB publish, Library sync, Telegram) shared by every run path.
- `asyncRun.ts` — (v1.12) the batch run lifecycle: `submitRun()`/`submitRunSafe()` (submit + in-request self-poll), `decidePoll()` (pure `wait`/`continue`/`finalize`/`fail` decision table), `collect()` (claims a finished batch and calls `persistRunResult()`), and `pollPendingRuns()` (the standalone collector `/api/cron/poll` drives). `MAX_CONTINUATIONS` (3) and `STALE_MS` (6h) are the two caps.
- `artifacts.ts` — the `Artifact` discriminated union + `ArtifactMeta` (`provenance`, `sources`) + `Citation` + `withProvenance()` + `KbCategory` + `CATEGORY_BY_DEPT` + `normalizeTags`; the shared seam every chart renderer and KB entry consumes
- `findings.ts` — `extractFindingsBlock<T>(markdown)` parses the agent's ` ```json findings ` block (null on absent/malformed) and `hasCitation(x)` (requires `url` AND `date`); the citation guard each `parse<Dept>Findings()` uses to drop uncited entries
- `finance.ts`, `cyberx.ts`, `marketing.ts`, `rnd.ts`, `operations.ts`, `ceo.ts` — department modules. Each exports a `prepare(ctx)`/`finalize(ctx, meta, out)` pair (v1.12 — `prepare` builds the batch request, `finalize` turns the completed batch message into an `AgentRunResult`) plus a legacy combined `run(ctx)`, pure `<dept>Artifacts(...)` / `<dept>Tags(...)` builders, **and** a `parse<Dept>Findings()` validator. Builders turn source data into `Artifact[]` **deterministically** (the LLM only writes the narrative + the findings block, which is validated, never trusted raw). `'api'` artifacts come from real APIs; `'web'` artifacts come from validated, cited findings via `withProvenance(a, 'web', sources)`. Mirror this when adding charts; unit-test the builder in `<dept>.artifacts.test.ts` (multi-item fixtures + citation-integrity asserts).
- `behaviours.ts` — sprite animation state mappings
- `sprites.ts` — chibi-shonen manga pixel sprite data (v1.12 — 14×18 grid, six original characters, `spriteRects`/`spriteSvg`)
- `index.ts` — agent registry (`AGENTS`, `isDeptId`) + the v1.12 `PREPARES`/`FINALIZES` registries `asyncRun.ts` dispatches through

### Agent run lifecycle (the core cross-file flow)

A "run" is one department executing once — triggered by Vercel cron,
`POST /api/admin/run`, or Telegram, all routing into `asyncRun.ts`
`submitRun()` (v1.12 — every trigger submits a batch; see the Architecture
summary above and `asyncRun.ts` for the full submit → self-poll →
`/api/cron/poll` collector lifecycle). `submitRun()` and `collect()` both
call into the same prepare/finalize halves described below:

1. **`buildContext()`** reads the dept's own history + the company digest, **plus
   the same-day outputs of departments earlier in `DEPT_ORDER`** (defined in
   `runner.ts` — deliberately distinct from the display order in
   `DEPARTMENTS`). This is how agents "collaborate": e.g. Marketing, which runs
   later, sees CyberX's CVEs from earlier the same day and builds on them.
   `submitRun()` calls this once at submit time; `collect()` calls it again
   fresh at collection time (a batch may sit for minutes to hours, so a stale
   submit-time snapshot would understate CEOX's KPIs or miss a same-day peer
   report).
2. The dept module's **`prepare` half** (`PREPARES[dept]` — `finance.ts`,
   `cyberx.ts`, …) fetches live data (`src/lib/sources/`) and builds the
   batch request (`PERSONAS[dept]` system prompt — most with
   **`webSearch: true`** so the agent researches real, current material);
   `submitRun()` submits it as an Anthropic Message Batch and self-polls.
   Once the batch completes (in-request or via the `/api/cron/poll`
   backstop), the dept's **`finalize` half** (`FINALIZES[dept]`) runs:
   `parse<Dept>Findings()` validates the returned findings block, dropping
   uncited/malformed entries before building the `'web'`-provenance
   artifacts.
3. `parseHighlight()` / `parseFlags()` extract the `## Highlight` / `## Flags`
   sections; results then fan out in one `Promise.all` to Redis (status, output,
   history, digest, **kb** — backend depts skip the kb write entirely) and a
   Telegram notify. For frontend depts the KB entry is enriched with a stable
   `slug`, `theme`, `sources`, `provenance`, and `related` ids, then written as
   **`published`** (+ an instant `pushLibrarySync()`) when the pure
   `qualityGate()` (`kbGate.ts`) passes, or **`draft`** otherwise — the public
   `/api/kb` only serves `published`, so a failed-gate entry waits for an admin
   to promote it via the KB Manager.

Agent reports are authored in **Thai** (the role specs), but the two footer
headers stay English so the parser and dashboards work regardless of body
language.

### External Integrations

- `src/lib/claude.ts` — Anthropic SDK wrapper for agent LLM calls; supports `webSearch`/`maxSearches` to enable the `web_search` tool for research runs
- `src/lib/redis.ts` — Upstash Redis for agent state and artifact persistence, and Telegram focus sessions (`setFocus`/`getFocus`/`clearFocus`). **v1.13 — no longer owns the KB**: `makeRedisRepo(client, kb = makeKbDbStore())` delegates the six KB methods (`listKb`/`getKbBySlug`/`updateKbEntry`/`deleteKbEntry`/…, incl. `deriveSlug`) to `kbDb.ts`; the Redis `kb:*` keys are kept only as a one-release rollback, not read on the normal path
- `src/lib/kbDb.ts` — (v1.13) the KB system of record: raw SQL against the shared Neon Postgres via `@neondatabase/serverless`. `KbStore` interface + `makeKbDbStore()` (reads fail soft to `null`/`[]` with `console.warn` on a Neon outage, writes throw) + `makeMemoryKbStore()` test fake; `buildKbWhere()` builds the `/api/kb?q=` full-text/trigram WHERE clause. `db/schema.sql` is the idempotent DDL (`pg_trgm`, generated tsvector `search` column, trigram index) — applied via `/api/admin/migrate-kb`
- `src/lib/telegram.ts` — Telegram bot API (webhook-based, two-way messaging) + `FocusSession`/`isFocusLive`/`FOCUS_TTL_MS` for the 15-min deep-dive thread
- `src/lib/sources/` — data source adapters for the **`'api'`-provenance** charts, each with a **pure `select*`/`shape*` unit (tested) and a fetcher that swallows errors → `[]`**: `threatintel.ts` (CISA KEV → CyberX), `hackernews.ts` + `devto.ts` + `analytics.ts` (Marketing demand + owned reach), `githubTrending.ts` (R&D), `vercelApi.ts` + `githubApi.ts` (Operations CI/CD). HN/Dev.to/GitHub-trending are keyless; analytics/Vercel reuse `VERCEL_TOKEN` and degrade gracefully. **Finance's CoinGecko adapter was retired in v1.4** — Finance does Thai mutual-fund research via `web_search` (fund names/returns/tax type) plus the `thai-funds-mcp` connector (authoritative SEC numbers) when configured. v1.10.1 disabled `web_search` whenever MCP was set, to dodge the old synchronous request's 300s timeout; v1.12's batch substrate removes that cap, so Finance is **hybrid** again — MCP wins on conflict. The MCP fallback is submit-time only: if the Batches API rejects the MCP-connector params at submission (400 mentioning `mcp`), `submitRun` resubmits once without the connector, web_search only — there's no mid-batch-runtime fallback.

### API Routes (`src/app/api/`)

- `/api/cron/run?dept=<id>` — CRON_SECRET-protected, submits a single agent's batch run via `submitRunSafe()` (v1.12 — replies `{ queued: true }` if the self-poll window closes before the batch finishes); **mixed cadence** in `vercel.json` (CyberX/Ops daily, Finance Mon/Wed/Fri, R&D Tue/Thu, Marketing Mon/Thu, CEO Sun)
- `/api/cron/poll` — (v1.12) CRON_SECRET-protected, `pollPendingRuns()` collector for any batch whose self-poll window closed; the in-request self-poll on `/api/cron/run` is the fast path, this is the 10-minute GitHub Actions backstop (`.github/workflows/poll.yml`)
- `/api/dashboard` — read-only payload (per-dept status/output/history + digest), via `getDashboardData()` in `src/lib/dashboard.ts`; feeds both `/dashboard` (public exec) and `/admin`
- `/api/admin/login` · `/api/admin/logout` — username+password session (signed cookie via `src/lib/auth.ts`, fails closed)
- `/api/admin/run` — POST, **session-cookie**-gated, submits a single agent's batch run (v1.12 — replies `{ queued: true }` when the self-poll window closes first; replaces the old `/api/dashboard/run`); optional `{ overrides: { maxSearches?, model? } }` body (validated: known model + `maxSearches` 1-10)
- `/api/admin/kb` — **session-cookie**-gated KB curation CRUD: `GET` (all statuses incl. drafts), `PATCH` (status/pinned/tags/category), `DELETE`
- `/api/admin/agent` — **session-cookie**-gated (v1.10): `GET` → disabled-dept list; `PATCH { dept, disabled }` → toggles the `agent:disabled:<dept>` cron-skip flag
- `/api/admin/migrate-kb` — (v1.13) `POST`, `Authorization: Bearer $CRON_SECRET`-gated one-shot backfill: applies `db/schema.sql`, then backfills `kb_entry` from Redis `kb:index` (richer entries win) and the Library's own `item` history (`ON CONFLICT (id) DO NOTHING`). Returns `{ applied, fromRedis, fromLibrary }`. **Delete in v1.13.1** once run in prod
- `/api/kb` — **published-only** public export; contract unchanged from pre-v1.13. List form `?dept=&category=&q=&from=&to=&limit=` via `getKnowledge()`; single-entry form **`?slug=`** (or `?id=`) via `getKnowledgeEntry()` returns the entry + its resolved `related` graph (`src/lib/kb.ts`, `.catch(()=>[])`'d). **v1.13 — storage is the shared Neon `kb_entry` table** (`kbDb.ts`), not Redis; `q=` now does EN full-text (`websearch_to_tsquery` over the generated `search` column) OR Thai/any-substring trigram `ILIKE`, via `buildKbWhere()`
- `/api/agents` — returns current agent states
- `/api/feed` — returns terminal feed entries
- `/api/telegram` — Telegram webhook endpoint. Beyond `/status`/`/run` (v1.12: `/run` submits a batch and replies "⏳ queued" when the self-poll window closes first), v1.4 adds `/agents` (cadence list), `/report <dept>` (latest **published** KB entry — frontend depts only since v1.11), and `/ask <dept> <q>` → one-shot `web_search` deep-dive that opens a 15-min **focus session**; subsequent plain-text messages thread as follow-ups until `/end` or TTL expiry
- `/api/webhooks/vercel` — deploy alert webhook

### React Components (`src/components/`)

- `OfficeApp.tsx` — main app shell, polls `/api/agents`
- `OfficeCanvas.tsx` — canvas renderer for the isometric office
- `DepartmentSidebar.tsx` — department info panel
- `TerminalFeed.tsx` — real-time log display
- `NavBar.tsx` — shared responsive top nav; renders the per-agent sub-nav when `pathname` starts with `/dashboard`. `TopBar.tsx` wraps it for the office page
- `ExecDashboard.tsx` — public `/dashboard`: executive glassmorphism UI (KPI strip, CEO cockpit hero, glass cards that link to detail pages, Company Pulse)
- `AgentDetail.tsx` — public `/dashboard/[dept]` deep-dive (hero, KPIs, `ArtifactRenderer` grid, narrative, history, MD/PDF/JSON/CSV export)
- `charts/` — hand-rolled SVG primitives (Bars/Donut/Line/DataTable/Scorecard/Heatmap/TagCloud/Checklist) behind `ArtifactRenderer` (switch on `Artifact.kind`); zero deps, SSR-safe, empty-state safe
- `AdminLogin.tsx` + `admin/` — private `/admin` orchestrator console (v1.10, replaces the retired `AdminClient.tsx`/`KbManager.tsx`): `AdminConsole` (shell: section state, shared `/api/dashboard` fetch, ⌘K + ⌘1-4 keys) + `AdminNav` (left nav, health dot, footer sync status) + four panels — `OverviewPanel` (health/cost cockpit), `AgentsPanel`/`AgentInspector` (telemetry, Run now, Run-with-options, enable/disable), `KnowledgePanel` (curation + safe review-read), `ActivityPanel` (run feed + sync log) — plus `CommandPalette` (`adminPalette.ts` index) and `exporters.ts` (MD/PDF/CSV). UI verified via dev server only (auth-gated + Redis-backed; no visual unit tests)
- `ArtifactPanel.tsx` — displays agent-generated artifacts
- `Markdown.tsx` — safe markdown renderer (no `dangerouslySetInnerHTML`)
- `doc/` — the `/doc` user guide: `DocSidebar` (manifest-driven nav) + `DocView` (embeds both languages, toggle picks one) + `DocMarkdown` (a second **safe** renderer with URL-validated links — see `DocMarkdown.test.tsx`). Content is static MD in `content/doc/{en,th}/*.md`, loaded by `src/lib/doc.ts`, ordered by `content/doc/nav.ts`

**i18n (`src/lib/i18n/`)** — the TH/EN seam, no library: `messages.ts` (typed `en`/`th` dict, key-parity tested), `LangProvider`/`useLang` (cookie-backed, English-first; wraps the tree in `app/layout.tsx`), `LangToggle` (in NavBar), `chartTitles.ts` (render-time chart-title localization), `pickMarkdown.ts` (active-language narrative picker). Client-side so the static `/dashboard` prerender survives.

## Env Vars (Vercel)

`ANTHROPIC_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `DATABASE_URL` (or `POSTGRES_URL`; v1.13 — the shared Neon Postgres `kb_entry` lives in, same DB the Library uses; unset = KB reads/writes fail soft to empty/no-op), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ALLOWED_CHAT_ID`, `VERCEL_TOKEN`, `GITHUB_TOKEN`, `CRON_SECRET` (v1.12 — also set as a **GitHub Actions repo secret**, consumed by `.github/workflows/poll.yml`'s 10-min `/api/cron/poll` schedule; v1.13 also gates `/api/admin/migrate-kb`), `ADMIN_USER` + `ADMIN_PASSWORD` (gate `/admin`; password falls back to legacy `DASHBOARD_PASSCODE`), `VERCEL_WEBHOOK_SECRET` (optional), `CLAUDE_MODEL` (optional — overrides the default `claude-haiku-4-5-20251001`; agents run on Haiku to keep spend low), `THAI_FUNDS_MCP_URL` + `THAI_FUNDS_MCP_TOKEN` (v1.6 — Finance's `thai-funds-mcp` server URL + bearer token; unset = Finance runs without MCP), `MONTHLY_BUDGET_USD` (optional — v1.8 budget alerting; unset/`0` = track-only). The `thai-funds-mcp` repo itself needs `SEC_API_KEY` (SEC Open Data subscription key) + `MCP_AUTH_TOKEN` (= `THAI_FUNDS_MCP_TOKEN`).

## Key Constraints

- No `dangerouslySetInnerHTML` — use the `Markdown` component for rendered content; the dashboard PDF export builds its print document with `textContent` only and clones chart nodes via `importNode` (never string parsing), with source links scheme-validated.
- Every agent report MUST OPEN with the machine-readable head: a ` ```json findings ` block, then a bilingual `## Highlight`, then a bilingual `## Flags` (English headers; Thai `<!-- ===EN=== -->` English bodies — v1.5.1), then a `---` separator, then the narrative. `personas.ts` `OUTPUT_HEAD_CONTRACT` enforces it; `personas.test.ts` guards it; `runner.ts` normalizes the emitted order back to the narrative-first storage layout via `bilingual.ts` `normalizeReportOrder()` before parsing/storing, `parseHighlight`/`parseFlags` take a `lang` param to split the bilingual head, and each `parse<Dept>Findings()` parses the block.
- Role specs ARE the `.agents/*.md` briefs — `roles.ts` reads them at runtime, so **edit the `.md` brief** to change an agent (then redeploy). The briefs ship to the serverless bundle via `outputFileTracingIncludes` in `next.config.ts`; without that include they won't exist at runtime and `roles.ts` throws. `roles.test.ts` asserts each `ROLES[dept]` equals its `.md` file verbatim.
- `/admin` auth is a stateless HMAC-signed session cookie (`auth.ts`, secret = `ADMIN_PASSWORD` → falls back to `DASHBOARD_PASSCODE`). There is **no middleware**: the page gates server-side via `cookies()`, and `/api/admin/run` re-checks the cookie.
- **Artifacts are never uncited** (v1.4 — replaces the old "deterministic-only" rule). Charts are still built by the `<dept>Artifacts()` builders, never freehand by the LLM, so they can't be malformed. They carry a **provenance** tag: `'api'` (from a real API — fully deterministic) or `'web'` (from validated, **cited** findings). `withProvenance()` makes `'web'` without `sources` a compile error; `parse<Dept>Findings()` drops any entry failing `hasCitation()` (needs `url` + `date`). The LLM writes only the narrative + a findings block that is validated, never trusted raw. Keep new charts on this path.
- **Role-gated, quality-gated publish** (v1.11 — replaces the old always-`draft` rule) — `persistRunResult()` (`runner.ts`, shared by both the legacy synchronous `runAgent()` path and the async batch-collection path) checks `isFrontendDept(dept)` first: backend depts (`ceo`/`ops`, i.e. CEOX/OperX) write **no KB entry at all**. Frontend depts (`fin`/`cyb`/`mkt`/`rnd`, i.e. FinX/CyberX/M&SX/AIX) run the pure `qualityGate()` (`kbGate.ts` — finished, has a summary, carries cited material); a pass archives the entry as `published`, a fail archives it as `draft`. `/api/kb` (and `kb.nanoteofficial.me`) only serve `published`; the Admin KB Manager remains the promotion path for anything still in `draft`. Pre-v1.3.1 entries are normalized to `published` on read, so nothing already public regresses. **Storage (v1.13):** the KB's system of record is a `kb_entry` table in the shared Neon Postgres (`kbDb.ts`) — unbounded and full-text/trigram searchable, replacing the capped-300-entry Redis `kb:index` list; a run's KB write is fail-soft (a Neon outage logs a feed/Telegram warning instead of failing the run). Redis `kb:*` keys are kept untouched for one release as a rollback path, not read on the normal path.
- Cron jobs are defined in `vercel.json`, not in code — **mixed per-agent cadence** (single-dept `?dept=` dispatch, day-of-week schedules). On Vercel **Hobby**, if the dashboard rejects this many crons, consolidate into one daily dispatcher that picks today's depts from `new Date().getUTCDay()`. v1.12 adds a second, independent schedule outside Vercel: `.github/workflows/poll.yml` hits `CRON_SECRET`-protected `/api/cron/poll` every 10 minutes as the batch-collection backstop — the in-request self-poll is the fast path, so GH Actions drift/best-effort delivery is fine. Requires the `CRON_SECRET` repo secret set in GitHub Actions.
- Telegram webhook requires `TELEGRAM_WEBHOOK_SECRET` for request validation; focus sessions live in Redis with a 15-min TTL (`FOCUS_TTL_MS`).
- Agent runner + dashboard data depend on Redis — local dev without Upstash credentials returns empty dashboards and fails on agent execution (the office canvas still renders). Tests stub Redis with an in-memory client (see `dashboard.test.ts` / `kb.test.ts`); iso/canvas changes have no visual unit tests — verify with the dev server + screenshots.
- **Cost ledger & the 50% batch rate (fixed in v1.12.2):** `UsageEntry.batch` (set by the batch collector in `asyncRun.ts`) makes `costOf()` price the run at half rate. Entries recorded **before** v1.12.2 — and any legacy synchronous run — lack the flag and are priced at standard rates, so early-July history is slightly overstated (fail-safe direction). Keep new run paths setting the flag when they go through the Batches API.
