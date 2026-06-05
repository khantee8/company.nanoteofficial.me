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

**AI Company Simulator** — pixel-art isometric office with 6 AI department agents (CEO, Finance, CyberX, Marketing & Social Media, AI R&D, Operations). v1.3 (current) = real Claude agents running from detailed role specs, a two-floor office, a public **executive `/dashboard`** (glassmorphism), a private **`/admin`** console (username+password login), and a **knowledge-base store** (`kb:` + `/api/kb`). CEO + Finance work on a raised executive **mezzanine (2nd floor)**; the other four on the **ground floor** with coffee bar, snack station, break room and meeting area.

**v1.3 core** adds **structured agent artifacts** (typed `Artifact` model in `src/lib/agents/artifacts.ts`, built deterministically from each agent's source data) rendered as hand-rolled SVG charts (`src/components/charts/` → `ArtifactRenderer`). Finance/CyberX/Marketing/CEO emit charts (Marketing pulls real Hacker News + Dev.to + Vercel Analytics data; CEO's **Executive Cockpit** aggregates `companySnapshot`). A NavBar agent sub-nav lands on per-agent **`/dashboard/[dept]`** detail pages, and the exec overview gains a cockpit hero + linked cards. The knowledge base moved to **addressable storage** (`kb:entry:<id>` + `kb:index`) with `category`/`tags`/`status`/`artifacts`; `/api/kb` is **published-only** with `?dept=&category=&q=&from=&to=&limit=`. **v1.3.1** completes the set: **R&D** emits a Research Radar (trending repos via `sources/githubTrending.ts`, language donut, radar table) and **Operations** a deployment-health scorecard + repo-activity table; the **Admin KB Manager** (`KbManager.tsx` in `/admin`, backed by cookie-gated `/api/admin/kb` GET/PATCH/DELETE) curates entries, and the **draft→publish gate is on** — runs archive as `draft` and only reach the public `/api/kb` once an admin publishes. See `docs/superpowers/specs/2026-06-03-v13-smart-agents-optimal-dashboard-design.md`.

**v1.4.1 (current) — TH/EN bilingual.** One language toggle (`src/lib/i18n/`) switches the whole UI. UI chrome + labels come from a typed dictionary (`messages.ts`, `en`/`th` key-parity guarded by `messages.test.ts`) via `LangProvider` (`useLang()`, cookie-backed, **English-first** default, client-side so `/dashboard`'s static prerender survives) + `LangToggle` in the NavBar. **Chart titles** are authored as English literals in the builders and localized at render time by `chartTitles.ts` (`Artifact` type unchanged). **Agent reports are dual-generated**: the persona's `BILINGUAL_RULE` makes the model write its narrative in Thai, a `<!-- ===EN=== -->` delimiter, then English — before the shared findings block + footer. `splitBilingual()` (`agents/bilingual.ts`) reconstructs `{ th, en }`; the runner stores `markdown` (TH) + `markdownEn` (EN) on the KB entry and `AgentOutput` (`normalizeKbEntry` backfills `markdownEn ??= markdown`). The detail view renders `narrativeOf(pickMarkdown(output, lang))` — narrative only (highlight/flags/findings render separately, so no language-mixing). Highlight/summary stay single-language (Thai) — bilingual highlight is fast-follow. NavBar version is now read from `package.json`. See `docs/superpowers/specs/2026-06-04-v141-bilingual-design.md`.

**v1.4 — real-value web-research agents.** The six agents stop emitting thin mockup runs and produce real, cited deliverables. Each agent's `complete()` call runs with **`webSearch: true`** (Anthropic `web_search` tool) and must return a fenced ` ```json findings ` block alongside its Thai narrative; `parse<Dept>Findings()` (in each dept module) validates that block and **drops any malformed or uncited entry**. Artifacts now carry a **provenance** tag (`src/lib/agents/artifacts.ts`): `'api'` = deterministic from a real API (CISA KEV, GitHub, Vercel, company snapshot), `'web'` = researched with **mandatory citations** (`Citation {url,title,date}`); `withProvenance(a, prov, sources?)` enforces at compile time that `'web'` artifacts ship sources. The invariant flipped from "deterministic-only" to **"never uncited."** Finance became a **Thai mutual-fund analyst** (CoinGecko retired) with a rotating theme per run-day. The KB write is now a **knowledge graph**: each entry gets a stable `slug` (`deriveSlug` = `<dept>-<theme|category>-<date>`), a `theme`, real `sources`, and `related` ids (CEO's weekly synthesis cross-links the newest entry of each other dept); `getKbBySlug` resolves neighbors and `/api/kb?slug=` serves a single published entry + its graph. Agents run on a **mixed cadence** (`vercel.json`: CyberX/Ops daily, Finance Mon/Wed/Fri, R&D Tue/Thu, Marketing Mon/Thu, CEO Sun). Telegram gains an **on-demand deep-dive**: `/ask <dept> <q>` runs one-shot web research and opens a **15-min focus session** (Redis `setFocus`/`getFocus`) so plain-text follow-ups thread without a command. See `docs/superpowers/specs/2026-06-04-v14-real-value-agents-design.md`.

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
   history, digest, **kb**) and a Telegram notify. The KB entry is written as a
   **`draft`** (status) enriched with a stable `slug`, `theme`, `sources`,
   `provenance`, and `related` ids — the public `/api/kb` only serves
   `published`, so an admin must promote it via the KB Manager (draft→publish
   gate).

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
- `/api/admin/run` — POST, **session-cookie**-gated, triggers a single agent run (replaces the old `/api/dashboard/run`)
- `/api/admin/kb` — **session-cookie**-gated KB Manager CRUD: `GET` (all statuses incl. drafts), `PATCH` (status/pinned/tags/category), `DELETE`
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
- `AdminClient.tsx` + `AdminLogin.tsx` — private `/admin`: login form + operational console (run via `/api/admin/run`, MD/PDF/CSV export, sign out)
- `KbManager.tsx` — Admin KB curation panel (status filter, publish/archive/restore/pin/delete via `/api/admin/kb`)
- `ArtifactPanel.tsx` — displays agent-generated artifacts
- `Markdown.tsx` — safe markdown renderer (no `dangerouslySetInnerHTML`)

