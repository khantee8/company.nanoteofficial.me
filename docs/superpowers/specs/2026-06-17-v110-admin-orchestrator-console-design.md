# v1.10.0 — `/admin` Orchestrator Console

**Date:** 2026-06-17
**Status:** Approved design — ready for implementation plan
**Ships as:** company `v1.10.0`
**Companion spec:** `kb.nanoteofficial.me` Library v0.2.0 (`2026-06-17-library-v02-reader-organize-design.md`) — separate repo, separate deploy.

## Context

Today's `/admin` is a lean operator page: `AdminLogin` + `AdminClient` (run an agent, export, sign out) + `KbManager` (draft→publish gate). It works but reads as a flat utility, not a console you "operate the company" from. We are redesigning it into an orchestration console that surfaces every agent as a manageable service and makes KB curation + publish-to-Library a first-class flow.

Division of labour was settled during brainstorming: **`/admin` = orchestrator, `kb.nanoteofficial.me` = reader/library.** No reader/collections UI is duplicated into `/admin`; reading-for-reuse lives in the Library. `/admin` only needs a *review* read of drafts before publishing.

## Goals

1. A console shell (Layout B): left nav + center list + right inspector, plus a ⌘K command palette.
2. Operate each agent "like a service": run now, live telemetry, enable/disable scheduled runs, run-with-options.
3. KB curation with a review-read pane and a Publish action that **instantly syncs** the entry to the Library.
4. Keep the existing single-login, single-page, HMAC-cookie model. No middleware.

## Non-goals (deferred)

- Editing cron *schedules* at runtime — not feasible on Vercel Hobby (static `vercel.json`). Enable/Disable is the feasible substitute.
- Any reader/collections/drag-drop UI (that is the Library, Project B).
- A general config/settings engine. Run-with-options is a fixed, tiny param set.

## Architecture

### Shell

One client component `AdminConsole` (replaces `AdminClient`) rendered after the server-side cookie gate in `app/admin/page.tsx`. **Sections are in-component panels, not routes** — preserves the one-page model and avoids per-route re-auth. State: `section` ('overview' | 'agents' | 'knowledge' | 'activity'), `selectedDept`, `paletteOpen`.

- `AdminNav` — left sidebar: brand + health dot, the 4 section links (⌘1–⌘4), footer (Sync→Library status, Sign out, version from `package.json`).
- `CommandPalette` — ⌘K overlay. **Hand-rolled**, reusing the interaction pattern of the Library's `CommandSearch` (no `cmdk` dependency). Indexes: sections, the 6 agents (→ select + Agents section), KB drafts (→ Knowledge), and actions (Run <dept>, Publish…). Pure `buildPaletteIndex(dashboard, kb)` unit + a thin keyboard-driven overlay.

### Overview section
`OverviewPanel` — read-only health/cost cockpit. **Reuses** `getDashboardData()` (`dashboard.ts`), the Ops health composition (`health.ts`), and the cost ledger aggregate (`usage.ts` `aggregateUsage`). KPI tiles (agents healthy / warnings / cost MTD / last activity) + the per-agent health scorecard. No new data sources.

### Agents section
`AgentsPanel` = agent list + `AgentInspector`.

- **List**: the 6 agents with health badge (ok/warn/down from Ops health), cadence label, last-run age. Click → `selectedDept`.
- **Inspector** (`AgentInspector`), four controls:
  1. **Run now** — `POST /api/admin/run` (existing). Optimistic "running…" state; refresh on completion.
  2. **Live telemetry** (read-only) — state, last-run, cost MTD (ledger), model, truncation/error flags, latest report link, recent history. All from existing dashboard/ledger/health payloads.
  3. **Enable / Disable scheduled runs** — NEW, minimal:
     - Storage: one Redis key per dept, `agent:disabled:<dept>` ("1" = disabled). New repo methods `setAgentDisabled(dept, bool)` / `getDisabledDepts()`.
     - Enforcement: `/api/cron/run` checks the flag at the top and returns `{ ok:true, dept, skipped:'disabled' }` without running. (`/api/admin/run` ignores the flag — manual run always allowed.)
     - Control: new `PATCH /api/admin/agent` (session-cookie gated) `{ dept, disabled }`.
  4. **Run with options** — NEW, small param set only: `{ theme?: string; maxSearches?: number; model?: string }`.
     - Plumbed as an optional `overrides` argument into `runAgent()` and through to each dept module's `run(ctx, overrides?)`. Empty/absent = exactly today's behavior (no regression).
     - UI: a compact form in the inspector (theme text, searches number, model select). Submits to `POST /api/admin/run` with an `overrides` body.

