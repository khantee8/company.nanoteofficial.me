# v1.7 — Operations Agent → Internal Operations Monitor

**Date:** 2026-06-14
**Status:** Design — approved, pending implementation plan
**Target version:** 1.7.0
**Spec author:** brainstorming session (Ops upgrade)

---

## Summary

The Operations agent is reframed from a **CI/CD-only health reporter** into the
company's **internal operations monitor** — the one agent whose subject is the
company itself, not the outside world. It keeps reporting Vercel/GitHub
deployment health, and **adds run-health monitoring of every other agent**
(errors, missed cadence, truncated reports, empty output, open flags), diagnoses
the single most important thing to fix, and **escalates critical issues** to you
(a distinct Telegram alert) and to the CEO (via flags that flow into the CEO
digest).

This closes the long-standing gap between the rich "System Guardian" role brief
(`.agents/Operation Agent.md`) and the thin CI/CD-only implementation, **without**
inventing data: every signal already exists in Redis.

**Token/credit spend tracking is explicitly Phase 2** (see end) — it requires
persisting `completeRaw()` usage across all dept modules first.

---

## Motivation

The role brief casts Operations as a 24/7 "System Guardian" with per-agent
credit monitoring, anomaly detection, an alert protocol, and an escalation
matrix. The actual `operations.ts` only:

- renders a Vercel deployment scorecard (`'api'`),
- renders a GitHub repo-activity table (`'api'`),
- emits a cited ops-notes table + a single `fixToday` (`'web'`).

None of the "watch the other agents" story is real. Yet the signals to build it
already sit in Redis on every run:

| Signal | Source | Issue it surfaces |
|---|---|---|
| Run failed | `status.state === 'error'` + `status.error` | "CyberX errored on last run" |
| Stale / missed cadence | `status.lastRun` vs expected cadence | "R&D hasn't run since Tue — cron may be broken" |
| Report truncated | `output.incomplete` / `meta.stopReason === 'max_tokens'` | "Finance cut off 3 runs running — bump maxTokens" |
| Empty / weak output | `output.artifacts.length === 0` on a `done` run | "Finance produced 0 cited funds" |
| Open flags piling up | `digest[].flags` | "AI R&D has 4 unresolved flags" |

Operations becomes: **"is each agent's pipeline actually producing good work,
and if not, what's the one fix?"** — then escalate.

---

## Architecture

Chosen approach: **pure assessment module + extended snapshot** (Approach A from
brainstorming). Rejected alternatives: passing `repo` into `operations.run()`
(breaks the Redis-free dept-module contract every other module honors); reusing
the CEO snapshot as-is (only `statuses` + `digest` → can't see truncation or
empty output, kills half the value).

### Layer 1 — Data plumbing (`types.ts` + `runner.ts`)

`AgentContext.companySnapshot` gains an optional slim per-dept projection:

```ts
export interface AgentOutputHealth {
  dept: DeptId;
  incomplete: boolean;
  stopReason?: string;        // from output.meta.stopReason
  artifactCount: number;
  hasSummary: boolean;
  ts: string | null;          // output.ts (last successful output)
}

// added to companySnapshot:
companySnapshot?: {
  statuses: AgentStatus[];
  digest: DigestEntry[];
  relatedEntryIds?: string[];
  outputs?: AgentOutputHealth[];   // NEW — populated for ops
};
```

`buildContext()` (in `runner.ts`) currently populates `companySnapshot` only for
`ceo`. It is extended to also populate it for **`ops`**. For Ops it additionally
fetches each dept's `output` (via `repo.getOutput`) and projects it into
`outputs[]`. The CEO branch is untouched and simply ignores the new field. The
projection is deliberately slim (no full `markdown`/`artifacts` payloads) to keep
the context object lean.

### Layer 2 — Health assessment (`src/lib/agents/health.ts` — new, pure)

The brain of the feature. No Redis, no LLM, no I/O — a pure function over the
snapshot, fully unit-testable from fixtures (matching the `sources/` convention).

```ts
export type Severity = 'critical' | 'warning' | 'info' | 'ok';

export interface HealthIssue {
  kind: 'error' | 'stale' | 'truncated' | 'empty' | 'flags';
  severity: Severity;
  detail: string;             // human-readable, e.g. "stale: no run in 3d"
}

export interface AgentHealth {
  dept: DeptId;
  severity: Severity;         // worst of its issues (ok if none)
  state: AgentState;
  lastRun: string | null;
  stale: boolean;
  issues: HealthIssue[];
}

export interface HealthInput {
  statuses: AgentStatus[];
  outputs: AgentOutputHealth[];
  digest: DigestEntry[];
  now: number;                // injected for deterministic tests
}

export function assessCompanyHealth(input: HealthInput): AgentHealth[];
export function overallSeverity(healths: AgentHealth[]): Severity;
export function criticalAlerts(healths: AgentHealth[]): AgentHealth[]; // severity === 'critical'
```

