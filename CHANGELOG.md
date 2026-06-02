# Changelog

All notable changes to this project are documented here. Versions follow
[Semantic Versioning](https://semver.org/).

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

[1.1.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.1.0
[1.0.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.0.0
[0.2.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v0.2.0
[0.1.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v0.1.0
