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

**v1.3 core** adds **structured agent artifacts** (typed `Artifact` model in `src/lib/agents/artifacts.ts`, built deterministically from each agent's source data) rendered as hand-rolled SVG charts (`src/components/charts/` → `ArtifactRenderer`). Finance/CyberX/Marketing/CEO emit charts (Marketing pulls real Hacker News + Dev.to + Vercel Analytics data; CEO's **Executive Cockpit** aggregates `companySnapshot`). A NavBar agent sub-nav lands on per-agent **`/dashboard/[dept]`** detail pages, and the exec overview gains a cockpit hero + linked cards. The knowledge base moved to **addressable storage** (`kb:entry:<id>` + `kb:index`) with `category`/`tags`/`status`/`artifacts`; `/api/kb` is **published-only** with `?dept=&category=&q=&from=&to=&limit=`. **v1.3.1 (current)** completes the set: **R&D** emits a Research Radar (trending repos via `sources/githubTrending.ts`, language donut, radar table) and **Operations** a deployment-health scorecard + repo-activity table; the **Admin KB Manager** (`KbManager.tsx` in `/admin`, backed by cookie-gated `/api/admin/kb` GET/PATCH/DELETE) curates entries, and the **draft→publish gate is on** — runs archive as `draft` and only reach the public `/api/kb` once an admin publishes. See `docs/superpowers/specs/2026-06-03-v13-smart-agents-optimal-dashboard-design.md`.

### Isometric Engine (`src/lib/iso/`)

