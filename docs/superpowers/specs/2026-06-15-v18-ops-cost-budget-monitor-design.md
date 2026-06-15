# v1.8 — Operations cost & budget monitor (Phase 2)

**Status:** approved (2026-06-15)
**Predecessor:** v1.7 Operations internal monitor
(`docs/superpowers/specs/2026-06-14-v17-ops-internal-monitor-design.md`),
whose "Out of scope — Phase 2: per-agent token/credit tracking" section this
design realizes.

## Summary

The Operations agent already monitors every other agent's *run-health* (error /
stale / truncated / empty / open flags) and escalates via `## Flags` + a
`🔴 OPS ALERT` Telegram message. It does **not** yet see what the company
**spends**. `completeRaw()` returns token `usage` on every call, but each dept
module discards it.

v1.8 captures that usage into a per-run ledger, prices it, and gives Operations a
**cost & budget** view: per-agent spend, month-to-date (MTD) cost, a rolling
7-day burn rate, and — **when a budget is configured** — a budget gauge with
threshold alerts wired into the existing v1.7 severity/alert machinery.

**Budget is optional and the feature is safe-by-default.** With no budget set,
the monitor is **display-only**: it tracks and shows spend but raises no alerts.

## Decisions (locked during brainstorming)

1. **Depth:** tokens **+ USD cost + budget** (full guardian story), not tokens-only.
2. **Windows:** track per-run usage once; display **both** calendar
   month-to-date (for the budget) and a **rolling 7-day burn rate** (for trend).
3. **Alerting:** budget status feeds the v1.7 severity system — 🟡 warning at
   **≥80% MTD**, 🔴 critical at **≥100% MTD or projected month-end overrun** —
   routed into the Ops summary + `## Flags` + `🔴 OPS ALERT`.
4. **Budget is optional / display-only by default:** `MONTHLY_BUDGET_USD` unset
   or `≤ 0` ⇒ track + display spend, **no** budget severity, **no** alert. A
   literal `$0` budget is therefore *tracking-only*, not "always over budget."
5. **Storage:** an **append-only usage ledger** (Redis sorted set), per-run
   granularity so per-model pricing is always exact; trimmed to ~40 days.
6. **Scope:** the **monitor only**. No cadence / model / `maxTokens` changes in
   this work (measure first, cut later). Agents already default to Haiku 4.5.

## Architecture

### New modules (pure, unit-tested)

**`src/lib/cost.ts`** — pricing.
- `PRICING: Record<string, { input: number; output: number }>` — USD per **1M
  tokens**, keyed by Anthropic model id, for the models this app uses
  (Haiku 4.5, Sonnet 4.6, Opus) plus any others worth listing. Authored from
  current public pricing with a dated comment.
- `DEFAULT_MODEL_PRICE` — fallback used when a model id is absent from `PRICING`,
  set to the default model's rate (Haiku) so cost is never `NaN`.
- `costOf(model: string, usage: { input: number; output: number }): number` —
  returns USD; uses `DEFAULT_MODEL_PRICE` (and is treated as an estimate) for an
  unknown model.
- `isKnownModel(model): boolean` — lets callers flag estimated rows.

**`src/lib/agents/usage.ts`** — aggregation + budget rule.
- `UsageEntry { dept: DeptId; model: string; input: number; output: number; ts: number }`.
- `UsageAggregate` — `perDept: { dept, tokens, costUsd }[]`, `mtdUsd`,
  `mtdTokens`, `last7dBurnUsdPerDay`, `projectedMonthEndUsd`,
  `daysLeftInMonth`, `budgetUsd: number | null`, `pctUsed: number | null`.
- `aggregateUsage(entries: UsageEntry[], opts: { now: number; budgetUsd: number | null }): UsageAggregate`
  — pure; months computed in **UTC**. `budgetUsd ≤ 0` is normalized to `null`
  (display-only), so `pctUsed`/budget fields are `null`. Definitions:
  `last7dBurnUsdPerDay` = (cost of entries in the trailing 7 days) ÷ 7;
  `projectedMonthEndUsd` = `mtdUsd + last7dBurnUsdPerDay × daysLeftInMonth`;
  `pctUsed` = `mtdUsd / budgetUsd × 100` (or `null` when display-only).
