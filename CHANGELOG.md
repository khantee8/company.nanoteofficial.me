# Changelog

All notable changes to this project are documented here. Versions follow
[Semantic Versioning](https://semver.org/).

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

[1.0.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.0.0
[0.2.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v0.2.0
[0.1.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v0.1.0