**Expected cadence** — staleness needs to know how often each dept *should* run.
A hand-maintained map mirrors `vercel.json`:

```ts
// MIRRORS vercel.json cron schedules — update BOTH if cadence changes.
const EXPECTED_CADENCE_HOURS: Record<DeptId, number> = {
  cyb: 24,   // daily
  ops: 24,   // daily
  fin: 72,   // Mon/Wed/Fri
  rnd: 96,   // Tue/Thu  (longest gap Thu→Tue ~4d, use a generous bound)
  mkt: 96,   // Mon/Thu
  ceo: 168,  // Sun (weekly)
};
const STALE_GRACE_HOURS = 12;  // tolerance before flagging
```

**Detection rules** (per dept), each producing at most one `HealthIssue` of its
kind; a dept's `severity` is the worst across its issues:

| Detection | `kind` | Severity |
|---|---|---|
| `status.state === 'error'` | `error` | 🔴 critical — `run failed: <error>` |
| `lastRun` age > cadence + grace | `stale` | 🟡 warning — `stale: no run in Nd` |
| `lastRun` age > 2 × (cadence + grace) | `stale` | 🔴 critical — `severely stale: no run in Nd` |
| `incomplete` or `stopReason === 'max_tokens'` | `truncated` | 🟡 warning — `report truncated (max_tokens)` |
| `state === 'done'` and `artifactCount === 0` | `empty` | 🟡 warning — `empty output (0 artifacts)` |
| digest open `flags` count > 0 | `flags` | 🟢 info — `N open flags` |

Notes:
- `state === 'error'` and `stale` can both apply; both issues are recorded, the
  worse one drives `severity`.
- An agent with `lastRun === null` (never run) is treated as `stale` at warning
  level, not critical (could be a newly added dept).
- The existing `redis.ts` `normalizeStatus()` already self-heals a stuck
  `running` into `error` after 15 min, so a hung run surfaces as `error` here for
  free — no separate "stuck running" rule needed.

### Layer 3 — `operations.ts` run()

Gather phase adds the snapshot read:

```ts
const [deploys, activity] = await Promise.all([...]);   // unchanged
const snap = ctx.companySnapshot;
const healths = snap
  ? assessCompanyHealth({ statuses: snap.statuses, outputs: snap.outputs ?? [],
                          digest: snap.digest, now: Date.now() })
  : [];
```

New deterministic `'api'` artifacts (built by pure builders, unit-tested),
alongside the existing deploy scorecard + repo-activity table + cited ops-notes:

- **agent health scorecard** — one tile per dept, `ok | warn | down` mapped from
  `severity` (`ok`→ok, `info`/`warning`→warn, `critical`→down).
- **issues table** — columns `dept · severity · issue`, **unhealthy rows only**
  (drops `ok` depts); empty-state-safe (omitted entirely when all healthy).

The formatted health assessment is **fed into the Claude prompt** so the LLM's
narrative diagnoses each unhealthy agent and proposes the fix, and lists the
issues in its `## Flags` section. Because the runner derives persisted flags from
`parseFlags(markdown)` (not from `AgentRunResult.flags`), routing issues through
the prompt → `## Flags` is what makes them flow into the CEO digest. The
deterministic issues table remains the on-screen source of truth regardless of
what the LLM writes.

`summary` leads with the worst severity, e.g.
`🔴 1 agent down · fix: <fixToday>` or `🟢 all agents healthy · all deploys green`.

The findings schema (`fixToday` + cited `notes`) is **unchanged** — the health
data is deterministic `'api'`, never LLM-authored. `webSearch` stays on for
status-page / changelog citations behind the ops-notes.

### Layer 4 — Critical alert path (Telegram)

`AgentRunResult` gains:

```ts
alert?: { severity: 'critical'; text: string };
```

When `criticalAlerts(healths)` is non-empty, `operations.ts` composes a brief,
severity-prefixed message in the brief's Alert-Protocol spirit:

```
🔴 OPS ALERT
ระบบ: CYB, FIN
อาการ: CYB run failed: <error>; FIN severely stale: no run in 7d
Action: ตรวจ cron / logs แล้วรันใหม่
```

