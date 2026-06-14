# Operations Internal Monitor (v1.7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Operations agent into the company's internal operations monitor — it watches every other agent's run health (errors, staleness, truncation, empty output, open flags) in addition to CI/CD, surfaces deterministic health charts, and escalates critical issues to the CEO (via flags) and to you (via a distinct Telegram alert).

**Architecture:** A new pure `health.ts` module assesses cross-agent state from a snapshot the runner now assembles for `ops` (as it already does for `ceo`). `operations.ts` consumes the assessment to build deterministic `'api'` artifacts and feeds it into the LLM prompt; critical issues ride back on a new `AgentRunResult.alert` field that the runner sends as a second Telegram message.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Vitest. No new dependencies.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/lib/agents/types.ts` | Shared types | **Modify** — add `AgentOutputHealth`, extend `companySnapshot`, add `AgentRunResult.alert` |
| `src/lib/agents/health.ts` | Pure cross-agent health assessment | **Create** |
| `src/lib/agents/health.test.ts` | Unit tests for assessment | **Create** |
| `src/lib/agents/runner.ts` | `buildContext` snapshot + alert dispatch | **Modify** |
| `src/lib/agents/runner.test.ts` | Snapshot + alert tests | **Modify** |
| `src/lib/agents/operations.ts` | Health artifacts + run wiring + alert | **Modify** |
| `src/lib/agents/operations.artifacts.test.ts` | Health-artifact builder tests | **Modify** |
| `src/lib/agents/operations.test.ts` | Run-level alert/summary tests | **Modify** |
| `.agents/Operation Agent.md` | Role brief (loaded verbatim by `roles.ts`) | **Modify** |
| `package.json` | Version 1.6.0 → 1.7.0 | **Modify** |

All commands run from `/project/src/company.nanoteofficial.me`.

---

## Task 1: Types — `AgentOutputHealth`, snapshot field, alert field

**Files:**
- Modify: `src/lib/agents/types.ts`

These are pure type additions consumed by every later task. No standalone test; verified by `tsc` and the tests that follow.

- [ ] **Step 1: Add `AgentOutputHealth` after the `AgentOutput` interface**

In `src/lib/agents/types.ts`, immediately after the `AgentOutput` interface closes, add:

```ts
/** Slim per-dept health projection the Operations monitor reads (v1.7).
 *  Deliberately omits markdown/artifacts payloads to keep the context lean. */
export interface AgentOutputHealth {
  dept: DeptId;
  incomplete: boolean;
  stopReason?: string;
  artifactCount: number;
  hasSummary: boolean;
  ts: string | null;
}
```

- [ ] **Step 2: Extend `companySnapshot` on `AgentContext`**

In the same file, find the `companySnapshot` field on `AgentContext`:

```ts
  /** Whole-company state — populated only for the CEO (Executive Cockpit). */
  companySnapshot?: { statuses: AgentStatus[]; digest: DigestEntry[]; relatedEntryIds?: string[] };
```

Replace it with:

```ts
  /** Whole-company state — populated for the CEO (Executive Cockpit) and the
   *  Operations monitor (run-health). `outputs` is filled for ops only. */
  companySnapshot?: {
    statuses: AgentStatus[];
    digest: DigestEntry[];
    relatedEntryIds?: string[];
    outputs?: AgentOutputHealth[];
  };
```

- [ ] **Step 3: Add the `alert` field to `AgentRunResult`**

In the same file, inside `AgentRunResult`, after the `incomplete?` line, add:

```ts
  /** v1.7 — a critical operations alert the runner sends as a distinct Telegram
   *  message, in addition to the routine run notify. */
  alert?: { severity: 'critical'; text: string };
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/types.ts
git commit -m "feat(ops): types for agent-health snapshot + critical alert"
```

---

## Task 2: Pure health assessment module (`health.ts`)

**Files:**
- Create: `src/lib/agents/health.ts`
- Test: `src/lib/agents/health.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/agents/health.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  assessCompanyHealth, overallSeverity, criticalAlerts, formatHealth,
  EXPECTED_CADENCE_HOURS, type AgentHealth,
} from './health';
import type { AgentStatus, DigestEntry } from './types';
import type { AgentOutputHealth } from './types';

