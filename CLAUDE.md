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

**AI Company Simulator** — pixel-art isometric office with 5 AI department agents (CEO, Marketing, R&D, Operations, Finance). v0.1 = visual MVP with simulated logs. v0.2 = real Claude agents producing daily artifacts via Vercel Cron.

### Isometric Engine (`src/lib/iso/`)

Vanilla HTML5 Canvas isometric renderer — no game library. `camera.ts` handles world-to-screen projection; `engine.ts` manages the render loop, tile map, and sprite layering.

### Agent System (`src/lib/agents/`)

- `Agent.ts` — base agent class with state machine (idle → working → done)
- `types.ts` — shared types for agent state, tasks, artifacts
- `personas.ts` — personality/prompt definitions per department
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

- `/api/cron/run` — CRON_SECRET-protected, triggers agent runs (5 daily jobs staggered UTC 11–15 in `vercel.json`)
- `/api/agents` — returns current agent states
- `/api/feed` — returns terminal feed entries
- `/api/telegram` — Telegram webhook endpoint
- `/api/webhooks/vercel` — deploy alert webhook

### React Components (`src/components/`)

- `OfficeApp.tsx` — main app shell, polls `/api/agents`
- `OfficeCanvas.tsx` — canvas renderer for the isometric office
- `DepartmentSidebar.tsx` — department info panel
- `TerminalFeed.tsx` — real-time log display
- `TopBar.tsx` — header/navigation
- `ArtifactPanel.tsx` — displays agent-generated artifacts
- `Markdown.tsx` — safe markdown renderer (no `dangerouslySetInnerHTML`)

## Env Vars (Vercel)

`ANTHROPIC_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ALLOWED_CHAT_ID`, `VERCEL_TOKEN`, `GITHUB_TOKEN`, `CRON_SECRET`, `VERCEL_WEBHOOK_SECRET` (optional).

## Key Constraints

- No `dangerouslySetInnerHTML` — use the `Markdown` component for rendered content.
- Cron jobs are defined in `vercel.json`, not in code — 5 staggered daily runs.
- Telegram webhook requires `TELEGRAM_WEBHOOK_SECRET` for request validation.
- Agent runner depends on Redis for state — local dev without Upstash credentials will fail on agent execution.
