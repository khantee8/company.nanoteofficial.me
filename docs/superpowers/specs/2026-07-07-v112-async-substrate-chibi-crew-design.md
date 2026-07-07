# v1.12 — "Async Company + Chibi Crew" Design

**Date:** 2026-07-07
**Goal:** (1) Move all six agent runs onto an asynchronous execution substrate
(Anthropic Message Batches API) so the 300-second serverless ceiling can never
kill a run again — the failure class that has broken Finance since June. (2)
Redesign the office pixel agents as original chibi-shonen manga characters.

## Decisions (locked with user, 2026-07-07)

1. **Substrate:** Anthropic **Message Batches API** — submit in one invocation,
   collect in another. (Rejected: always-on LXC worker — user does not want to
   run local infra; Managed Agents — too large a rearchitecture.)
2. **Poll trigger:** **GitHub Actions** scheduled workflow (~every 10 min)
   curling a poll endpoint. (Rejected: LXC crontab; Vercel Hobby cron
   frequency limits make sub-hourly poll crons unreliable.)
3. **Scope:** **all six agents** go async (user chose uniform pipeline over
   frontend-only).
4. **Character style:** **A — Chibi Shonen** (picked via visual companion):
   big expressive head (~half the sprite), huge manga eyes, spiky hair, bold
   per-agent accessories. Original characters *inspired by* the One Piece
   aesthetic — no copyrighted characters.

## Part 1 — Async execution substrate

### Why batches

- A batch submission returns in seconds — always inside the 300s cap.
- The model side may take as long as it needs (typical: minutes; allowed: 24h).
- All Messages API features are supported in batch params (tools incl.
  `web_search`; MCP connector **unverified** — see Risks).
- Batch tokens are billed at **50%** of standard prices — agents get cheaper
  and more capable at once.

### The prepare/finalize split (per-dept refactor)

Each dept module (`finance.ts`, `cyberx.ts`, `marketing.ts`, `rnd.ts`,
`operations.ts`, `ceo.ts`) refactors `run(ctx)` into:

- `prepare(ctx): Promise<PreparedRun>` — fetches source data
  (`src/lib/sources/*` as today) and returns `{ params, meta }` where `params`
  is the exact Claude request shape currently passed to `completeRaw`
  (system/prompt/model/maxTokens/webSearch/maxSearches/mcpServers, with
  `applyOverrides` already applied) and `meta` carries anything `finalize`
  needs that isn't in `ctx` (e.g. fetched repos/deploy lines/theme).
- `finalize(ctx, meta, text, usage, model, stopReason): AgentRunResult` — the
  existing post-LLM half verbatim: findings parsing, citation guard, artifact
  builders, summary/incomplete computation. Pure (no I/O).
- `run(ctx)` remains and becomes `prepare → completeRaw → finalize` — the
  synchronous path survives for tests and as a code path of last resort.

`claude.ts` gains `buildMessageParams(opts)` — the request-construction half of
`completeRaw` extracted so the sync call and the batch submission share one
source of truth — plus `submitBatch(customId, params)` and
`retrieveBatchResult(batchId)` thin wrappers over
`client.messages.batches.{create,retrieve,results}`.

### Run lifecycle & Redis state

New module `src/lib/agents/asyncRun.ts` + Redis keys owned by `redis.ts`:

- `run:pending:<id>` — `{ id, dept, batchId, customId, submittedAt, phase:
  'submitted', continuations: number, meta }` + `run:pending:index` (list).
  `id = <dept>:<ts>` (same shape as KB ids).
- **Submit** (`/api/cron/run?dept=X`, also admin Run-now, Telegram `/run`,
  watchdog retry): `buildContext → prepare → submitBatch → save pending run →
  setStatus({state:'queued'})`. Then **self-poll** up to ~210s (20s interval):
  if the batch ends in time, finalize inline and the invocation behaves
  exactly like today's sync run. Otherwise return `{ok:true, queued:true}`.
