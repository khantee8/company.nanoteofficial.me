# company.nanoteofficial.me

Live AI company simulator — **6 pixel-art agents** working together in a
two-floor isometric 3D office. Each agent is powered by Claude, runs from a
detailed role spec, and produces real daily artifacts.

**Live:** https://company.nanoteofficial.me · **Dashboard:** https://company.nanoteofficial.me/dashboard · **Version:** see [`package.json`](./package.json)

## Agents

The executives work on the raised **2nd-floor mezzanine**; the rest on the
**ground floor** with coffee bar, snack station, break room and meeting area.

| Agent | Floor | Role |
| --- | --- | --- |
| NaNote CEO | 2F | Chief of Staff — OKR/KPI tracking, daily standup, decisions |
| Finance | 2F | Fund & market analysis (data-driven, not advice) |
| CyberX | 1F | Cyber threat intel (CISA KEV + security news) |
| Marketing & Social Media | 1F | Content strategy across FB / Medium / TikTok |
| AI R&D | 1F | AI research scanning + feasibility scoring |
| Operations | 1F | System health, CI/CD and token monitoring |

## Dashboard, Admin & Knowledge Base

- **`/dashboard`** — a public **executive** dashboard (glassmorphism / soft
  gradient / neo-minimal): KPI strip, glass per-agent cards, Company Pulse feed,
  PDF export. Read-only.
- **`/admin`** — the private operations console (trigger runs, raw data, exports)
  behind a **username + password login** (`ADMIN_USER` / `ADMIN_PASSWORD`),
  using a stateless signed session cookie.
- **`/api/kb`** — public, published-only knowledge-base export (`?dept=`, `?q=`,
  `?limit=`), stored in the Neon Postgres shared with
  [kb.nanoteofficial.me](https://kb.nanoteofficial.me).

## Tech Stack
- Next.js 16, React 19, TypeScript
- Tailwind v4
- HTML5 Canvas (vanilla isometric engine — no game library)
- Anthropic Claude SDK (Message Batches) · Upstash Redis · Neon Postgres · Telegram Bot API
- Vercel (auto-deploy from `main`, Cron for scheduled agent runs)

## Scripts
- `npm run dev` — http://localhost:3000
- `npm run build`
- `npm run lint`
- `npm test` — Vitest
- `npx tsc --noEmit` — type-check

## How it works

Vercel Cron triggers `/api/cron/run` on a per-agent schedule. Each run is
submitted as an Anthropic Message Batch, collected in-request or by a
10-minute GitHub Actions backstop (`/api/cron/poll`), and persisted to Upstash
Redis (state) and Neon (knowledge base). The office UI polls `/api/agents` and `/api/feed` to reflect
live status, and a two-way Telegram bot supports `status` / `run` / `ask`.

See [`CLAUDE.md`](./CLAUDE.md) for full architecture and the
[`CHANGELOG.md`](./CHANGELOG.md) for release history.