- `assessBudget(agg: UsageAggregate): { severity: Severity; detail: string } | null`
  — returns `null` when `budgetUsd` is `null` (display-only). Otherwise
  🟡 `warning` at `pctUsed ≥ 80`, 🔴 `critical` at `pctUsed ≥ 100` **or**
  `projectedMonthEndUsd > budgetUsd`. `Severity` is imported from `health.ts`.

### Changed modules

- **`src/lib/claude.ts`** — `CompleteResult` gains `model: string` (the model
  actually used for the call). `usage: { input, output }` already exists and
  already sums across `pause_turn` resume segments (v1.4.7).
- **`src/lib/agents/types.ts`** — `AgentRunResult` gains first-class
  `usage?: { input: number; output: number }` and `model?: string` (not buried
  in the free-form `meta`).
- **Six dept modules** (`finance`, `cyberx`, `marketing`, `rnd`, `operations`,
  `ceo`) — destructure `usage` + `model` from the `completeRaw` result and set
  them on the returned `AgentRunResult` (≈1 line each).
- **`src/lib/redis.ts`** — `recordUsage(entry: UsageEntry)` (`ZADD usage:ledger`
  score = `ts`, member = compact JSON; then `ZREMRANGEBYSCORE` to drop entries
  older than `USAGE_RETENTION_MS` ≈ 40 days) and
  `getUsageSince(ts: number): Promise<UsageEntry[]>` (`ZRANGEBYSCORE` + parse,
  tolerant of malformed members). No-ops gracefully without Redis creds.
- **`src/lib/agents/runner.ts`** — in the existing post-run `Promise.all`
  fan-out, call `recordUsage({ dept, model, input, output, ts: Date.now() })`
  when `result.usage` and `result.model` are present (skip otherwise — legacy /
  non-LLM runs never corrupt the ledger).
- **`src/lib/agents/operations.ts`** — `run()` additionally:
  1. `getUsageSince(40d)` → `aggregateUsage(entries, { now, budgetUsd })` where
     `budgetUsd = parseBudget(process.env.MONTHLY_BUDGET_USD)`.
  2. `assessBudget(agg)`; ops severity = `worst([overallSeverity(agentHealths),
     budget?.severity ?? 'ok'])`.
  3. The budget line is appended to the health summary and, when non-`ok`,
     contributes an entry to `## Flags`; a 🔴 budget-critical contributes to the
     `🔴 OPS ALERT` Telegram payload alongside any agent-critical alerts.
  4. Builds the new cost artifacts (below).

### `assessCompanyHealth` / `health.ts`

**Unchanged.** Budget is a *company-level* signal, not a per-agent one, so it
lives in `usage.ts` (`assessBudget`) and is composed with the per-agent result
in `operations.ts` via the existing `worst()` ordering. `health.ts` only exports
its `Severity` type for reuse. (This deviates from the v1.7 spec's literal
"add a `tokens` projection to `AgentOutputHealth`" — the ledger is the source of
truth, so a per-output projection would be redundant. Kept out to minimize blast
radius on shipped v1.7 code.)

## Dashboard artifacts (Operations, provenance `'api'`)

Built deterministically from `UsageAggregate` (our own Redis data — like the CEO
cockpit aggregating `companySnapshot`; no citation required), via a new pure
builder `operationsCostArtifacts(agg): Artifact[]`:

1. **Per-agent cost** — `Bars`: USD MTD per department (including `ops` itself).
2. **Budget / spend scorecard** — `Scorecard`:
   - budget set → MTD `$X / $Y`, `pctUsed%`, burn `$/day` (7d),
     `daysLeftInMonth`, projected month-end.
   - budget unset → **"tracking only"**: MTD `$X`, burn `$/day`, total tokens
     (no %, no countdown).