const NOW = Date.parse('2026-06-14T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString();

function status(dept: AgentStatus['dept'], over: Partial<AgentStatus> = {}): AgentStatus {
  return { dept, state: 'done', lastRun: hoursAgo(1), ...over };
}
function output(dept: AgentOutputHealth['dept'], over: Partial<AgentOutputHealth> = {}): AgentOutputHealth {
  return { dept, incomplete: false, artifactCount: 2, hasSummary: true, ts: hoursAgo(1), ...over };
}
function find(hs: AgentHealth[], dept: string) {
  const h = hs.find((x) => x.dept === dept);
  if (!h) throw new Error(`no health for ${dept}`);
  return h;
}

describe('assessCompanyHealth', () => {
  it('flags an errored agent as critical', () => {
    const hs = assessCompanyHealth({
      statuses: [status('cyb', { state: 'error', error: 'boom' })],
      outputs: [output('cyb')], digest: [], now: NOW,
    });
    const h = find(hs, 'cyb');
    expect(h.severity).toBe('critical');
    expect(h.issues.some((i) => i.kind === 'error' && /boom/.test(i.detail))).toBe(true);
  });

  it('flags a stale agent as warning past cadence + grace', () => {
    // fin cadence is 72h; 72+12+5 = 89h old → warning
    const hs = assessCompanyHealth({
      statuses: [status('fin', { lastRun: hoursAgo(EXPECTED_CADENCE_HOURS.fin + 17) })],
      outputs: [output('fin')], digest: [], now: NOW,
    });
    expect(find(hs, 'fin').severity).toBe('warning');
    expect(find(hs, 'fin').stale).toBe(true);
  });

  it('escalates a severely stale agent (2x overdue) to critical', () => {
    const hs = assessCompanyHealth({
      statuses: [status('fin', { lastRun: hoursAgo((EXPECTED_CADENCE_HOURS.fin + 12) * 2 + 5) })],
      outputs: [output('fin')], digest: [], now: NOW,
    });
    expect(find(hs, 'fin').severity).toBe('critical');
  });

  it('treats a never-run agent as warning stale, not critical', () => {
    const hs = assessCompanyHealth({
      statuses: [status('rnd', { lastRun: null })],
      outputs: [output('rnd')], digest: [], now: NOW,
    });
    expect(find(hs, 'rnd').severity).toBe('warning');
  });

  it('flags a truncated report as warning', () => {
    const hs = assessCompanyHealth({
      statuses: [status('fin')],
      outputs: [output('fin', { incomplete: true })], digest: [], now: NOW,
    });
    expect(find(hs, 'fin').issues.some((i) => i.kind === 'truncated')).toBe(true);
    expect(find(hs, 'fin').severity).toBe('warning');
  });

  it('flags empty output (done, 0 artifacts) as warning', () => {
    const hs = assessCompanyHealth({
      statuses: [status('mkt', { state: 'done' })],
      outputs: [output('mkt', { artifactCount: 0 })], digest: [], now: NOW,
    });
    expect(find(hs, 'mkt').issues.some((i) => i.kind === 'empty')).toBe(true);
  });

  it('reports open flags as info only', () => {
    const digest: DigestEntry[] = [
      { dept: 'rnd', date: '2026-06-14', summary: 's', highlight: 'h', flags: ['a', 'b'] },
    ];
    const hs = assessCompanyHealth({
      statuses: [status('rnd')], outputs: [output('rnd')], digest, now: NOW,
    });
    const h = find(hs, 'rnd');
    expect(h.severity).toBe('info');
    expect(h.issues.some((i) => i.kind === 'flags' && /2 open flags/.test(i.detail))).toBe(true);
  });

  it('returns ok for a healthy agent', () => {
    const hs = assessCompanyHealth({
      statuses: [status('cyb')], outputs: [output('cyb')], digest: [], now: NOW,
    });
    expect(find(hs, 'cyb').severity).toBe('ok');
    expect(find(hs, 'cyb').issues).toEqual([]);
  });

  it('never assesses ops itself', () => {
    const hs = assessCompanyHealth({
      statuses: [status('ops', { state: 'running' }), status('cyb')],
      outputs: [], digest: [], now: NOW,
    });
    expect(hs.some((h) => h.dept === 'ops')).toBe(false);
  });
});

describe('overallSeverity + criticalAlerts', () => {
  it('overallSeverity returns the worst', () => {
    const hs = assessCompanyHealth({
      statuses: [status('cyb'), status('fin', { state: 'error', error: 'x' })],
      outputs: [output('cyb'), output('fin')], digest: [], now: NOW,
    });
    expect(overallSeverity(hs)).toBe('critical');
  });

  it('criticalAlerts filters to critical only', () => {
    const hs = assessCompanyHealth({
      statuses: [status('cyb'), status('fin', { state: 'error', error: 'x' })],
      outputs: [output('cyb'), output('fin')], digest: [], now: NOW,
    });
    expect(criticalAlerts(hs).map((h) => h.dept)).toEqual(['fin']);
  });

  it('formatHealth renders one line per agent', () => {
    const hs = assessCompanyHealth({
      statuses: [status('fin', { state: 'error', error: 'boom' })],
      outputs: [output('fin')], digest: [], now: NOW,
    });
    expect(formatHealth(hs)).toContain('FIN');
    expect(formatHealth(hs)).toContain('run failed: boom');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agents/health.test.ts`
Expected: FAIL — cannot resolve `./health`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/agents/health.ts`:

```ts
import type { DeptId } from '@/lib/data/departments';
import type { AgentStatus, AgentState, DigestEntry, AgentOutputHealth } from './types';

export type Severity = 'critical' | 'warning' | 'info' | 'ok';

export interface HealthIssue {
  kind: 'error' | 'stale' | 'truncated' | 'empty' | 'flags';
  severity: Severity;
  detail: string;
}

export interface AgentHealth {
  dept: DeptId;
  severity: Severity;
  state: AgentState;
  lastRun: string | null;
  stale: boolean;
  issues: HealthIssue[];
}

export interface HealthInput {
  statuses: AgentStatus[];
  outputs: AgentOutputHealth[];
  digest: DigestEntry[];
  now: number;
}

const HOUR_MS = 3600_000;

// MIRRORS vercel.json cron schedules — update BOTH if cadence changes.
export const EXPECTED_CADENCE_HOURS: Record<DeptId, number> = {
  cyb: 24, ops: 24, fin: 72, rnd: 96, mkt: 96, ceo: 168,
};
const STALE_GRACE_HOURS = 12;

const SEVERITY_RANK: Record<Severity, number> = { ok: 0, info: 1, warning: 2, critical: 3 };

function worst(severities: Severity[]): Severity {
  return severities.reduce<Severity>((a, b) => (SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a), 'ok');
}

function daysAgo(ms: number): number {
  return Math.max(1, Math.round(ms / (24 * HOUR_MS)));
}

function assessOne(
  dept: DeptId,
  status: AgentStatus | undefined,
  output: AgentOutputHealth | undefined,
  flagCount: number,
  now: number,
): AgentHealth {
  const issues: HealthIssue[] = [];
  const state: AgentState = status?.state ?? 'idle';
  const lastRun = status?.lastRun ?? null;

  if (state === 'error') {
    issues.push({ kind: 'error', severity: 'critical', detail: `run failed: ${status?.error ?? 'unknown'}` });
  }

  const cadence = EXPECTED_CADENCE_HOURS[dept] ?? 24;
  const limitMs = (cadence + STALE_GRACE_HOURS) * HOUR_MS;
  let stale = false;
  if (!lastRun) {
    stale = true;
    issues.push({ kind: 'stale', severity: 'warning', detail: 'never run' });
  } else {
    const ageMs = now - new Date(lastRun).getTime();
    if (ageMs > limitMs * 2) {
      stale = true;
      issues.push({ kind: 'stale', severity: 'critical', detail: `severely stale: no run in ${daysAgo(ageMs)}d` });
    } else if (ageMs > limitMs) {
      stale = true;
      issues.push({ kind: 'stale', severity: 'warning', detail: `stale: no run in ${daysAgo(ageMs)}d` });
    }
  }

  if (output && (output.incomplete || output.stopReason === 'max_tokens')) {
    issues.push({ kind: 'truncated', severity: 'warning', detail: 'report truncated (max_tokens)' });
  }

  if (state === 'done' && output && output.artifactCount === 0) {
    issues.push({ kind: 'empty', severity: 'warning', detail: 'empty output (0 artifacts)' });
  }

  if (flagCount > 0) {
    issues.push({ kind: 'flags', severity: 'info', detail: `${flagCount} open flags` });
  }

  return { dept, state, lastRun, stale, issues, severity: worst(issues.map((i) => i.severity)) };
}

/** Pure assessment of every monitored agent. Ops excludes itself (it is mid-run). */
export function assessCompanyHealth(input: HealthInput): AgentHealth[] {
  const { statuses, outputs, digest, now } = input;
  const flagByDept = new Map<DeptId, number>();
  for (const e of digest) flagByDept.set(e.dept, (flagByDept.get(e.dept) ?? 0) + e.flags.length);

  return statuses
    .filter((s) => s.dept !== 'ops')
    .map((s) =>
      assessOne(s.dept, s, outputs.find((o) => o.dept === s.dept), flagByDept.get(s.dept) ?? 0, now),
    );
}

export function overallSeverity(healths: AgentHealth[]): Severity {
  return worst(healths.map((h) => h.severity));
}

export function criticalAlerts(healths: AgentHealth[]): AgentHealth[] {
  return healths.filter((h) => h.severity === 'critical');
}

const SEVERITY_EMOJI: Record<Severity, string> = { ok: '🟢', info: '🟢', warning: '🟡', critical: '🔴' };

/** One human-readable line per agent — fed into the Ops prompt. */
export function formatHealth(healths: AgentHealth[]): string {
  return healths
    .map((h) => {
      const detail = h.issues.length ? h.issues.map((i) => i.detail).join('; ') : 'healthy';
      return `${SEVERITY_EMOJI[h.severity]} ${h.dept.toUpperCase()}: ${detail}`;
    })
    .join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agents/health.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/health.ts src/lib/agents/health.test.ts
git commit -m "feat(ops): pure cross-agent health assessment module"
```

---

## Task 3: `buildContext` populates the ops snapshot

**Files:**
- Modify: `src/lib/agents/runner.ts`
- Test: `src/lib/agents/runner.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/lib/agents/runner.test.ts`, add a new `describe` block at the end of the file:

```ts
describe('buildContext ops snapshot', () => {
  it('populates statuses + slim output health for ops', async () => {
    const repo = {
      getHistory: vi.fn(async () => []),
      getDigest: vi.fn(async () => [
        { dept: 'fin', date: '2026-06-14', summary: 's', highlight: 'h', flags: ['watch'] },
      ]),
      getStatus: vi.fn(async (d: string) => ({
        dept: d, state: d === 'fin' ? 'error' : 'done', lastRun: '2026-06-14T00:00:00Z',
        error: d === 'fin' ? 'boom' : undefined,
      })),
      getOutput: vi.fn(async (d: string) =>
        d === 'fin'
          ? { dept: 'fin', markdown: 'x', summary: '', ts: '2026-06-14T00:00:00Z',
              artifacts: [], incomplete: true, meta: { stopReason: 'max_tokens' } }
          : { dept: d, markdown: 'x', summary: 'ok', ts: '2026-06-14T00:00:00Z',
              artifacts: [{ kind: 'tags', title: 't', tags: ['a'] }] },
      ),
    } as unknown as RedisRepo;

    const ctx = await buildContext('ops', repo);
    expect(ctx.companySnapshot).toBeDefined();
    const fin = ctx.companySnapshot!.outputs!.find((o) => o.dept === 'fin')!;
    expect(fin).toMatchObject({ incomplete: true, stopReason: 'max_tokens', artifactCount: 0, hasSummary: false });
    expect(ctx.companySnapshot!.statuses.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agents/runner.test.ts -t "ops snapshot"`
Expected: FAIL — `ctx.companySnapshot` is `undefined` for ops.

- [ ] **Step 3: Implement the ops branch**

In `src/lib/agents/runner.ts`, add `AgentOutputHealth` to the type import at the top:

```ts
import type { AgentRunResult, AgentContext, AgentOutputHealth } from './types';
```

Then find the CEO snapshot block in `buildContext` and add an `else if` branch after it:

```ts
  } else if (dept === 'ops') {
    const statuses = await Promise.all(DEPARTMENTS.map((d) => repo.getStatus(d.id)));
    const outputs = await Promise.all(
      DEPARTMENTS.map(async (d): Promise<AgentOutputHealth> => {
        const o = await repo.getOutput(d.id);
        return {
          dept: d.id,
          incomplete: o?.incomplete ?? false,
          stopReason: typeof o?.meta?.stopReason === 'string' ? o.meta.stopReason : undefined,
          artifactCount: o?.artifacts.length ?? 0,
          hasSummary: !!o?.summary,
          ts: o?.ts ?? null,
        };
      }),
    );
    companySnapshot = { statuses, digest, outputs };
  }
```

(Insert it between the closing `}` of `if (dept === 'ceo') { ... }` and the `return {` statement.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agents/runner.test.ts -t "ops snapshot"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/runner.ts src/lib/agents/runner.test.ts
git commit -m "feat(ops): buildContext assembles run-health snapshot for ops"
```

---

## Task 4: Health-artifact builder in `operations.ts`

**Files:**
- Modify: `src/lib/agents/operations.ts`
- Test: `src/lib/agents/operations.artifacts.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/lib/agents/operations.artifacts.test.ts`, add the import and a new describe block:

```ts
import { agentHealthArtifacts } from './operations';
import type { AgentHealth } from './health';

const healths: AgentHealth[] = [
  { dept: 'cyb', severity: 'ok', state: 'done', lastRun: 'x', stale: false, issues: [] },
  { dept: 'fin', severity: 'critical', state: 'error', lastRun: 'x', stale: false,
    issues: [{ kind: 'error', severity: 'critical', detail: 'run failed: boom' }] },
  { dept: 'rnd', severity: 'info', state: 'done', lastRun: 'x', stale: false,
    issues: [{ kind: 'flags', severity: 'info', detail: '2 open flags' }] },
];

describe('agentHealthArtifacts', () => {
  it('maps severity to scorecard tiles (info counts as ok)', () => {
    const card = agentHealthArtifacts(healths).find((a) => a.kind === 'scorecard');
    if (card && card.kind === 'scorecard') {
      expect(card.tiles).toEqual([
        { label: 'CYB', state: 'ok' },
        { label: 'FIN', state: 'down' },
        { label: 'RND', state: 'ok' },
      ]);
    } else {
      throw new Error('no scorecard');
    }
  });

  it('lists only warning/critical rows in the issues table', () => {
    const table = agentHealthArtifacts(healths).find((a) => a.kind === 'table');
    if (table && table.kind === 'table') {
      expect(table.columns).toEqual(['agent', 'severity', 'issue']);
      expect(table.rows).toEqual([['FIN', '🔴 critical', 'run failed: boom']]);
    } else {
      throw new Error('no issues table');
    }
  });

  it('omits the issues table when nothing is unhealthy', () => {
    const ok: AgentHealth[] = [
      { dept: 'cyb', severity: 'ok', state: 'done', lastRun: 'x', stale: false, issues: [] },
    ];
    expect(agentHealthArtifacts(ok).some((a) => a.kind === 'table')).toBe(false);
  });

  it('survives empty input', () => {
    expect(agentHealthArtifacts([])).toEqual([]);
  });

  it('tags health artifacts as api provenance', () => {
    expect(agentHealthArtifacts(healths).every((a) => a.provenance === 'api')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agents/operations.artifacts.test.ts -t "agentHealthArtifacts"`
Expected: FAIL — `agentHealthArtifacts` is not exported.

- [ ] **Step 3: Implement the builder**

In `src/lib/agents/operations.ts`, add imports near the top (after the existing imports):

```ts
import { type AgentHealth, type Severity } from './health';
```

Then add the builder after `opsArtifacts` (before `opsTags`):

```ts
const SEVERITY_TILE: Record<Severity, 'ok' | 'warn' | 'down'> = {
  ok: 'ok', info: 'ok', warning: 'warn', critical: 'down',
};
const SEVERITY_LABEL: Record<Severity, string> = {
  ok: '🟢 ok', info: '🟢 info', warning: '🟡 warning', critical: '🔴 critical',
};

/** Internal agent-monitoring charts — deterministic from the health snapshot. */
export function agentHealthArtifacts(healths: AgentHealth[]): Artifact[] {
  if (healths.length === 0) return [];
  const arts: Artifact[] = [
    {
      kind: 'scorecard',
      title: 'agent health',
      tiles: healths.map((h) => ({ label: h.dept.toUpperCase(), state: SEVERITY_TILE[h.severity] })),
    },
  ];
  const unhealthy = healths.filter((h) => h.severity === 'warning' || h.severity === 'critical');
  if (unhealthy.length > 0) {
    arts.push({
      kind: 'table',
      title: 'agent issues',
      columns: ['agent', 'severity', 'issue'],
      rows: unhealthy.map((h) => [
        h.dept.toUpperCase(),
        SEVERITY_LABEL[h.severity],
        h.issues.map((i) => i.detail).join('; '),
      ]),
    });
  }
  return arts.map((a) => withProvenance(a, 'api'));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agents/operations.artifacts.test.ts`
Expected: PASS (existing + new tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/operations.ts src/lib/agents/operations.artifacts.test.ts
git commit -m "feat(ops): deterministic agent-health scorecard + issues table"
```

---

## Task 5: Wire `operations.run()` — assess, prompt-feed, artifacts, summary, alert

**Files:**
- Modify: `src/lib/agents/operations.ts`
- Test: `src/lib/agents/operations.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/lib/agents/operations.test.ts`, add a new describe block at the end of the file:

```ts
describe('operations.run — internal monitoring', () => {
  const now = new Date().toISOString();
  const critCtx: AgentContext = {
    ownHistory: [], companyDigest: [], todayPeers: [],
    companySnapshot: {
      statuses: [
        { dept: 'fin', state: 'error', lastRun: now, error: 'boom' },
        { dept: 'cyb', state: 'done', lastRun: now },
      ],
      digest: [],
      outputs: [
        { dept: 'fin', incomplete: false, artifactCount: 0, hasSummary: false, ts: null },
        { dept: 'cyb', incomplete: false, artifactCount: 3, hasSummary: true, ts: now },
      ],
    },
  };
  const healthyCtx: AgentContext = {
    ownHistory: [], companyDigest: [], todayPeers: [],
    companySnapshot: {
      statuses: [{ dept: 'cyb', state: 'done', lastRun: now }],
      digest: [],
      outputs: [{ dept: 'cyb', incomplete: false, artifactCount: 3, hasSummary: true, ts: now }],
    },
  };

  beforeEach(() => completeRawMock.mockClear());

  it('feeds agent run-health into the prompt', async () => {
    await run(critCtx);
    expect(completeRawMock).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: expect.stringContaining('run failed: boom') }),
    );
  });

  it('returns a critical alert when an agent is down', async () => {
    const r = await run(critCtx);
    expect(r.alert?.severity).toBe('critical');
    expect(r.alert?.text).toContain('OPS ALERT');
    expect(r.alert?.text).toContain('FIN');
  });

  it('emits agent-health artifacts', async () => {
    const r = await run(critCtx);
    expect((r.artifacts ?? []).some((a) => a.title === 'agent health')).toBe(true);
    expect((r.artifacts ?? []).some((a) => a.title === 'agent issues')).toBe(true);
  });

  it('no alert when all monitored agents are healthy', async () => {
    const r = await run(healthyCtx);
    expect(r.alert).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agents/operations.test.ts -t "internal monitoring"`
Expected: FAIL — prompt lacks health, `alert` undefined, no `agent health` artifact.

- [ ] **Step 3: Rewrite `run()`**

In `src/lib/agents/operations.ts`, extend the health import to include the runtime helpers:

```ts
import {
  assessCompanyHealth, criticalAlerts, overallSeverity, formatHealth,
  type AgentHealth, type Severity,
} from './health';
```

Replace the entire `run()` function body with:

```ts
export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const [deploys, activity] = await Promise.all([
    fetchDeployments().catch(() => []),
    fetchActivity().catch(() => []),
  ]);
  const deployLines = formatDeployments(deploys);
  const activityLines = formatActivity(activity);
  const allOk = deploys.length > 0 && deploys.every((d) => d.ok);

  const snap = ctx.companySnapshot;
  const healths = snap
    ? assessCompanyHealth({
        statuses: snap.statuses, outputs: snap.outputs ?? [], digest: snap.digest, now: Date.now(),
      })
    : [];
  const healthLines = formatHealth(healths);
  const worst = overallSeverity(healths);
  const crit = criticalAlerts(healths);

  const context = formatContext(ctx);
  const { text: markdown, stopReason } = await completeRaw({
    system: PERSONAS.ops,
    prompt: `${context ? context + '\n\n---\n\n' : ''}CI/CD snapshot.\n\nDeployments:\n${deployLines.join('\n') || 'none'}\n\nRepo activity:\n${activityLines.join('\n') || 'none'}\n\nAgent run-health (internal monitoring):\n${healthLines || 'no snapshot'}\n\nสรุปสุขภาพ deploy/CI และสุขภาพการทำงานของเอเจนต์อื่น แล้วชี้ "สิ่งเดียวที่ควรแก้วันนี้" วิเคราะห์เอเจนต์ที่มีปัญหา (error/stale/truncated/empty) พร้อมสาเหตุและวิธีแก้ และใส่ประเด็นเหล่านี้ในส่วน ## Flags เพื่อส่งต่อ CEO ถ้าต้องอ้างอิงภายนอก (status page/changelog) ให้ค้นเว็บและแนบแหล่ง เปิดรายงานด้วยบล็อก \`\`\`json findings ตามสคีมาในบทบาทของคุณ`,
    webSearch: true,
    maxSearches: 3,
    maxTokens: 8000,
  });

  const findings = parseOperationsFindings(markdown) ?? { fixToday: '', notes: [] };
  const artifacts = [
    ...opsArtifacts(deploys, activity),
    ...agentHealthArtifacts(healths),
    ...opsNoteArtifacts(findings),
  ];
  const sources = findings.notes.map((n) => n.citation);

  const SEV_EMOJI: Record<Severity, string> = { ok: '🟢', info: '🟢', warning: '🟡', critical: '🔴' };
  const deployPart = allOk ? 'all deploys green' : 'deploy attention needed';
  const agentPart =
    worst === 'critical' ? `${crit.length} agent(s) need urgent attention`
    : worst === 'warning' ? 'agent warnings present'
    : 'all agents healthy';
  const baseSummary = `${SEV_EMOJI[worst]} ${agentPart} · ${deployPart}`;

  const alert =
    crit.length > 0
      ? {
          severity: 'critical' as const,
          text:
            `🔴 OPS ALERT\nระบบ: ${crit.map((h) => h.dept.toUpperCase()).join(', ')}\n` +
            `อาการ: ${crit
              .map((h) => `${h.dept.toUpperCase()} ${h.issues
                .filter((i) => i.severity === 'critical')
                .map((i) => i.detail).join('; ')}`)
              .join(' | ')}\n` +
            `Action: ตรวจ cron/logs ของเอเจนต์ที่กระทบ แล้วรันใหม่`,
        }
      : undefined;

  return {
    markdown,
    summary: findings.fixToday ? `${baseSummary} · fix: ${findings.fixToday}` : baseSummary,
    feedMsg: crit.length > 0 ? 'ops alert: agent issue 🔴' : allOk ? 'all systems green 🚀' : 'deploy issue flagged ⚠',
    artifacts,
    tags: opsTags(deploys, activity),
    provenance: findings.notes.length > 0 ? 'web' : 'api',
    sources,
    alert,
    incomplete: stopReason === 'max_tokens',
    meta: { deploys, activity, fixToday: findings.fixToday, notes: findings.notes.length, health: healths, stopReason },
  };
}
```

Note: the unused `AgentHealth` type import is fine if referenced; if `tsc` flags it as unused, drop `AgentHealth` from this import (it is already imported in Task 4's `agentHealthArtifacts`). Keep only the symbols actually used in this file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/agents/operations.test.ts`
Expected: PASS (existing truncation tests + new monitoring tests).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS. If an unused-import error appears for `AgentHealth`/`Severity`, remove the unused symbol from the `./health` import line and re-run.

- [ ] **Step 6: Commit**

```bash
git add src/lib/agents/operations.ts src/lib/agents/operations.test.ts
git commit -m "feat(ops): run() monitors agents, feeds prompt, emits critical alert"
```

---

## Task 6: Runner dispatches the critical alert

**Files:**
- Modify: `src/lib/agents/runner.ts`
- Test: `src/lib/agents/runner.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/lib/agents/runner.test.ts`, inside the existing `describe('runAgent', ...)` block, add two tests:

```ts
  it('sends a second notify for a critical alert', async () => {
    const repo = fakeRepo();
    const notify = vi.fn(async () => {});
    const run = vi.fn(async (): Promise<AgentRunResult> => ({
      markdown: '# x\n\n## Highlight\nh\n\n## Flags\n- f',
      summary: 's', feedMsg: 'm',
      alert: { severity: 'critical', text: '🔴 OPS ALERT\nระบบ: FIN' },
    }));

    await runAgent({ dept: 'ops', run }, { repo, notify });

    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenLastCalledWith(expect.stringContaining('OPS ALERT'));
  });

  it('sends only one notify when there is no alert', async () => {
    const repo = fakeRepo();
    const notify = vi.fn(async () => {});
    const run = vi.fn(async (): Promise<AgentRunResult> => ({
      markdown: '# x\n\n## Highlight\nh\n\n## Flags\n- f',
      summary: 's', feedMsg: 'm',
    }));

    await runAgent({ dept: 'ops', run }, { repo, notify });

    expect(notify).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agents/runner.test.ts -t "critical alert"`
Expected: FAIL — only one notify fires (alert path not implemented).

- [ ] **Step 3: Implement the dispatch**

In `src/lib/agents/runner.ts`, find the success-path notify near the end of `runAgent`:

```ts
    const warn = incomplete ? '\n⚠️ รายงานอาจไม่สมบูรณ์ — ตรวจก่อนเผยแพร่' : '';
    await notify(`*${dept.toUpperCase()}* ✓ ${result.summary}${warn}\n\n${markdown.slice(0, 800)}`);
    return result;
```

Insert the alert dispatch between the notify and `return result;`:

```ts
    const warn = incomplete ? '\n⚠️ รายงานอาจไม่สมบูรณ์ — ตรวจก่อนเผยแพร่' : '';
    await notify(`*${dept.toUpperCase()}* ✓ ${result.summary}${warn}\n\n${markdown.slice(0, 800)}`);
    if (result.alert) await notify(result.alert.text);
    return result;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agents/runner.test.ts`
Expected: PASS (all runner tests incl. the new alert ones).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/runner.ts src/lib/agents/runner.test.ts
git commit -m "feat(ops): runner sends critical OPS ALERT as a distinct notify"
```

---

## Task 7: Update the role brief (`.agents/Operation Agent.md`)

**Files:**
- Modify: `.agents/Operation Agent.md`
- Test: `src/lib/agents/roles.test.ts` (passes by reading the file verbatim — no edit)

- [ ] **Step 1: Expand the autonomous-mission paragraph**

In `.agents/Operation Agent.md`, find:

```markdown
## ภารกิจประจำรอบ (โหมดอัตโนมัติ)
ทุกวัน สรุปสุขภาพการ deploy/CI จริงจาก Vercel + GitHub แล้วชี้ "สิ่งเดียวที่ควรแก้วันนี้" (fixToday) ถ้าต้องอ้างอิงข้อมูลภายนอก (เช่น status page, changelog) ให้แนบแหล่ง+วันที่ ห้ามแต่งข้อมูลหรือแหล่งอ้างอิง
```

Replace it with:

```markdown
## ภารกิจประจำรอบ (โหมดอัตโนมัติ)
ทุกวัน สรุปสุขภาพการ deploy/CI จริงจาก Vercel + GitHub **และเฝ้าระวังสุขภาพการทำงานของเอเจนต์อื่นทุกตัวจาก run จริงในระบบ** (ไม่ใช่ข้อมูลสมมติ): การรันล้มเหลว (error), ขาดรอบ/ไม่รันตามกำหนด (stale), รายงานถูกตัด (truncated/max_tokens), ผลงานว่างเปล่า (empty/ไม่มี artifact) และ flag ที่ยังค้าง แล้วชี้ "สิ่งเดียวที่ควรแก้วันนี้" (fixToday) โดยเน้นสิ่งที่จะยกระดับผลิตภัณฑ์ของเอเจนต์อื่น (เช่น รายงาน Finance, AI R&D, CyberX) ถ้าต้องอ้างอิงข้อมูลภายนอก (เช่น status page, changelog) ให้แนบแหล่ง+วันที่ ห้ามแต่งข้อมูลหรือแหล่งอ้างอิง

**ระดับความรุนแรง (severity):** 🔴 critical = เอเจนต์ error หรือ stale หนัก (เกิน 2 เท่าของรอบที่ควรรัน) → escalate ทันที · 🟡 warning = stale, truncated, หรือ empty · 🟢 info = มี flag ค้าง เหตุการณ์ระดับ critical ให้สรุปไว้ในส่วน `## Flags` เพื่อส่งต่อ CEO Agent และระบบจะแจ้งเตือนผ่าน Telegram แยกต่างหาก (🔴 OPS ALERT)

> หมายเหตุ: การติดตาม token/credit คงเหลือของแต่ละเอเจนต์เป็นเฟสถัดไป (ระบบยังไม่เก็บ usage ต่อรอบ) — รอบนี้โฟกัสที่ run-health
```

- [ ] **Step 2: Add the agent-health step to the analyst report structure**

In the same file, find the ordered list under `## โครงสร้างรายงานฉบับวิเคราะห์`:

```markdown
1. **สรุปผู้บริหาร (กล่อง Verdict)** — สถานะรวม (🟢/🟡/🔴) + "สิ่งเดียวที่ควรแก้วันนี้" + เหตุผล 1 ประโยค นำด้วยข้อสรุปเสมอ
2. **ตาราง scorecard ระบบ** — ระบบ/โดเมน · สถานะ · deploy ล่าสุด · CI (มีบรรทัด "ที่มา: …" ใต้ตาราง)
3. **บทวิเคราะห์รายระบบ** — หัวข้อย่อยต่อระบบ: อาการ · สาเหตุที่เป็นไปได้ · หลักฐาน (ตัวเลข/สถานะจริง)
4. **แผนการกระทำ** — เรียงตามลำดับความสำคัญ ระบุว่าแผนกไหนควรทำต่อ
5. **ความเสี่ยง + ข้อจำกัด** — ช่องว่างของ visibility · ข้อมูล ณ เวลาที่ตรวจ · สิ่งที่ตรวจไม่ได้
6. **แหล่งอ้างอิง** — รายการ "ชื่อเอกสาร — วันที่ — URL" (status page / changelog ที่ใช้จริง)
```

Replace the whole list with:

```markdown
1. **สรุปผู้บริหาร (กล่อง Verdict)** — สถานะรวม (🟢/🟡/🔴) + "สิ่งเดียวที่ควรแก้วันนี้" + เหตุผล 1 ประโยค นำด้วยข้อสรุปเสมอ
2. **ตาราง scorecard เอเจนต์ภายใน** — เอเจนต์ · severity (🔴/🟡/🟢) · ปัญหาที่พบ (error/stale/truncated/empty/flags) แสดงเฉพาะตัวที่ต้องสนใจ
3. **ตาราง scorecard ระบบ (CI/CD)** — ระบบ/โดเมน · สถานะ · deploy ล่าสุด · CI (มีบรรทัด "ที่มา: …" ใต้ตาราง)
4. **บทวิเคราะห์รายเอเจนต์/รายระบบ** — หัวข้อย่อยต่อเอเจนต์หรือระบบที่มีปัญหา: อาการ · สาเหตุที่เป็นไปได้ · หลักฐาน (ตัวเลข/สถานะจริง) · วิธีแก้
5. **แผนการกระทำ** — เรียงตามลำดับความสำคัญ ระบุว่าแผนกไหนควรทำต่อ
6. **ความเสี่ยง + ข้อจำกัด** — ช่องว่างของ visibility · ข้อมูล ณ เวลาที่ตรวจ · สิ่งที่ตรวจไม่ได้
7. **แหล่งอ้างอิง** — รายการ "ชื่อเอกสาร — วันที่ — URL" (status page / changelog ที่ใช้จริง)
```

- [ ] **Step 3: Verify the brief still loads verbatim**

Run: `npx vitest run src/lib/agents/roles.test.ts`
Expected: PASS — `ROLES.ops` equals the file contents (the test reads the same file).

- [ ] **Step 4: Commit**

```bash
git add ".agents/Operation Agent.md"
git commit -m "docs(ops): brief covers internal agent monitoring + severity + report step"
```

---

## Task 8: Version bump + full verification

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Bump the version**

In `package.json`, change:

```json
  "version": "1.6.0",
```

to:

```json
  "version": "1.7.0",
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites green (health, operations, runner, roles, and the rest).

- [ ] **Step 3: Type-check + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS — no type errors, no lint errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: PASS — production build succeeds.

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "release: v1.7.0 — Operations internal monitor"
```

---

## Self-Review notes (addressed in this plan)

- **Spec coverage:** Layer 1 (types) → Task 1; Layer 2 (`health.ts`) → Task 2; data plumbing (`buildContext`) → Task 3; Layer 3 artifacts → Task 4; Layer 3 run wiring + prompt-feed + summary → Task 5; Layer 4 alert field + dispatch → Tasks 1/5/6; Layer 5 brief → Task 7; version → Task 8; testing → every task is TDD. Phase 2 (token tracking) intentionally not implemented.
- **Type consistency:** `AgentOutputHealth` defined once in `types.ts` (Task 1), imported by `health.ts` (Task 2) and `runner.ts` (Task 3) — no duplication, no cycle (`health.ts` imports only from `types.ts`). `AgentHealth`/`Severity` defined in `health.ts`, imported by `operations.ts` (Tasks 4–5) and the artifact test (Task 4). `assessCompanyHealth`/`overallSeverity`/`criticalAlerts`/`formatHealth` names match across module, tests, and `run()`.
- **Manual verification (post-merge):** the scorecard + issues table have no visual unit tests; confirm on `/dashboard/ops` with `npm run dev` after deploy (consistent with repo convention). Runs only trigger via cron/admin/Telegram, so the live agent-health data appears after the next ops cron.
- **Cadence drift:** `EXPECTED_CADENCE_HOURS` hand-mirrors `vercel.json`; the comment in `health.ts` flags the dual-update requirement.
