# Changelog

All notable changes to this project are documented here. Versions follow
[Semantic Versioning](https://semver.org/).

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

[1.2.1]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.2.1
[1.2.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.2.0
[1.1.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.1.0
[1.0.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.0.0
[0.2.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v0.2.0
[0.1.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v0.1.0