- **Collect** (`GET /api/cron/poll`, CRON_SECRET-gated): for each pending run,
  `retrieveBatchResult`:
  - `succeeded` → `finalize` → **the existing runner fan-out unchanged**
    (normalizeReportOrder/bilingual split, highlight/flags parsing, role seam,
    `qualityGate`, KB publish + Library sync, history/digest/usage, Telegram
    notify). Achieved by extracting the post-LLM half of `runAgent()` into
    `persistRunResult(dept, result, deps)` that both paths call.
  - `stop_reason === 'pause_turn'` (server-tool iteration limit) → resubmit a
    continuation batch (same custom flow, `continuations + 1`, **cap 3**;
    at cap → treat as errored).
  - `errored`/`expired`/batch-level failure → `setStatus('error')` + error
    notify (same shape as today's failures — watchdog-compatible).
  - **Staleness guard:** pending run older than **6h** → force `error`,
    delete the pending record.
- `AgentState` gains `'queued'`; dashboards/admin render it as "submitted —
  awaiting result" (reuse the running visual with a distinct label);
  `health.ts` treats `queued` like `running` for staleness (with the 6h cap
  making zombies impossible).

### Poll trigger

`.github/workflows/poll.yml`: `schedule: [{cron: '*/10 * * * *'}]` +
`workflow_dispatch`, one step:
`curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://company.nanoteofficial.me/api/cron/poll`.
`CRON_SECRET` added as a GitHub repo secret (manual, user does this once).
GH cron is best-effort (10-30 min drift acceptable — the self-poll already
caught fast runs). The existing `vercel.json` crons keep firing the submit
side; the 16:00 UTC sweep keeps its schedule (its retry now submits a batch).

### Touchpoints of existing behavior

- **Watchdog:** `decideRetry` unchanged (keys on `error`); `SAFE_OVERRIDES`
  unchanged; its rerun goes through the submit path (announce-notify already
  fires pre-submit). The sweep no longer risks being killed mid-`runAgent` —
  submission is seconds.
- **Admin Run-now / Telegram `/run`:** response wording becomes "queued — the
  Telegram notify fires when the report lands" when the self-poll window is
  exceeded; otherwise identical to today.
- **Finance:** with the cap gone, restore `webSearch: true` alongside MCP (the
  v1.10.1 MCP-only restriction existed only to dodge the 300s wall). Rate
  limit stalls now merely make the batch slower.
- **Cost ledger (v1.8):** usage recording unchanged (`finalize` returns
  usage/model); note in the Ops brief that batch runs bill at 50%.

### Risks / verification order

1. **MCP connector in batches is unverified.** First implementation task runs
   a live one-request batch with `mcpServers` (Finance shape). If rejected:
   Finance goes batch + `web_search`-only (acceptable — web research was the
   original v1.3–v1.5 mode, and time is no longer scarce); revisit MCP later.
2. **`pause_turn` frequency** with web_search in batches — the continuation
   loop handles it; cap 3 keeps cost bounded.
3. GH Actions drift — acceptable by decision; self-poll covers the fast path.

## Part 2 — Chibi Shonen character crew

### Sprites

`src/lib/agents/sprites.ts` rebuilt on a **14×18** grid (from 9×11), same
`PixelRect` format and generator API (`spriteRects`, `spriteSvg`), so every
consumer (canvas engine, any SVG use) is untouched except size constants:
`SPRITE_VIEWBOX_W/H = 14/18`, `SPRITE_WIDTH/HEIGHT = 42/54` (≈ today's
footprint, slightly taller). Verify the iso engine's sprite anchor/centering
with the new constants on the dev server; adjust the draw offset only if
agents visibly float/sink.

Six original chibi characters (style A: head ≈ rows 0–9 of 18, big 2×2-pixel
eyes, spiky/shaped hair, mouth row, compact body, per-agent accessory),
keeping each dept's brand color dominant:

| Dept | Character | Signature details |
|---|---|---|
| `ceo` CEOX | Blond spiky-haired captain | Draped captain coat (crimson) over white shirt, gold epaulettes, `#ffdd57` hair |
| `fin` FinX | Neat analyst | Rimmed glasses, navy suit, `#7f8cff` tie |
| `cyb` CyberX | Hooded operator | Dark-green hood up, `#39ff9d` neon visor + zipper |
| `mkt` M&SX | Creative | Beret + headphones, `#ff6b9d` jacket |
| `rnd` AIX | Researcher | Goggles pushed up on forehead, lab coat, `#00cfff` accents |
| `ops` OperX | Field engineer | Headset with mic, `#ff9a3c` vest, wrench holster |

### Non-changes

`behaviours.ts` (animation state mappings), the isometric engine, department
zone layout, and `DepartmentSidebar`/`OfficeCanvas` code stay as-is. No
copyrighted character likenesses — original designs in the aesthetic only.

### Verification

Dev server + screenshots (repo convention: no visual unit tests). A light
`sprites.test.ts` asserts data sanity: every dept has rects, all rects within
the 14×18 viewbox, every fill parses as a hex color.

## Testing (both parts)

- `asyncRun.test.ts` — pure state transitions: submit-record shape, poll
  decision table (succeeded/errored/expired/pause_turn/stale-6h), continuation
  cap.
- Per-dept tests adapt to the prepare/finalize split; existing run tests keep
  passing via the preserved sync `run()`.
- `runner.test.ts` — `persistRunResult` extraction covered by the existing
  role-seam/publish tests (they exercise the same fan-out).
- Poll route: covered via the pure decision units + dev-server curl (repo
  convention: routes have no unit tests).
- `sprites.test.ts` as above.

## Out of scope

- KB on Neon/Postgres (v1.13), auth upgrade, CI test gate (may ride along in
  the same GH workflow file later, but not required here).
- Public dashboard redesign; new env vars (the GH repo secret reuses the
  existing `CRON_SECRET` value).
- Sprite animations beyond the current behaviour states.

## Versioning & release

`package.json` → **1.12.0**, CHANGELOG entry, CLAUDE.md current-version
rewrite. Ship via code review + base-deployment (the established flow), then
verify in prod: first batch-backed cron run end-to-end, GH Actions poll green,
chibi crew visible on the live office canvas.
