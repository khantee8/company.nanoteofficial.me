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

**Current version: 1.11.0** (`package.json` — the NavBar reads it). v1.11.0 ("The Company Change Agent") gives every dept a `role: 'frontend' | 'backend'`: backend depts (CEOX, OperX) never write KB, while frontend depts (FinX, CyberX, M&SX, AIX) auto-publish through a pure `qualityGate()` with instant Library sync, falling back to a draft for /admin review on anything unclean. CEOX gains a strategy cockpit (SWOT / Business Model Canvas / Five Forces `matrix` artifacts + a KPI scorecard), OperX gains a daily self-heal sweep (`?sweep=1`) that retries one failed frontend dept with safe overrides, and `GET /api/kb/graph` derives a published-only knowledge graph. Display names changed (NaNote CEO→CEOX, Finance→FinX, Marketing & Social Media→M&SX, AI R&D→AIX, Operations→OperX; CyberX unchanged) — internal dept IDs, Redis keys, cron URLs, and dashboard routes are untouched. The architecture is the cumulative result of every feature line from the **v1.3 foundation** through **v1.11**; the current release is described just below, and the full per-version history (v0.1.0 → current) lives in **`CHANGELOG.md`**. The load-bearing invariants are restated in **Key Constraints**.

**v1.11.0 (current) — backend/frontend agent roles + knowledge graph.** Every entry in `departments.ts` now carries a `role`; `runner.ts` reads it via `isFrontendDept()` to decide whether a run writes KB at all, and — for frontend depts — whether the new pure `qualityGate()` (`kbGate.ts`: finished, has a summary, carries cited material) promotes the entry straight to `published` (+ `pushLibrarySync()`) instead of the old always-`draft` path. CEOX's report now includes a `matrix` artifact (`MatrixBoard` renderer, `layout: 'swot' | 'canvas' | 'forces'`) alongside a deterministic KPI scorecard. `watchdog.ts` implements the OperX self-heal sweep behind `/api/cron/run?sweep=1` (16:00 UTC, `vercel.json`): it finds at most one frontend dept that failed today, reruns it with safe overrides (1 search, Haiku), and alerts Telegram on a repeat failure. `kbGraph.ts` `buildKbGraph()` derives typed edges (`builds_on`, `same_theme`, `shares_tag`) over published KB entries, served at `GET /api/kb/graph`.

**v1.10.0 — `/admin` orchestrator console.** The `/admin` page is rebuilt from a single scrolling dashboard into an orchestration console (`src/components/admin/`): `AdminConsole` shell + `AdminNav` left nav with four sections (Overview / Agents / Knowledge / Activity), `⌘1`–`⌘4` switching, and a hand-rolled `⌘K` `CommandPalette` (pure `adminPalette.ts` index). **Overview** = health/cost cockpit (reuses `/api/dashboard`). **Agents** = per-agent list + `AgentInspector` (telemetry, latest-report view + MD/PDF/CSV export via `admin/exporters.ts`, **Run now**, **Run with options** = `maxSearches`+`model` overrides, **enable/disable scheduled runs**). **Knowledge** = KB curation + a **safe review-read pane** (`Markdown` + `ArtifactRenderer`). **Activity** = run feed + Library sync log. Three new backend seams: an `agent:disabled:<dept>` Redis flag honored by the cron route (`PATCH`/`GET /api/admin/agent`); optional `overrides` on `AgentContext` applied by `applyOverrides()` in `claude.ts` and threaded through `runAgent`; and a fail-soft `pushLibrarySync()` (`librarySync.ts`) fired on KB publish that POSTs to the Library's `/api/sync` (`LIBRARY_SYNC_URL`/`LIBRARY_SYNC_SECRET`, no-op when unset) + a capped Redis sync log (`GET /api/admin/synclog`). `AdminClient.tsx`/`KbManager.tsx` were retired. See `docs/superpowers/specs/2026-06-17-v110-admin-orchestrator-console-design.md`.

_Earlier releases (**v0.1.0 → v1.9.0**) are summarized in [`CHANGELOG.md`](./CHANGELOG.md)._

### Isometric Engine (`src/lib/iso/`)