Reuses existing `Bars` / `Scorecard` chart kinds — **no new chart primitive**.
Empty ledger → all-zero aggregate renders `$0` cleanly.

## Data flow

```
dept run → completeRaw() → { text, stopReason, usage, model }
  → AgentRunResult.usage / .model
  → runner fan-out: recordUsage({ dept, model, in, out, ts }) → usage:ledger (ZSET, trimmed >40d)
       ⋮  (accumulates across all runs, incl. ops)
next ops run:
  getUsageSince(40d) → aggregateUsage(entries, { now, budgetUsd })
  severity = worst( overallSeverity(agentHealths), assessBudget(agg)?.severity )
  → summary line + ## Flags (if non-ok) + 🔴 OPS ALERT (if critical) + cost artifacts
```

Notes:
- Months are UTC (crons run in UTC).
- Ops excludes *itself* from per-agent **health**, but its own token cost **does**
  count toward the **budget** (ops runs cost money too).
- A `pause_turn`-resumed run records its true summed total (v1.4.7 behavior).

## Configuration

- **`MONTHLY_BUDGET_USD`** (optional) — monthly budget in USD. Unset or `≤ 0` ⇒
  display-only (no budget alerts). Documented in `CLAUDE.md` → Env Vars.
- No other new env vars. Pricing is a code constant in `cost.ts`.

## Error handling / edge cases

- **Empty ledger / no Redis creds** → all-zero aggregate, `ok` severity,
  scorecard shows `$0` (or "tracking only"); never throws.
- **Run without `usage`** (legacy entries, future non-LLM runs) → simply not
  recorded; aggregation ignores absence.
- **Unknown model id** → `DEFAULT_MODEL_PRICE` fallback; row flagged as an
  estimate so an unpriced model is visible, not silently wrong.
- **Malformed ledger member** → skipped by `getUsageSince` (tolerant parse).
- **Budget `0` / negative** → normalized to `null` (display-only), never a
  permanent 100% alert.

## Testing

- `cost.test.ts` — pricing math per model; unknown-model fallback + estimate flag.
- `usage.test.ts` — MTD sum; **UTC month-boundary reset**; rolling 7-day burn;
  `projectedMonthEndUsd`; `daysLeftInMonth`; budget thresholds at 79 / 80 / 100
  and projected-overrun; **display-only** (`budgetUsd null` ⇒ `assessBudget`
  returns `null`, no `pctUsed`); empty-entries case.
- `operations.artifacts.test.ts` — `operationsCostArtifacts` builds cost bars +
  scorecard (budget-set and tracking-only variants; `$0` empty case);
  provenance `'api'`.
- `runner` test — records usage when `result.usage`/`result.model` present; skips
  when absent.
- `redis` (in-memory stub) — `recordUsage` adds to the ledger and trims entries
  older than retention; `getUsageSince` filters by window.

There are **no visual unit tests** for the artifacts' rendering — verify the
Operations dashboard with the dev server + a screenshot after implementation.

## Version & docs

- `package.json` **1.7.0 → 1.8.0** (the NavBar reads it; no separate constant).
- `CHANGELOG.md` — a `## [1.8.0]` entry (Keep-a-Changelog format).
- `CLAUDE.md` — new current-version entry collapsing v1.7 into the
  `CHANGELOG.md` pointer; add `MONTHLY_BUDGET_USD` to the Env Vars list.
- `.agents/Operations Agent.md` — update the brief so its narrative reflects that
  per-agent credit/budget monitoring is now **real** (the token tables stop being
  aspirational). The deterministic artifacts come from the builders; the brief
  drives only the narrative.

## Out of scope (future)

- Actual spend-reduction levers (cadence cuts, Finance Sonnet→Haiku, lower
  `maxTokens`). Deliberately deferred — measure first.
- Per-agent cost on the public `/dashboard/[dept]` pages (Operations dashboard
  only for now).
- Live Anthropic account-balance integration (not API-readable; budget stays a
  configured figure).
