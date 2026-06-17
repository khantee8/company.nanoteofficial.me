# Changelog

All notable changes to this project are documented here. Versions follow
[Semantic Versioning](https://semver.org/).

## [1.10.0] — 2026-06-17

**`/admin` orchestrator console — manage each agent like a service.**

The `/admin` page is rebuilt from a single scrolling dashboard into an
orchestration console: a left nav with four sections (Overview / Agents /
Knowledge / Activity), a ⌘K command palette, and a per-agent inspector. KB
curation now publishes straight to the Library.

### Added
- **Console shell** (`AdminConsole` + `AdminNav`) — left-nav layout, `⌘1`–`⌘4`
  section switching, `⌘K` command palette (`CommandPalette` + pure
  `adminPalette.ts` index, agents + briefs + actions). Replaces `AdminClient`.
- **Overview panel** — health/cost cockpit (healthy/warn/down tiles, cost MTD
  from the Ops `cost & budget` artifact, last-activity, per-agent rows); reuses
  `/api/dashboard`.
- **Agents panel + inspector** — per-agent telemetry, latest-report view
  (MD/PDF/CSV export), **Run now**, **Run with options** (`maxSearches` +
  `model` overrides), and an **enable/disable scheduled runs** toggle.
- **Knowledge panel** — KB curation (publish/archive/restore/pin/delete) with a
  **safe review-read pane** (`Markdown` + `ArtifactRenderer`). Publishing fires
  the instant Library sync push.
- **Activity panel** — run feed (`/api/feed`) + Library sync log; nav footer
  shows the last sync result.
- **Enable/disable scheduled runs** — Redis flag (`agent:disabled:<dept>`)
  honored by the cron route; `PATCH`/`GET /api/admin/agent`.
- **Run-with-options** — optional `overrides` (`{ maxSearches?, model? }`) on
  `AgentContext`, applied via `applyOverrides()` and threaded through `runAgent`.
- **Instant publish→Library sync** — `pushLibrarySync()` (fail-soft, no-op when
  unset) posts to the Library's `/api/sync` on publish; capped sync log in Redis
  (`library:synclog`). New env: `LIBRARY_SYNC_URL`, `LIBRARY_SYNC_SECRET`.
  `GET /api/admin/synclog`.

### Removed
- `AdminClient.tsx` and `KbManager.tsx` — functionality migrated into the
  console panels; shared export helpers now live in `components/admin/exporters.ts`.

## [1.9.0] — 2026-06-17

**Report-quality fix — eliminate narrative truncation on web-search agents.**

The Ops internal monitor flagged CyberX/Marketing/R&D as 🟡 "report truncated
(max_tokens)". Root cause: with `webSearch: true`, the 8000-token output budget
is shared by the model's interleaved text, tool-use blocks, and the mandatory
bilingual head (findings JSON + TH/EN `## Highlight`/`## Flags`) — leaving little
or nothing for the narrative (Marketing/R&D stored only a preamble).

### Changed
- Raised the output budget for the three web-search report agents
  (CyberX/Marketing/R&D) from 8000 → 16000 via a shared
  `WEB_REPORT_MAX_TOKENS` constant in `claude.ts`. `maxTokens` is a ceiling
  billed only on tokens actually generated, so cost impact is marginal (these
  run on Haiku; MTD spend is ~$0.18). Finance stays at 8000 — its issue is the
  300s timeout, where more tokens would only add risk.

### Fixed
- Finance `maxSearches` 6 → 4 (shipped in `bd1ec51`): the heaviest run
  (Sonnet + web_search + thai-funds MCP) was timing out past 300s when
  web_search hit Anthropic rate limits.

## [1.8.0] — 2026-06-15

**Operations cost & budget monitor (v1.7 Phase 2).**

### Added
- Per-run token usage is captured into an append-only Redis ledger
  (`usage:ledger`) by the runner; new pure `src/lib/cost.ts` (per-model pricing)
  and `src/lib/agents/usage.ts` (MTD + rolling-7-day-burn aggregation, projection).
- Operations renders a per-agent **cost bars** chart and a **cost & budget**
  table (provenance `'api'`): MTD spend, tokens, 7-day burn; plus budget %, days
  left and projected month-end when a budget is set.

### Changed
- `completeRaw()` now surfaces the `model` used; all six dept modules carry
  `usage` + `model` on their run result. `health.ts` exports `worst()` for
  company-level severity composition.
- When `MONTHLY_BUDGET_USD` is set, budget status feeds the v1.7 severity system:
  🟡 at ≥80% MTD, 🔴 at ≥100% or projected month-end overrun — routed into the
  Ops summary + `## Flags` + the `🔴 OPS ALERT` Telegram. Unset/`0` ⇒ display-only.

### Env
- New optional **`MONTHLY_BUDGET_USD`** — monthly Claude-spend budget in USD.
  Unset or `≤ 0` ⇒ tracking-only (no budget alerts).

## [1.7.0] — 2026-06-14

**Operations internal monitor.** Operations now watches the company's own agents,
not just CI/CD.

### Added
- New pure module `src/lib/agents/health.ts` — `assessCompanyHealth()`,
  `overallSeverity()`, `criticalAlerts()`, `formatHealth()`, and
  `EXPECTED_CADENCE_HOURS` (mirrors the per-agent schedule in `vercel.json`).
- The Operations run emits a deterministic **`agent health` scorecard** + an
  **`agent issues` table** alongside its existing deployment-health output,
  flagging each agent's run-health: error / stale-vs-cadence / truncated / empty
  / open flags.

### Changed
- Operations leads its summary with the **worst severity** found and routes
  detected issues into `## Flags`, so they propagate into the CEO weekly digest.
- A critical finding now sends a distinct **`🔴 OPS ALERT`** Telegram message,
  separate from the normal run notice.

(spec/plan: `docs/superpowers/{specs,plans}/2026-06-14-v17-ops-internal-monitor*`)

## [1.6.0] — 2026-06-13

**Thai-fund MCP + Finance via MCP connector.**

### Added
- **`thai-funds-mcp`** — a dedicated remote MCP server (separate
  `khantee8/thai-funds-mcp` repo + Vercel project, live at
  `thaifundmcp.nanoteofficial.me`) wrapping the Thai SEC Open Data API plus
  market + FX tools (**7 tools**, each returning `sourceUrl` + `asOf` for
  citations).
- `claude.ts` `completeRaw()` gained an `mcpServers` arg that routes through the
  beta Messages API (`betas: ['mcp-client-2025-11-20']`, `mcp_servers` +
  `mcp_toolset`), preserving the streamed `pause_turn` resume + 429/5xx retry;
  web_search and the MCP connector can be combined in one request.

### Changed
- **Finance is now a hybrid** (runs on Sonnet): `web_search` for fund names / %
  returns / master fund / hedging (the SEC API exposes none of these), and the
  `thai-funds-mcp` tools for authoritative cited SEC numbers (TER, NAV+AUM, risk
  spectrum, volatility). Degrades to web-only if the env vars are unset.
  Provenance stays `'web'`; `parseFinanceFindings`/`financeArtifacts`/the draft
  gate are unchanged. Its market tool uses **Yahoo Finance** (stooq is
  datacenter-blocked).

### Env
- New `THAI_FUNDS_MCP_URL` + `THAI_FUNDS_MCP_TOKEN` (Finance's MCP server URL +
  bearer token). The `thai-funds-mcp` repo itself needs `SEC_API_KEY` +
  `MCP_AUTH_TOKEN` (= `THAI_FUNDS_MCP_TOKEN`).

(spec: `docs/superpowers/specs/2026-06-13-v16-thai-funds-mcp-design.md`)

## [1.5.2] — 2026-06-13

**PDF analyst deliverable (chart embedding).**

### Changed
- The per-agent PDF export (`AgentDetail.tsx`) grew from title→narrative→footer
  into a full deliverable: **title → verdict → flags → charts → narrative →
  sources → footer**. Body-population was extracted into a pure, jsdom-testable
  `buildPdfDoc(d, args)` (`AgentDetail.pdf.test.tsx`).
- Charts are embedded by **cloning the live on-screen `.agent-art` nodes**
  (`importNode`, a real node copy — no `innerHTML`), so every chart kind (SVG +
  HTML) is captured and future kinds auto-track; they render as dark panels with
  `print-color-adjust: exact`. Verdict/flags/sources are built `textContent`-only
  in the active language; source links are scheme-validated (`safeHref`).

(spec: `docs/superpowers/specs/2026-06-13-v152-pdf-chart-embedding-design.md`)

## [1.5.1] — 2026-06-13

**Bilingual highlight + flags.**

### Added
- The model now emits a **bilingual `## Highlight` and `## Flags`** in the head
  (Thai `<!-- ===EN=== -->` English); `parseHighlight`/`parseFlags` gained a
  `lang` param that splits on the delimiter (fallback to Thai). `DigestEntry`/
  `KbEntry` gained optional `highlightEn`/`flagsEn` (backfilled from the Thai
  fields in `normalizeKbEntry`).

### Changed
- `ExecDashboard`/`AgentDetail` pass the active `lang` to the parsers, so the
  dashboard verdict + flags switch with the toggle. `summary` stays Thai
  (code-built status string).

(spec: `docs/superpowers/specs/2026-06-13-v151-bilingual-highlight-flags-design.md`)

## [1.5.0] — 2026-06-12

**Analyst-report rollout + findings-first contract.**

### Changed
- **Findings-first head:** all six agents now OPEN with the machine-readable head
  (` ```json findings ` → `## Highlight` → `## Flags` → `---`) before the
  narrative, so a `max_tokens` cut can't destroy the chart/KB data or the verdict.
  `personas.ts` merged `FINDINGS_CONTRACT`+`OUTPUT_FOOTER` into
  `OUTPUT_HEAD_CONTRACT`; `bilingual.ts` `normalizeReportOrder()` (called once in
  `runner.ts`) reassembles to the legacy narrative-first storage shape, so
  dashboards/exports/`/api/kb`/pre-v1.5 entries are untouched.
- **Analyst templates:** the five non-finance briefs gained an appended
  "โครงสร้างรายงานฉบับวิเคราะห์" section (verdict box → comparison table →
  per-item analysis → recommendations → risks → sources), with full dual TH/EN
  reports at `maxTokens: 8000` (Finance keeps its v1.4.5 mode).

### Added
- **Chat personas:** Telegram `/ask` + focus follow-ups use new scaffolding-free
  `CHAT_PERSONAS` so chat answers don't lead with a JSON block.

(spec: `docs/superpowers/specs/2026-06-12-v150-analyst-rollout-design.md`)

## [1.4.11] — 2026-06-12

### Fixed
- Operations' deployment scorecard was all-`UNKNOWN`: the projects live under a
  Vercel **team**, and `/v6/deployments` without `teamId` queries the empty
  personal scope. `vercelApi.ts` now resolves the token's team id once
  (`resolveTeamId`, cached per lambda, null-safe for personal tokens) and scopes
  the query (`deploymentsUrl`, unit-tested).

## [1.4.10] — 2026-06-12

### Fixed
- Haiku is far more verbose than Sonnet, so the old 1200–1800 `maxTokens` budgets
  silently truncated reports at `max_tokens` — emptying the highlight and
  dropping citations (written last). The five non-finance dept modules now mirror
  Finance: `completeRaw()`, `maxTokens: 4000`,
  `incomplete: stopReason === 'max_tokens'`, `stopReason` in `meta`, with per-dept
  truncation tests.

## [1.4.9] — 2026-06-12

### Fixed
- `web_search_20260209` ships dynamic filtering (requires programmatic tool
  calling — unsupported on Haiku), so every web-research run 400'd. The tool
  declaration in `claude.ts` now sets `allowed_callers: ['direct']` (this wrapper
  only ever calls it directly anyway).

## [1.4.8] — 2026-06-12

### Fixed
- A run hard-killed by the Vercel 300s function timeout never reaches the
  runner's catch, leaving `running` stuck in Redis forever. `redis.ts`
  `normalizeStatus()` now reads any `running` older than `STALE_RUNNING_MS`
  (15 min) as `error: "run interrupted…"` — self-healing on read, no write needed.

## [1.4.7] — 2026-06-09

**Finance research-failure visibility + `pause_turn` resumption.**

### Fixed
- A Finance run that completed (`end_turn`) but produced **zero citation-backed
  funds** (usually `web_search` rate-limited mid-run) was stored looking clean.
  `finance.ts` now flags it `incomplete` (`max_tokens || noCitedFunds`) with an
  explicit Thai summary, so it stays gated as `draft` and Telegram warns;
  `runner.ts`'s warning generalized to "รายงานอาจไม่สมบูรณ์".
- `completeRaw()` previously returned a `pause_turn` partial as if done. It now
  resumes the turn (re-sends the assistant content verbatim), bounded by
  `MAX_PAUSE_RESUMES = 4`, concatenating text + summing usage (extracted
  `streamOnce()` keeps the per-request 429/5xx retry).

## [1.4.6] — 2026-06-09

### Fixed
- The on-screen `Markdown.tsx` renderer rendered markdown tables as raw `|` pipe
  text, making the v1.4.5 Finance comparison table unreadable. It now parses pipe
  tables into a real `<table>` (header + `|---|` divider detection,
  horizontal-scroll wrapper) and renders inline `**bold**` as `<strong>` — still
  no `dangerouslySetInnerHTML`. `Markdown.test.tsx` guards it.

## [1.4.5] — 2026-06-09

**Finance analyst-grade report.**

### Added
- `claude.ts` `completeRaw()` — a streamed completion (`messages.stream()` →
  `finalMessage()`) surfacing `stop_reason` + `usage`; `complete()` now wraps it.
  Streaming avoids HTTP timeouts on the large `max_tokens` an analyst report needs.
- An `incomplete` flag carried end-to-end on `AgentRunResult`/`AgentOutput`/the KB
  entry; `runner.ts` persists it and the Telegram notice warns on a `max_tokens`
  cut (the run still archives as `draft`).
- `financeArtifacts()` gained an **AUM bars** chart + a **tax-type donut**.

### Changed
- The Finance agent now produces a complete, sectioned, cited Thai mutual-fund
  analyst report (~2,000–2,800 words) + a short English summary, via a
  Finance-only `FINANCE_BILINGUAL_RULE` in `personas.ts` and a sectioned analyst
  template authored into `.agents/Finance Agent.md`.
- `AgentDetail.tsx` `exportPdf` now walks the markdown into structured HTML
  (`textContent` only) with a cover + footer instead of a `<pre>` dump.

(spec: `docs/superpowers/specs/2026-06-05-v15-finance-analyst-report-design.md`)

## [1.4.3] — 2026-06-05

**Reading-optimized UI/UX.**

### Changed
- A readability pass across every text surface (office animation untouched).
  Global body font moved from `'Courier New'` to **Inter** (`next/font`); the
  office shell is re-scoped to mono to keep the retro terminal theme.
- Fixed a "loses content" height miscalc — `.exec`/`.dash` hardcoded
  `calc(100vh - 44px)` and ignored the 41px agent sub-nav; both now
  `flex:1; min-height:0` with `100dvh` wrappers.
- Agent narrative (`Markdown.tsx`) lifted to 15px/1.7 with a 72ch reading
  measure; KPI labels/tags and office sidebar text lifted toward AA contrast.

(plan: `docs/superpowers/plans/2026-06-05-v143-readability-uiux.md`)

## [1.4.2] — 2026-06-04

**`/doc` user guide.**

### Added
- A built-in operator guide at `/doc` (GitHub-Docs theme): static MD in
  `content/doc/{en,th}/<slug>.md` with a `content/doc/nav.ts` manifest.
  `src/lib/doc.ts` reads them (en-fallback); `next.config.ts`
  `outputFileTracingIncludes` ships `content/doc/**`. Routes: layout + overview +
  SSG `[slug]` (`dynamicParams:false`). `DocMarkdown` is a second safe renderer
  (URL-validated links). `/doc` added to the NavBar.

(spec: `docs/superpowers/specs/2026-06-04-v142-doc-user-guide-design.md`)

## [1.4.1] — 2026-06-04

**TH/EN bilingual.**

### Added
- One language toggle (`src/lib/i18n/`) switches the whole UI: typed `messages.ts`
  dict (key-parity tested), `LangProvider`/`useLang` (cookie-backed, English-first,
  client-side so `/dashboard`'s static prerender survives), `LangToggle` in the
  NavBar, and render-time chart-title localization (`chartTitles.ts`).

### Changed
- **Agent reports are dual-generated**: `BILINGUAL_RULE` makes the model write
  Thai, a `<!-- ===EN=== -->` delimiter, then English; `splitBilingual()`
  reconstructs `{ th, en }`; the runner stores `markdown` (TH) + `markdownEn` (EN).
  The detail view renders narrative-only per language. NavBar version is now read
  from `package.json`.

(spec: `docs/superpowers/specs/2026-06-04-v141-bilingual-design.md`)

## [1.4.0] — 2026-06-04

**Real-value web-research agents.**

### Changed
- The six agents stop emitting thin mockup runs and produce real, cited
  deliverables. Each `complete()` runs with `webSearch: true` and must return a
  fenced ` ```json findings ` block; `parse<Dept>Findings()` validates it and
  drops any malformed/uncited entry.
- Artifacts now carry a **provenance** tag: `'api'` (deterministic from a real
  API) or `'web'` (researched with mandatory `Citation`s); `withProvenance()`
  makes `'web'` without sources a compile error. The invariant flipped from
  "deterministic-only" to **"never uncited."**
- Finance became a Thai mutual-fund analyst (CoinGecko retired). The KB write is
  now a knowledge graph (stable `slug`, `theme`, `sources`, `related` ids; the CEO
  weekly synthesis cross-links). Agents run on a mixed cadence (`vercel.json`).

### Added
- Telegram on-demand deep-dive: `/ask <dept> <q>` runs one-shot web research and
  opens a 15-min focus session (Redis `setFocus`/`getFocus`) so plain-text
  follow-ups thread without a command.

(spec: `docs/superpowers/specs/2026-06-04-v14-real-value-agents-design.md`)

## [1.3.1] — 2026-06-03

**Smart Agents & Optimal Dashboard (the rest).** Completes v1.3: the last two
agents gain charts, and the knowledge base becomes a curated, admin-managed
store with a real draft→publish gate.

### Added
- **R&D Research Radar** — trending-repo bars (stars/14d), language-mix donut and
  a research-radar table, built deterministically from a new free
  `sources/githubTrending.ts` (GitHub Search API, keyless; uses `GITHUB_TOKEN`
  when present). The brief now anchors itself in the day's trending repos.
- **Operations charts** — a deployment-health scorecard (ok/warn/down per project)
  and a repo-activity table, from the existing Vercel + GitHub CI/CD sources.
- **Admin KB Manager** (`/admin`) — a Knowledge Base panel to curate agent
  output: filter by status (draft/published/archived), **publish**, archive,
  restore, pin/unpin and delete entries. Backed by a new cookie-gated
  `/api/admin/kb` (`GET` all statuses, `PATCH` status/pinned/tags/category,
  `DELETE`).

### Changed
- **Draft→publish gate is now on.** Agent runs archive to the knowledge base as
  **`draft`** instead of auto-publishing; entries surface on the public
  `/api/kb` only after an admin publishes them. Pre-v1.3.1 entries keep their
  stored status (already-published ones stay visible).

## [1.3.0] — 2026-06-03

**Smart Agents & Optimal Dashboard (core).** Agents now emit structured research
data rendered as charts/tables/infographics, reachable through a per-agent
navigation and a refreshed executive overview; the knowledge base gains
categories, tags, status and artifacts on addressable storage.

### Added
- **Structured artifacts** — a typed `Artifact` model (`src/lib/agents/artifacts.ts`):
  diverging/standard bars, donut, line/sparkline, table, scorecard, heatmap,
  tag cloud, checklist. Built **deterministically from each agent's source data**
  (the LLM writes only the narrative), persisted to `AgentOutput` and the
  knowledge base by the runner.
- **Hand-rolled SVG chart primitives** (`src/components/charts/`) behind an
  `ArtifactRenderer` — zero dependencies, SSR-safe, no `dangerouslySetInnerHTML`.
- **Per-agent data representation**:
  - **Finance** — 24h diverging bars, market-breadth donut, price table (CoinGecko).
  - **CyberX** — coarse-severity donut (keyword heuristic, no fabricated CVSS),
    new-CVE-per-day trend, KEV table (CISA KEV).
  - **Marketing** — topic-momentum bars (demand) from **Hacker News + Dev.to**,
    site-reach line from **Vercel Web Analytics** (graceful when unavailable),
    content-plan table.
  - **CEO Executive Cockpit** — department health scorecard, open-flags-by-dept
    bars, 7-day activity heatmap, decisions checklist — aggregated from the
    company's own state (`companySnapshot`, no new source).
- **Agent sub-nav + per-agent detail pages** at `/dashboard/[dept]` — public,
  read-only deep-dives (hero, KPIs, charts, analysis, history, MD/PDF/JSON/CSV
  export). Invalid departments 404.
- **Executive overview refresh** — CEO cockpit hero band; agent cards now carry a
  compact chart and link into the detail pages.
- New free source adapters: `sources/hackernews.ts`, `sources/devto.ts`,
  `sources/analytics.ts` (no new required secrets).

### Changed
- **Knowledge base storage** moved from a single flat `kb:entries` list to
  individually addressable entries (`kb:entry:<id>` + a `kb:index`), so single
  entries can be published/archived/pinned/edited/deleted (the v1.3.1 Admin KB
  Manager builds on this). Entries gain `id`, `category`, `tags`, `status`,
  `artifacts`. Pre-v1.3 entries are normalized on read.
- `/api/kb` is now **published-only** and supports `?dept=&category=&q=&from=&to=&limit=`,
  returning artifacts for the future `kb.nanoteofficial.me`.
- CyberX now runs on the default **Sonnet 4.6** (dropped the Haiku override).

### Deferred to v1.3.1
- R&D Research Radar (+ GitHub trending) and Operations charts.
- Admin **KB Manager** UI + `/api/admin/kb` mutations + the draft→publish gate.

## [1.2.1] — 2026-06-02

### Fixed
- Agents with prescriptive role formats (notably CyberX, and the CEO's Flags)
  were ending on their own format and skipping the `## Highlight` / `## Flags`
  footer the runner parses. Reworded the footer in `personas.ts` as a hard,
  format-overriding **output contract** so every agent reliably emits both
  sections (English headers, Thai body). Added `personas.test.ts` to lock it in.
  Takes effect on each agent's next run.

## [1.2.0] — 2026-06-02

Split the public showcase from the private operations console, and stood up the
knowledge-base store.

### Added
- **Public executive dashboard** at `/dashboard` — a redesigned, read-only,
  data-driven view (Modern SaaS + soft gradient + **glassmorphism** + neo-minimal)
  with a KPI strip, glass per-agent cards (status, highlight, flags, latest
  artifact via the safe `Markdown` renderer, history sparkline), a Company Pulse
  feed, and per-agent PDF export.
- **Admin console** at `/admin` — the operational view (trigger runs, inspect
  raw data, exports) now behind a **username + password login** with a
  stateless, signed session cookie (`src/lib/auth.ts`, httpOnly/Secure/SameSite,
  12h). Server-side gated; `POST /api/admin/{login,logout,run}`.
- **Knowledge base store** — every agent run is archived to Redis (`kb:` namespace),
  exposed via **`GET /api/kb`** (`?dept=`, `?limit=`) as the stable seam for a
  future `kb.nanoteofficial.me`.

### Changed
- The old public `/dashboard` (which mixed public view + owner run controls)
  became the private `/admin`; `/api/dashboard/run` → `/api/admin/run` (now
  cookie-authed instead of a Bearer passcode). `GET /api/dashboard` (read) stays.

### Env
- New `ADMIN_USER` + `ADMIN_PASSWORD` (the password **falls back to the existing
  `DASHBOARD_PASSCODE`**, so only `ADMIN_USER` is strictly new). Login fails
  closed when unset.

## [1.1.0] — 2026-06-02

Role-driven company with an owner control surface.

### Added
- **Company Dashboard** at `/dashboard` — a public, data-driven view of every
  agent's latest artifact, highlight, flags, status and 7-day history, with
  per-agent **export** (Markdown / print-to-PDF / history CSV). Owner-only
  "Run now / regenerate" actions are gated by a `DASHBOARD_PASSCODE` and call
  the agent runner directly (`POST /api/dashboard/run`); `GET /api/dashboard`
  serves the read-only payload.
- **Canonical agent roles** — each agent now runs from the detailed role specs
  in `.agents/*.md` (Thai), producing structured daily reports per its defined
  workflow, rubric and hand-offs (`src/lib/agents/roles.ts`). The English
  `## Highlight` / `## Flags` section headers are preserved for parsing.
- **Two-floor office** — CEO and Finance work on a raised executive **mezzanine
  (2nd floor)** with railing and a connecting stair; CyberX, Marketing & Social
  Media, AI R&D and Operations work on the **ground floor**, alongside new
  facilities: a coffee bar, snack station, expanded break room and meeting area.
- **Responsive navbar** — shared `NavBar` with Office/Dashboard links, a `v1.1`
  badge and live status; collapses to a hamburger menu on mobile (≤640px).

### Changed
- Renamed departments: **Marketing → Marketing & Social Media**, **R&D → AI R&D**.
- Sidebar groups the executives (CEO, Finance) first.

### Env
- New `DASHBOARD_PASSCODE` — required to enable dashboard "Run now" actions
  (the gate fails closed when unset).

## [1.0.0] — 2026-06-02

First stable release. The AI company simulator is feature-complete: six
real Claude-powered department agents producing daily artifacts in a live
isometric office, with persistent state, a two-way Telegram bot, and CI/CD
deploy alerts.

### Highlights
- **Six live agents** — CEO, CyberX, Marketing, R&D, Operations, Finance —
  each with its own persona, workspace zone, and daily artifact output.
- **Real Claude runs** via Vercel Cron (staggered daily, UTC 10–15), with
  per-agent model selection (CyberX runs on Claude Haiku, token-capped).
- **Living office** — agent memory, cross-department collaboration, and
  sprite-driven visual life in the isometric engine.
- **Persistent state** in Upstash Redis (agent status + artifacts).
- **Two-way Telegram bot** — `status` / `run` / `ask`, secret + chat
  allowlist, async via `after()`.
- **Deploy alerts** — Vercel webhook → Telegram CI/CD notifications.
- **Safe rendering** — custom Markdown component, no `dangerouslySetInnerHTML`.

### Changed
- Office widened to six zones; TopBar reports "6 AGENTS LIVE" and shows a
  `v1.0` version badge.

## [0.4.0] — CyberX

- Added **CyberX**, a sixth security/threat-intel agent (CISA KEV +
  security news), running first in the daily order on Claude Haiku.
- Threat-intel source adapter; `cyb` department registered across DeptId
  maps; office widened to six zones with a CyberX workspace.

## [0.3.0] — Living Company

- Agent memory, cross-department collaboration, and richer visual life in
  the isometric office.

## [0.2.0] — 2026-05-28

- Real Claude agents producing daily artifacts via Vercel Cron.
- Anthropic client wrapper (retry + web-search option), Upstash Redis repo,
  five department agents + registry, CoinGecko / Vercel / GitHub data
  sources.
- API routes: `/api/cron/run` (secret-protected), `/api/agents`,
  `/api/feed`, `/api/telegram` webhook, `/api/webhooks/vercel` deploy alerts.
- Two-way Telegram bot and deploy → Telegram alerts.

## [0.1.0] — 2026-05-27

- Visual MVP: vanilla HTML5 Canvas isometric engine + camera, office room
  rendering (floor, walls, windows, furniture, lighting), five-department
  sidebar, scrolling terminal feed, branded favicon, and SEO metadata.

[1.8.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.8.0
[1.7.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.7.0
[1.6.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.6.0
[1.5.2]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.5.2
[1.5.1]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.5.1
[1.5.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.5.0
[1.4.11]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.4.11
[1.4.10]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.4.10
[1.4.9]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.4.9
[1.4.8]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.4.8
[1.4.7]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.4.7
[1.4.6]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.4.6
[1.4.5]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.4.5
[1.4.3]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.4.3
[1.4.2]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.4.2
[1.4.1]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.4.1
[1.4.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.4.0
[1.3.1]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.3.1
[1.3.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.3.0
[1.2.1]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.2.1
[1.2.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.2.0
[1.1.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.1.0
[1.0.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.0.0
[0.2.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v0.2.0
[0.1.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v0.1.0