## Env Vars (Vercel)

`ANTHROPIC_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ALLOWED_CHAT_ID`, `VERCEL_TOKEN`, `GITHUB_TOKEN`, `CRON_SECRET`, `ADMIN_USER` + `ADMIN_PASSWORD` (gate `/admin`; password falls back to legacy `DASHBOARD_PASSCODE`), `VERCEL_WEBHOOK_SECRET` (optional).

## Key Constraints

- No `dangerouslySetInnerHTML` — use the `Markdown` component for rendered content; the dashboard PDF export builds its print document with `textContent` only.
- Every agent report MUST end with `## Highlight` then `## Flags` (English headers, Thai body), preceded by the v1.4 ` ```json findings ` block. `personas.ts` `OUTPUT_FOOTER` enforces the footer and `FINDINGS_CONTRACT` (inserted before it) enforces the findings block as a hard, format-overriding contract because the detailed role formats otherwise tempt the model to skip them; `personas.test.ts` guards it, `runner.ts` parses the footer, and each `parse<Dept>Findings()` parses the block.
- Role specs ARE the `.agents/*.md` briefs — `roles.ts` reads them at runtime, so **edit the `.md` brief** to change an agent (then redeploy). The briefs ship to the serverless bundle via `outputFileTracingIncludes` in `next.config.ts`; without that include they won't exist at runtime and `roles.ts` throws. `roles.test.ts` asserts each `ROLES[dept]` equals its `.md` file verbatim.
- `/admin` auth is a stateless HMAC-signed session cookie (`auth.ts`, secret = `ADMIN_PASSWORD` → falls back to `DASHBOARD_PASSCODE`). There is **no middleware**: the page gates server-side via `cookies()`, and `/api/admin/run` re-checks the cookie.
- **Artifacts are never uncited** (v1.4 — replaces the old "deterministic-only" rule). Charts are still built by the `<dept>Artifacts()` builders, never freehand by the LLM, so they can't be malformed. They carry a **provenance** tag: `'api'` (from a real API — fully deterministic) or `'web'` (from validated, **cited** findings). `withProvenance()` makes `'web'` without `sources` a compile error; `parse<Dept>Findings()` drops any entry failing `hasCitation()` (needs `url` + `date`). The LLM writes only the narrative + a findings block that is validated, never trusted raw. Keep new charts on this path.
- **Draft→publish gate** — `runAgent()` archives KB entries as `draft`; `/api/kb` (and the future `kb.nanoteofficial.me`) only serve `published`. Promotion happens in the Admin KB Manager. Pre-v1.3.1 entries are normalized to `published` on read, so nothing already public regresses.
- Cron jobs are defined in `vercel.json`, not in code — **mixed per-agent cadence** (single-dept `?dept=` dispatch, day-of-week schedules). On Vercel **Hobby**, if the dashboard rejects this many crons, consolidate into one daily dispatcher that picks today's depts from `new Date().getUTCDay()`.
- Telegram webhook requires `TELEGRAM_WEBHOOK_SECRET` for request validation; focus sessions live in Redis with a 15-min TTL (`FOCUS_TTL_MS`).
- Agent runner + dashboard data depend on Redis — local dev without Upstash credentials returns empty dashboards and fails on agent execution (the office canvas still renders). Tests stub Redis with an in-memory client (see `dashboard.test.ts` / `kb.test.ts`); iso/canvas changes have no visual unit tests — verify with the dev server + screenshots.