### Knowledge section
`KnowledgePanel` — enhances today's `KbManager`:
- Draft/published/archived list (existing `GET /api/admin/kb`).
- **Review-read pane**: renders the selected entry with the safe `Markdown` component + `ArtifactRenderer` grid (reused from the dashboard). Read-only review — NOT the Library reader.
- Curate: set category/tags (existing PATCH), Pin/Archive/Restore/Delete (existing).
- **Publish**: existing status PATCH to `published`, then triggers the sync push (below).

### Sync push (must-have #2)
On a successful publish in `PATCH /api/admin/kb` (status → `published`):
- Fire `POST {LIBRARY_SYNC_URL}` with header `Authorization: Bearer {LIBRARY_SYNC_SECRET}` (matches the Library's `POST /api/sync` SYNC_SECRET contract — full idempotent `runSync`, so the just-published entry lands in seconds).
- **Fire-and-forget + fail-soft**: wrapped so a sync failure never fails the publish; the Library's daily cron is the backstop. Log the result for the Activity sync-log strip.
- New helper `pushLibrarySync()` in a small `src/lib/librarySync.ts` (no-op when env unset, like other integrations).

### Activity section
`ActivityPanel` — run feed (`GET /api/feed`, existing) + a sync-log strip: last push (entry, time, ok/fail) and last known Library cron. Sync results stored in a short Redis list `library:synclog` (cap ~20) written by `pushLibrarySync()`.

## API / data changes (summary)

| Change | Kind |
|---|---|
| `PATCH /api/admin/agent` `{dept,disabled}` | new route (session-gated) |
| `POST /api/admin/run` accepts optional `overrides` body | extend existing |
| `/api/cron/run` checks `agent:disabled:<dept>`, skips if set | extend existing |
| `runAgent(agent, deps, overrides?)` + dept `run(ctx, overrides?)` | extend signature, default-compatible |
| Redis: `agent:disabled:<dept>`, `library:synclog` | new keys |
| `pushLibrarySync()` fired on publish | new helper |

## Env vars (new)
- `LIBRARY_SYNC_URL` — the Library's `POST /api/sync` URL. Unset ⇒ publish works, no push (daily cron only).
- `LIBRARY_SYNC_SECRET` — bearer for that endpoint (= Library's `SYNC_SECRET`).

## Ponytail / performance posture (#7)
- **Zero new dependencies.** Hand-rolled ⌘K (reuse `CommandSearch` pattern); native browser APIs only.
- **Reuse over rebuild.** Overview + telemetry reuse `dashboard.ts`/`health.ts`/`usage.ts`; review-read reuses `Markdown` + `ArtifactRenderer`; sync reuses the Library's `runSync`.
- **Smallest new surface.** Enable flag = one Redis key checked in one place. Run-with-options = 3 optional params with default-compatible plumbing, not a config engine. Sections are panels (no route/auth multiplication).

## Testing
Framework-free `assert`-style units (vitest, matching repo convention):
- `/api/cron/run` skips when `agent:disabled:<dept>` is set; runs when unset; `/api/admin/run` ignores the flag.
- `runAgent`/dept `run` with `overrides` merges theme/maxSearches/model; absent overrides reproduce today's call.
- `pushLibrarySync()` no-ops when env unset; fail-soft on non-2xx (publish still succeeds); writes a synclog entry.
- `buildPaletteIndex()` returns expected entries for a fixture dashboard + KB set.
No visual unit tests for the console — verify via dev server + screenshots (repo convention).

## Sequencing
1. Backend-first (TDD): enable flag + cron gate; `overrides` plumbing; `pushLibrarySync` + synclog; `PATCH /api/admin/agent`.
2. Shell + nav + ⌘K.
3. Overview / Agents+Inspector / Knowledge / Activity panels.
4. Quality gates (`tsc`, `lint`, `test`, `build`) → base-deployment as v1.10.0 (bump `package.json` + CHANGELOG).