Vanilla HTML5 Canvas isometric renderer — no game library. `camera.ts` handles world-to-screen projection; `engine.ts` manages the render loop, tile map, and sprite layering. `room.ts` `drawMezzanine()` draws the raised 2nd-floor deck (via the engine's `pz` elevation); agents carry a per-dept `elevation` (`departments.ts` `MEZZANINE_ELEVATION` / `RAISED_DEPTS`).

### Agent System (`src/lib/agents/`)

- `Agent.ts` — base agent class with state machine (idle → working → done)
- `types.ts` — shared types for agent state, tasks, artifacts
- `roles.ts` — **loads** each department's role spec verbatim from `.agents/*.md` at runtime (`readFileSync` at cold start, keyed by `DeptId` via `BRIEF_FILES`). The brief file IS the spec — no hand-copied duplicate to drift.
- `personas.ts` — system prompt = autonomous-operation preamble (adapts interactive briefs to unattended cron runs) + the `roles.ts` brief + the English `## Highlight` / `## Flags` output footer the runner parses
- `runner.ts` — orchestrates agent execution (calls Claude API, stores results); owns `DEPT_ORDER` (collaboration order) and the `## Highlight`/`## Flags` parsers
- `artifacts.ts` — the `Artifact` discriminated union + `KbCategory` + `CATEGORY_BY_DEPT` + `normalizeTags`; the shared seam every chart renderer and KB entry consumes
- `finance.ts`, `cyberx.ts`, `marketing.ts`, `rnd.ts`, `operations.ts`, `ceo.ts` — department modules. Each exports `run(ctx)` plus pure `<dept>Artifacts(...)` / `<dept>Tags(...)` builders that turn source data into `Artifact[]` **deterministically** (the LLM only writes the narrative). Mirror this when adding charts; unit-test the builder in `<dept>.artifacts.test.ts`.
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
   `PERSONAS[dept]` system prompt.
3. `parseHighlight()` / `parseFlags()` extract the `## Highlight` / `## Flags`
   sections; results then fan out in one `Promise.all` to Redis (status, output,
   history, digest, **kb**) and a Telegram notify. The KB entry is written as a
   **`draft`** (status) — the public `/api/kb` only serves `published`, so an
   admin must promote it via the KB Manager (draft→publish gate).

Agent reports are authored in **Thai** (the role specs), but the two footer
headers stay English so the parser and dashboards work regardless of body
language.

### External Integrations

- `src/lib/claude.ts` — Anthropic SDK wrapper for agent LLM calls
- `src/lib/redis.ts` — Upstash Redis for agent state and artifact persistence
- `src/lib/telegram.ts` — Telegram bot API (webhook-based, two-way messaging)
- `src/lib/sources/` — data source adapters, each with a **pure `select*`/`shape*` unit (tested) and a fetcher that swallows errors → `[]`**: `coingecko.ts` (Finance), `threatintel.ts` (CISA KEV → CyberX), `hackernews.ts` + `devto.ts` + `analytics.ts` (Marketing demand + owned reach), `githubTrending.ts` (R&D), `vercelApi.ts` + `githubApi.ts` (Operations CI/CD). HN/Dev.to/GitHub-trending are keyless; analytics/Vercel reuse `VERCEL_TOKEN` and degrade gracefully.

### API Routes (`src/app/api/`)

- `/api/cron/run` — CRON_SECRET-protected, triggers agent runs (6 daily jobs staggered UTC 10–15 in `vercel.json`)
- `/api/dashboard` — read-only payload (per-dept status/output/history + digest), via `getDashboardData()` in `src/lib/dashboard.ts`; feeds both `/dashboard` (public exec) and `/admin`
- `/api/admin/login` · `/api/admin/logout` — username+password session (signed cookie via `src/lib/auth.ts`, fails closed)
- `/api/admin/run` — POST, **session-cookie**-gated, triggers a single agent run (replaces the old `/api/dashboard/run`)
- `/api/admin/kb` — **session-cookie**-gated KB Manager CRUD: `GET` (all statuses incl. drafts), `PATCH` (status/pinned/tags/category), `DELETE`
- `/api/kb` — **published-only** public export (`?dept=&category=&q=&from=&to=&limit=`), via `getKnowledge()` in `src/lib/kb.ts`. Storage is addressable (`kb:entry:<id>` + `kb:index`); `redis.ts` owns `listKb`/`updateKbEntry`/`deleteKbEntry`/`normalizeKbEntry` and the legacy `kb:entries` read-fallback
- `/api/agents` — returns current agent states
- `/api/feed` — returns terminal feed entries
- `/api/telegram` — Telegram webhook endpoint
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
- Every agent report MUST end with `## Highlight` then `## Flags` (English headers, Thai body). `personas.ts` `OUTPUT_FOOTER` enforces this as a hard, format-overriding contract because the detailed role formats otherwise tempt the model to skip them; `personas.test.ts` guards it, and `runner.ts` parses them.
- Role specs ARE the `.agents/*.md` briefs — `roles.ts` reads them at runtime, so **edit the `.md` brief** to change an agent (then redeploy). The briefs ship to the serverless bundle via `outputFileTracingIncludes` in `next.config.ts`; without that include they won't exist at runtime and `roles.ts` throws. `roles.test.ts` asserts each `ROLES[dept]` equals its `.md` file verbatim.
- `/admin` auth is a stateless HMAC-signed session cookie (`auth.ts`, secret = `ADMIN_PASSWORD` → falls back to `DASHBOARD_PASSCODE`). There is **no middleware**: the page gates server-side via `cookies()`, and `/api/admin/run` re-checks the cookie.
- **Artifacts are deterministic** — built by the `<dept>Artifacts()` builders from source data, never by the LLM, so a chart can't be malformed or hallucinated. The model output is only the markdown narrative. Keep new charts on this path.
- **Draft→publish gate** — `runAgent()` archives KB entries as `draft`; `/api/kb` (and the future `kb.nanoteofficial.me`) only serve `published`. Promotion happens in the Admin KB Manager. Pre-v1.3.1 entries are normalized to `published` on read, so nothing already public regresses.
- Cron jobs are defined in `vercel.json`, not in code — 6 staggered daily runs.
- Telegram webhook requires `TELEGRAM_WEBHOOK_SECRET` for request validation.
- Agent runner + dashboard data depend on Redis — local dev without Upstash credentials returns empty dashboards and fails on agent execution (the office canvas still renders). Tests stub Redis with an in-memory client (see `dashboard.test.ts` / `kb.test.ts`); iso/canvas changes have no visual unit tests — verify with the dev server + screenshots.
