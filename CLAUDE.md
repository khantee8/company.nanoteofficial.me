# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Note:** This is Next.js 16 with React 19 — APIs and conventions may differ from your training data. When in doubt, read `node_modules/next/dist/docs/` or use the context7 MCP tool to fetch live docs.

## Commands

```bash
npm run dev        # dev server — http://localhost:3000
npm run build      # production build
npm run lint       # ESLint
npm test           # vitest unit tests
npx tsc --noEmit   # type-check only
```

## Architecture

**AI Company Simulator** — pixel-art isometric office with 6 AI department agents (CEO, Finance, CyberX, Marketing & Social Media, AI R&D, Operations). v1.2 (current) = real Claude agents running from detailed role specs, a two-floor office, a public **executive `/dashboard`** (glassmorphism), a private **`/admin`** console (username+password login), and a **knowledge-base store** (`kb:` + `/api/kb`). CEO + Finance work on a raised executive **mezzanine (2nd floor)**; the other four on the **ground floor** with coffee bar, snack station, break room and meeting area.

### Isometric Engine (`src/lib/iso/`)

Vanilla HTML5 Canvas isometric renderer — no game library. `camera.ts` handles world-to-screen projection; `engine.ts` manages the render loop, tile map, and sprite layering. `room.ts` `drawMezzanine()` draws the raised 2nd-floor deck (via the engine's `pz` elevation); agents carry a per-dept `elevation` (`departments.ts` `MEZZANINE_ELEVATION` / `RAISED_DEPTS`).

### Agent System (`src/lib/agents/`)

- `Agent.ts` — base agent class with state machine (idle → working → done)
- `types.ts` — shared types for agent state, tasks, artifacts
- `roles.ts` — canonical Thai role specs per department (distilled from `.agents/*.md`)
- `personas.ts` — system prompts sourced from `roles.ts` + the English `## Highlight` / `## Flags` output footer the runner parses
- `runner.ts` — orchestrates agent execution (calls Claude API, stores results)
- `ceo.ts`, `marketing.ts`, `rnd.ts`, `operations.ts`, `finance.ts` — department-specific agent modules
- `behaviours.ts` — sprite animation state mappings
- `sprites.ts` — SVG sprite definitions
- `index.ts` — agent registry

### External Integrations

- `src/lib/claude.ts` — Anthropic SDK wrapper for agent LLM calls
- `src/lib/redis.ts` — Upstash Redis for agent state and artifact persistence
- `src/lib/telegram.ts` — Telegram bot API (webhook-based, two-way messaging)
- `src/lib/sources/` — data source adapters (CoinGecko, Vercel API, GitHub API)

### API Routes (`src/app/api/`)

- `/api/cron/run` — CRON_SECRET-protected, triggers agent runs (6 daily jobs staggered UTC 10–15 in `vercel.json`)
- `/api/dashboard` — read-only payload (per-dept status/output/history + digest), via `getDashboardData()` in `src/lib/dashboard.ts`; feeds both `/dashboard` (public exec) and `/admin`
- `/api/admin/login` · `/api/admin/logout` — username+password session (signed cookie via `src/lib/auth.ts`, fails closed)
- `/api/admin/run` — POST, **session-cookie**-gated, triggers a single agent run (replaces the old `/api/dashboard/run`)
- `/api/kb` — public knowledge-base export (`?dept=`, `?limit=`), via `getKnowledge()` in `src/lib/kb.ts`; each run archives a `KbEntry` to the `kb:` Redis namespace
- `/api/agents` — returns current agent states
- `/api/feed` — returns terminal feed entries
- `/api/telegram` — Telegram webhook endpoint
- `/api/webhooks/vercel` — deploy alert webhook

### React Components (`src/components/`)

- `OfficeApp.tsx` — main app shell, polls `/api/agents`
- `OfficeCanvas.tsx` — canvas renderer for the isometric office
- `DepartmentSidebar.tsx` — department info panel
- `TerminalFeed.tsx` — real-time log display
- `NavBar.tsx` — shared responsive top nav (Office/Dashboard, mobile hamburger); `TopBar.tsx` wraps it for the office page
- `ExecDashboard.tsx` — public `/dashboard`: executive glassmorphism UI (KPI strip, glass cards, Company Pulse, PDF export)
- `AdminClient.tsx` + `AdminLogin.tsx` — private `/admin`: login form + operational console (run via `/api/admin/run`, MD/PDF/CSV export, sign out)
- `ArtifactPanel.tsx` — displays agent-generated artifacts
- `Markdown.tsx` — safe markdown renderer (no `dangerouslySetInnerHTML`)

## Env Vars (Vercel)

`ANTHROPIC_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ALLOWED_CHAT_ID`, `VERCEL_TOKEN`, `GITHUB_TOKEN`, `CRON_SECRET`, `ADMIN_USER` + `ADMIN_PASSWORD` (gate `/admin`; password falls back to legacy `DASHBOARD_PASSCODE`), `VERCEL_WEBHOOK_SECRET` (optional).

## Key Constraints

- No `dangerouslySetInnerHTML` — use the `Markdown` component for rendered content; the dashboard PDF export builds its print document with `textContent` only.
- Cron jobs are defined in `vercel.json`, not in code — 6 staggered daily runs.
- Telegram webhook requires `TELEGRAM_WEBHOOK_SECRET` for request validation.
- Agent runner depends on Redis for state — local dev without Upstash credentials will fail on agent execution.