Vanilla HTML5 Canvas isometric renderer — no game library. `camera.ts` handles world-to-screen projection; `engine.ts` manages the render loop, tile map, and sprite layering. `room.ts` `drawMezzanine()` draws the raised 2nd-floor deck (via the engine's `pz` elevation); agents carry a per-dept `elevation` (`departments.ts` `MEZZANINE_ELEVATION` / `RAISED_DEPTS`).

### Agent System (`src/lib/agents/`)

- `Agent.ts` — base agent class with state machine (idle → working → done)
- `types.ts` — shared types for agent state, tasks, artifacts
- `roles.ts` — **loads** each department's role spec verbatim from `.agents/*.md` at runtime (`readFileSync` at cold start, keyed by `DeptId` via `BRIEF_FILES`). The brief file IS the spec — no hand-copied duplicate to drift.
- `personas.ts` — system prompt = autonomous-operation preamble (adapts interactive briefs to unattended cron runs) + the `roles.ts` brief + the English `## Highlight` / `## Flags` output footer the runner parses
- `runner.ts` — orchestrates agent execution (calls Claude API, stores results); owns `DEPT_ORDER` (collaboration order) and the `## Highlight`/`## Flags` parsers
- `artifacts.ts` — the `Artifact` discriminated union + `ArtifactMeta` (`provenance`, `sources`) + `Citation` + `withProvenance()` + `KbCategory` + `CATEGORY_BY_DEPT` + `normalizeTags`; the shared seam every chart renderer and KB entry consumes
- `findings.ts` — `extractFindingsBlock<T>(markdown)` parses the agent's ` ```json findings ` block (null on absent/malformed) and `hasCitation(x)` (requires `url` AND `date`); the citation guard each `parse<Dept>Findings()` uses to drop uncited entries
- `finance.ts`, `cyberx.ts`, `marketing.ts`, `rnd.ts`, `operations.ts`, `ceo.ts` — department modules. Each exports `run(ctx)` plus pure `<dept>Artifacts(...)` / `<dept>Tags(...)` builders **and** a `parse<Dept>Findings()` validator. Builders turn source data into `Artifact[]` **deterministically** (the LLM only writes the narrative + the findings block, which is validated, never trusted raw). `'api'` artifacts come from real APIs; `'web'` artifacts come from validated, cited findings via `withProvenance(a, 'web', sources)`. Mirror this when adding charts; unit-test the builder in `<dept>.artifacts.test.ts` (multi-item fixtures + citation-integrity asserts).
- `behaviours.ts` — sprite animation state mappings
- `sprites.ts` — SVG sprite definitions
- `index.ts` — agent registry (`AGENTS`, `isDeptId`)

### Agent run lifecycle (the core cross-file flow)

A "run" is one department executing once — triggered by Vercel cron,
`POST /api/admin/run`, or Telegram, all routing into `runner.ts` `runAgent()`:

1. **`buildContext()`** reads the dept's own history + the company digest, **plus
   the same-day outputs of departments earlier in `DEPT_ORDER`** (defined in
   `runner.ts` — deliberately distinct from the display order in
   `DEPARTMENTS`). This is how agents "collaborate": e.g. Marketing, which runs
   later, sees CyberX's CVEs from earlier the same day and builds on them.
2. The dept module (`finance.ts`, `cyberx.ts`, …) fetches live data
   (`src/lib/sources/`), then calls `complete()` (`claude.ts`) with its
   `PERSONAS[dept]` system prompt — most with **`webSearch: true`** so the agent
   researches real, current material. `parse<Dept>Findings()` then validates the
   returned findings block, dropping uncited/malformed entries before building
   the `'web'`-provenance artifacts.
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
- `src/lib/redis.ts` — Upstash Redis for agent state and artifact persistence; owns the KB graph (`deriveSlug`, `getKbBySlug`, `listKb`) and Telegram focus sessions (`setFocus`/`getFocus`/`clearFocus`)
- `src/lib/telegram.ts` — Telegram bot API (webhook-based, two-way messaging) + `FocusSession`/`isFocusLive`/`FOCUS_TTL_MS` for the 15-min deep-dive thread
- `src/lib/sources/` — data source adapters for the **`'api'`-provenance** charts, each with a **pure `select*`/`shape*` unit (tested) and a fetcher that swallows errors → `[]`**: `threatintel.ts` (CISA KEV → CyberX), `hackernews.ts` + `devto.ts` + `analytics.ts` (Marketing demand + owned reach), `githubTrending.ts` (R&D), `vercelApi.ts` + `githubApi.ts` (Operations CI/CD). HN/Dev.to/GitHub-trending are keyless; analytics/Vercel reuse `VERCEL_TOKEN` and degrade gracefully. **Finance's CoinGecko adapter was retired in v1.4** — Finance now does Thai mutual-fund research entirely via `web_search`. Real-time market/fund data beyond `web_search` is a future MCP-connector job.

### API Routes (`src/app/api/`)

- `/api/cron/run?dept=<id>` — CRON_SECRET-protected, triggers a single agent run; **mixed cadence** in `vercel.json` (CyberX/Ops daily, Finance Mon/Wed/Fri, R&D Tue/Thu, Marketing Mon/Thu, CEO Sun)
- `/api/dashboard` — read-only payload (per-dept status/output/history + digest), via `getDashboardData()` in `src/lib/dashboard.ts`; feeds both `/dashboard` (public exec) and `/admin`
- `/api/admin/login` · `/api/admin/logout` — username+password session (signed cookie via `src/lib/auth.ts`, fails closed)
- `/api/admin/run` — POST, **session-cookie**-gated, triggers a single agent run (replaces the old `/api/dashboard/run`); optional `{ overrides: { maxSearches?, model? } }` body (validated: known model + `maxSearches` 1-10)
- `/api/admin/kb` — **session-cookie**-gated KB curation CRUD: `GET` (all statuses incl. drafts), `PATCH` (status/pinned/tags/category — a `status:'published'` PATCH fires `pushLibrarySync`), `DELETE`
- `/api/admin/agent` — **session-cookie**-gated (v1.10): `GET` → disabled-dept list; `PATCH { dept, disabled }` → toggles the `agent:disabled:<dept>` cron-skip flag
- `/api/admin/synclog` — **session-cookie**-gated (v1.10) `GET` → the capped Library sync log (`library:synclog`)
- `/api/kb` — **published-only** public export. List form `?dept=&category=&q=&from=&to=&limit=` via `getKnowledge()`; single-entry form **`?slug=`** (or `?id=`) via `getKnowledgeEntry()` returns the entry + its resolved `related` graph (`src/lib/kb.ts`). Storage is addressable (`kb:entry:<id>` + `kb:index`); `redis.ts` owns `listKb`/`getKbBySlug`/`updateKbEntry`/`deleteKbEntry`/`normalizeKbEntry` and the legacy `kb:entries` read-fallback
- `/api/agents` — returns current agent states
- `/api/feed` — returns terminal feed entries
- `/api/telegram` — Telegram webhook endpoint. Beyond `/status`/`/run`, v1.4 adds `/agents` (cadence list), `/report <dept>` (latest **published** KB entry), and `/ask <dept> <q>` → one-shot `web_search` deep-dive that opens a 15-min **focus session**; subsequent plain-text messages thread as follow-ups until `/end` or TTL expiry
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

`ANTHROPIC_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ALLOWED_CHAT_ID`, `VERCEL_TOKEN`, `GITHUB_TOKEN`, `CRON_SECRET`, `ADMIN_USER` + `ADMIN_PASSWORD` (gate `/admin`; password falls back to legacy `DASHBOARD_PASSCODE`), `VERCEL_WEBHOOK_SECRET` (optional), `CLAUDE_MODEL` (optional — overrides the default `claude-haiku-4-5-20251001`; agents run on Haiku to keep spend low), `THAI_FUNDS_MCP_URL` + `THAI_FUNDS_MCP_TOKEN` (v1.6 — Finance's `thai-funds-mcp` server URL + bearer token; unset = Finance runs without MCP), `LIBRARY_SYNC_URL` + `LIBRARY_SYNC_SECRET` (v1.10 — instant publish→Library push from `/admin`; POSTs to the Library's `/api/sync`, `SECRET` = the Library's `SYNC_SECRET`; unset = no-op, the Library's daily cron is the backstop), `MONTHLY_BUDGET_USD` (optional — v1.8 budget alerting; unset/`0` = track-only). The `thai-funds-mcp` repo itself needs `SEC_API_KEY` (SEC Open Data subscription key) + `MCP_AUTH_TOKEN` (= `THAI_FUNDS_MCP_TOKEN`).

## Key Constraints

- No `dangerouslySetInnerHTML` — use the `Markdown` component for rendered content; the dashboard PDF export builds its print document with `textContent` only and clones chart nodes via `importNode` (never string parsing), with source links scheme-validated.
- Every agent report MUST OPEN with the machine-readable head: a ` ```json findings ` block, then a bilingual `## Highlight`, then a bilingual `## Flags` (English headers; Thai `<!-- ===EN=== -->` English bodies — v1.5.1), then a `---` separator, then the narrative. `personas.ts` `OUTPUT_HEAD_CONTRACT` enforces it; `personas.test.ts` guards it; `runner.ts` normalizes the emitted order back to the narrative-first storage layout via `bilingual.ts` `normalizeReportOrder()` before parsing/storing, `parseHighlight`/`parseFlags` take a `lang` param to split the bilingual head, and each `parse<Dept>Findings()` parses the block.
- Role specs ARE the `.agents/*.md` briefs — `roles.ts` reads them at runtime, so **edit the `.md` brief** to change an agent (then redeploy). The briefs ship to the serverless bundle via `outputFileTracingIncludes` in `next.config.ts`; without that include they won't exist at runtime and `roles.ts` throws. `roles.test.ts` asserts each `ROLES[dept]` equals its `.md` file verbatim.
- `/admin` auth is a stateless HMAC-signed session cookie (`auth.ts`, secret = `ADMIN_PASSWORD` → falls back to `DASHBOARD_PASSCODE`). There is **no middleware**: the page gates server-side via `cookies()`, and `/api/admin/run` re-checks the cookie.
- **Artifacts are never uncited** (v1.4 — replaces the old "deterministic-only" rule). Charts are still built by the `<dept>Artifacts()` builders, never freehand by the LLM, so they can't be malformed. They carry a **provenance** tag: `'api'` (from a real API — fully deterministic) or `'web'` (from validated, **cited** findings). `withProvenance()` makes `'web'` without `sources` a compile error; `parse<Dept>Findings()` drops any entry failing `hasCitation()` (needs `url` + `date`). The LLM writes only the narrative + a findings block that is validated, never trusted raw. Keep new charts on this path.
- **Role-gated, quality-gated publish** (v1.11 — replaces the old always-`draft` rule) — `runAgent()` checks `isFrontendDept(dept)` first: backend depts (`ceo`/`ops`, i.e. CEOX/OperX) write **no KB entry at all**. Frontend depts (`fin`/`cyb`/`mkt`/`rnd`, i.e. FinX/CyberX/M&SX/AIX) run the pure `qualityGate()` (`kbGate.ts` — finished, has a summary, carries cited material); a pass archives the entry as `published` and fires an instant `pushLibrarySync()`, a fail archives it as `draft`. `/api/kb` (and `kb.nanoteofficial.me`) only serve `published`; the Admin KB Manager remains the promotion path for anything still in `draft`. Pre-v1.3.1 entries are normalized to `published` on read, so nothing already public regresses.
- Cron jobs are defined in `vercel.json`, not in code — **mixed per-agent cadence** (single-dept `?dept=` dispatch, day-of-week schedules). On Vercel **Hobby**, if the dashboard rejects this many crons, consolidate into one daily dispatcher that picks today's depts from `new Date().getUTCDay()`.
- Telegram webhook requires `TELEGRAM_WEBHOOK_SECRET` for request validation; focus sessions live in Redis with a 15-min TTL (`FOCUS_TTL_MS`).
- Agent runner + dashboard data depend on Redis — local dev without Upstash credentials returns empty dashboards and fails on agent execution (the office canvas still renders). Tests stub Redis with an in-memory client (see `dashboard.test.ts` / `kb.test.ts`); iso/canvas changes have no visual unit tests — verify with the dev server + screenshots.