`runner.ts` sends it as a **separate** `notify(...)` call *in addition to* the
routine "run done" notify, so it stands out from normal completions. The
side-effect lives in the runner (where the existing notify is); the dept module
stays data-only by returning the text on `result.alert`.

```ts
// in runAgent, after the main notify:
if (result.alert) await notify(result.alert.text);
```

### Layer 5 — Role brief (`.agents/Operation Agent.md`)

Per the "brief IS the spec" constraint (`roles.ts` loads it verbatim; changing
behavior means editing the `.md`), the autonomous-mission section is updated so
the spec matches the new reality:

- Operations now monitors **other agents' run health** (errors, missed cadence,
  truncated reports, empty output, open flags) **in addition to** CI/CD.
- The analyst report structure (`โครงสร้างรายงานฉบับวิเคราะห์`) gains an
  **agent-health scorecard / table** step before the system scorecard.
- A one-line note that per-agent **token/credit tracking is a future phase**
  (the brief's token tables remain aspirational until Phase 2).

The `findings` JSON schema block in the brief is unchanged.

---

## Data flow

```
Vercel API ─┐
GitHub API ─┤→ operations.run(ctx)
            │      │
ctx.company │      ├─ assessCompanyHealth(snapshot) → AgentHealth[]
 Snapshot ──┘      │      ├─ opsArtifacts(deploys, activity)        'api'
 (statuses,        │      ├─ agentHealthArtifacts(healths)          'api'  [NEW]
  outputs,         │      └─ opsNoteArtifacts(findings)             'web'
  digest)          │
                   ├─ Claude (webSearch) ← health summary in prompt
                   │      → narrative + ## Flags + json findings
                   │
                   └─ AgentRunResult { markdown, summary, artifacts,
                                       alert?, ... }
                          │
runner.runAgent ─────────┤→ persist (output/history/digest/kb draft)
                          ├→ notify(main summary)
                          └→ if alert: notify(🔴 OPS ALERT)   [NEW]
                                 │
                          flags (from ## Flags) → digest → CEO buildContext
```

---

## Testing

- **`src/lib/agents/health.test.ts`** (new) — one fixture per rule:
  `error → critical`; `stale → warning`; `2× overdue → critical`;
  `truncated → warning`; `empty (done, 0 artifacts) → warning`;
  `flags → info`; `healthy → ok`. Plus `overallSeverity` (worst-wins) and
  `criticalAlerts` (filters to critical). `now` is injected so age math is
  deterministic.
- **`src/lib/agents/operations.artifacts.test.ts`** (extend) — the new
  `agentHealthArtifacts` builder: multi-dept fixture → scorecard tile mapping +
  issues-table rows (unhealthy-only), empty-state when all healthy.
- **`runner` test** — assert the extra `notify` fires when `result.alert` is
  present and does **not** fire when absent.
- No visual tests for the new charts (consistent with the repo) — verify the
  scorecard + issues table on `/dashboard/ops` with the dev server.

---

## Key constraints honored

- **Artifacts never uncited / built by pure builders** — the health scorecard +
  issues table are `'api'` provenance, built deterministically from the snapshot;
  the LLM only writes narrative + the validated findings block. No new freehand
  LLM charts.
- **No `dangerouslySetInnerHTML`** — reuses existing `scorecard`/`table` chart
  kinds; no renderer changes needed.
- **Brief IS the spec** — behavior change is authored into `.agents/Operation
  Agent.md`, loaded by `roles.ts`; `roles.test.ts` continues to assert verbatim
  equality.
- **Draft→publish gate** — unchanged; Ops KB entries still archive as `draft`.
- **Dept modules stay Redis-free** — Ops reads cross-agent state only through the
  `ctx.companySnapshot` the runner assembles, not by touching `repo` directly.

---

## Out of scope — Phase 2: per-agent token/credit tracking

The brief's token tables (credit remaining, burn rate, "runs out in N days")
remain aspirational because **agent runs do not currently persist token usage** —
`completeRaw()` returns `usage`, but every dept module saves only `stopReason`,
not the counts. Phase 2:

1. Persist `usage` (input/output tokens) on each run via `result.meta.usage`
   across all six dept modules (or centralize in the runner).
2. Add a `tokens` projection to `AgentOutputHealth`.
3. Extend `assessCompanyHealth` with burn-rate / budget rules and a token
   scorecard artifact.

Deferred to keep v1.7 shippable and low-blast-radius.

---

## Version

`package.json` 1.6.0 → **1.7.0**. The NavBar reads the version from
`package.json`, so no separate version constant to update.
