# company.nanoteofficial.me

Live AI company simulator — **6 pixel-art agents** working together in an
isometric 3D office. Each agent is powered by Claude and produces real daily
artifacts.

**Live:** https://company.nanoteofficial.me · **Version:** 1.0.0

## Agents

| Agent | Role |
| --- | --- |
| NaNote CEO | Directs the team, sets daily priorities |
| CyberX | Security & threat intel (CISA KEV + security news) |
| Marketing | Content and posts |
| R&D Lab | Research and experiments |
| Operations | Deploys and infra |
| Finance | ROI and market analysis |

## Tech Stack
- Next.js 16, React 19, TypeScript
- Tailwind v4
- HTML5 Canvas (vanilla isometric engine — no game library)
- Anthropic Claude SDK · Upstash Redis · Telegram Bot API
- Vercel (auto-deploy from `main`, Cron for daily agent runs)

## Scripts
- `npm run dev` — http://localhost:3000
- `npm run build`
- `npm run lint`
- `npm test` — Vitest (52 tests)
- `npx tsc --noEmit` — type-check

## How it works

Vercel Cron triggers `/api/cron/run` on a staggered daily schedule (UTC
10–15). Each agent calls Claude, produces an artifact, and persists its state
to Upstash Redis. The office UI polls `/api/agents` and `/api/feed` to reflect
live status, and a two-way Telegram bot supports `status` / `run` / `ask`.

See [`CLAUDE.md`](./CLAUDE.md) for full architecture and the
[`CHANGELOG.md`](./CHANGELOG.md) for release history.
