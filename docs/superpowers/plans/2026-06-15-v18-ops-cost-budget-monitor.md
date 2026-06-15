# v1.8 Operations cost & budget monitor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture per-run Claude token usage into a Redis ledger, price it in USD, and give the Operations agent a cost/budget view (per-agent spend, MTD, 7-day burn) with an optional budget that — when set — feeds the v1.7 severity + OPS ALERT system.

**Architecture:** Each LLM dept module already calls `completeRaw()` (which returns `usage`); they will pass `usage` + the model up on their `AgentRunResult`. The runner records each run into an append-only Redis **list** `usage:ledger` (the same lpush+ltrim pattern history/feed use — the Redis client interface has no `zadd`). On its run, Operations reads the ledger from `ctx.companySnapshot.usage`, aggregates it (pure `usage.ts`), prices it (pure `cost.ts`), and renders artifacts + folds an optional budget rule into its severity/summary/flags/alert.

**Tech Stack:** TypeScript, Next.js 16, Vitest, Upstash Redis (via the existing `RedisClientLike` abstraction), Anthropic SDK.

**Spec:** `docs/superpowers/specs/2026-06-15-v18-ops-cost-budget-monitor-design.md`

---

## File structure

**Create:**
- `src/lib/cost.ts` — pricing table + `costOf()` (pure).
- `src/lib/cost.test.ts`
- `src/lib/agents/usage.ts` — `UsageAggregate`, `aggregateUsage()`, `assessBudget()` (pure).
- `src/lib/agents/usage.test.ts`

**Modify:**
- `src/lib/agents/types.ts` — add `UsageEntry`; add `usage`/`model` to `AgentRunResult`; add `usage` to `companySnapshot`.
- `src/lib/claude.ts` — add `model` to `CompleteResult`.
- `src/lib/redis.ts` — `recordUsage()` + `getUsageSince()` + constants.
- `src/lib/redis.usage.test.ts` (create) — ledger tests.
- `src/lib/agents/finance.ts`, `cyberx.ts`, `marketing.ts`, `rnd.ts`, `operations.ts`, `ceo.ts` — capture `usage`/`model` onto the result.
- `src/lib/agents/runner.ts` — populate `companySnapshot.usage` for ops; `recordUsage()` in the post-run fan-out.
- `src/lib/agents/runner.usage.test.ts` (create) — fan-out ledger test.
- `src/lib/agents/health.ts` — `export` the existing `worst()` helper.
- `src/lib/agents/operations.ts` — `operationsCostArtifacts()` + wire budget into prompt/summary/flags/alert/severity.
- `src/lib/agents/operations.artifacts.test.ts` — cost-artifact tests.
- `src/lib/agents/operations.test.ts` — budget-alert tests.
- `package.json`, `CHANGELOG.md`, `CLAUDE.md`, `.agents/Operations Agent.md` — version + docs.

> **Note on the artifact kinds:** the spec says "budget Scorecard", but the `scorecard` Artifact kind renders status tiles only (`ok`/`warn`/`down`), not numbers. This plan renders the budget panel as a **`table`** (metric → value) and per-agent cost as **`bars`**. Same information, correct chart kinds, no new primitive.

---

## Task 1: Pricing module (`cost.ts`)

**Files:**
- Create: `src/lib/cost.ts`
- Test: `src/lib/cost.test.ts`

> Before committing, confirm the three per-Mtok rates against current Anthropic pricing (the `claude-api` skill covers pricing). They are the only data in this file; the structure/logic is final.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/cost.test.ts
import { describe, it, expect } from 'vitest';
import { costOf, isKnownModel, PRICING } from './cost';

describe('costOf', () => {
  it('prices a known model from input/output tokens', () => {
    // Haiku @ $1/Mtok in, $5/Mtok out: 1M in + 1M out = $1 + $5 = $6
    const c = costOf('claude-haiku-4-5-20251001', { input: 1_000_000, output: 1_000_000 });
    expect(c).toBeCloseTo(PRICING['claude-haiku-4-5-20251001'].input + PRICING['claude-haiku-4-5-20251001'].output, 6);
  });

  it('prices Sonnet higher than Haiku for the same tokens', () => {
    const usage = { input: 500_000, output: 500_000 };
    expect(costOf('claude-sonnet-4-6', usage)).toBeGreaterThan(costOf('claude-haiku-4-5-20251001', usage));
  });

  it('falls back to a non-zero rate for an unknown model', () => {
    expect(costOf('mystery-model', { input: 1_000_000, output: 0 })).toBeGreaterThan(0);
    expect(isKnownModel('mystery-model')).toBe(false);
    expect(isKnownModel('claude-haiku-4-5-20251001')).toBe(true);
  });

  it('returns 0 for zero usage', () => {
    expect(costOf('claude-haiku-4-5-20251001', { input: 0, output: 0 })).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/cost.test.ts`
Expected: FAIL — cannot find module `./cost`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/cost.ts
// USD per 1,000,000 tokens. Authored from Anthropic public pricing (2026-06).
// Cost is computed at read time from stored token counts, so updating a rate
// re-prices all history. Confirm rates via the claude-api skill before shipping.
export interface ModelPrice { input: number; output: number }

export const PRICING: Record<string, ModelPrice> = {
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-opus-4-8': { input: 15, output: 75 },
};

// Fallback when a model id is absent from PRICING — use the default agent model
// (Haiku) so an unknown model still yields a non-zero, clearly-estimated cost.
export const DEFAULT_MODEL_PRICE: ModelPrice = PRICING['claude-haiku-4-5-20251001'];

export function isKnownModel(model: string): boolean {
  return model in PRICING;
}

export function costOf(model: string, usage: { input: number; output: number }): number {
  const price = PRICING[model] ?? DEFAULT_MODEL_PRICE;
  return (usage.input / 1_000_000) * price.input + (usage.output / 1_000_000) * price.output;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/cost.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/cost.ts src/lib/cost.test.ts
git commit -m "feat(cost): per-model pricing table + costOf()"
```

---

## Task 2: Shared types (`types.ts`)

**Files:**
- Modify: `src/lib/agents/types.ts`

Type-only change — verified with `tsc`, no unit test.

- [ ] **Step 1: Add `UsageEntry` after the `FeedEvent` interface (around line 46)**

```ts
/** v1.8 — one LLM run's token usage, appended to the cost ledger. */
export interface UsageEntry {
  dept: DeptId;
  model: string;
  input: number;
  output: number;
  ts: number; // epoch ms
}
```

- [ ] **Step 2: Add `usage` + `model` to `AgentRunResult`** (after the `incomplete?` field, before `alert?`)

```ts
  /** v1.8 — token usage + the model used, recorded to the cost ledger by the
   *  runner. Set by LLM dept modules; absent for non-LLM runs (then not recorded). */
  usage?: { input: number; output: number };
  model?: string;
```

- [ ] **Step 3: Add `usage` to `companySnapshot`** (in `AgentContext`, alongside `outputs?`)

```ts
    /** v1.8 — recent cost-ledger entries; filled for the ops monitor only. */
    usage?: UsageEntry[];
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/types.ts
git commit -m "feat(types): UsageEntry + usage/model on run result + snapshot"
```

---

## Task 3: Usage aggregation (`usage.ts`)

**Files:**
- Create: `src/lib/agents/usage.ts`
- Test: `src/lib/agents/usage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/agents/usage.test.ts
import { describe, it, expect } from 'vitest';
import { aggregateUsage, assessBudget } from './usage';
import type { UsageEntry } from './types';

// 2026-06-15T12:00:00Z — mid-June, UTC.
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const DAY = 86_400_000;

const sonnet = (ts: number, output: number): UsageEntry =>
  ({ dept: 'fin', model: 'claude-sonnet-4-6', input: 0, output, ts });

describe('aggregateUsage', () => {
  it('sums only the current calendar month (UTC) into MTD', () => {
    const entries: UsageEntry[] = [
      sonnet(Date.UTC(2026, 5, 2), 1_000_000),  // June — counted
      sonnet(Date.UTC(2026, 4, 30), 1_000_000), // May  — excluded from MTD
    ];
    const agg = aggregateUsage(entries, { now: NOW, budgetUsd: null });
    expect(agg.mtdTokens).toBe(1_000_000);
    expect(agg.mtdUsd).toBeCloseTo(15, 6); // 1M out @ $15/Mtok
  });

  it('computes a 7-day burn-per-day average', () => {
    const entries = [sonnet(NOW - 2 * DAY, 1_000_000)]; // $15 in last 7d
    const agg = aggregateUsage(entries, { now: NOW, budgetUsd: null });
    expect(agg.last7dBurnUsdPerDay).toBeCloseTo(15 / 7, 6);
  });

  it('projects month-end from burn × days left', () => {
    const entries = [sonnet(NOW - 1 * DAY, 700_000)]; // $10.5 burn, all in last 7d & MTD
    const agg = aggregateUsage(entries, { now: NOW, budgetUsd: 30 });
    // June has 30 days; day 15 → 15 days left.
    expect(agg.daysLeftInMonth).toBe(15);
    expect(agg.projectedMonthEndUsd).toBeCloseTo(agg.mtdUsd + agg.last7dBurnUsdPerDay * 15, 6);
  });

  it('treats budget<=0 / null as display-only (pctUsed null)', () => {
    const agg0 = aggregateUsage([sonnet(NOW, 1_000_000)], { now: NOW, budgetUsd: 0 });
    expect(agg0.budgetUsd).toBeNull();
    expect(agg0.pctUsed).toBeNull();
  });

  it('groups per-dept cost, sorted desc', () => {
    const entries: UsageEntry[] = [
      { dept: 'cyb', model: 'claude-haiku-4-5-20251001', input: 0, output: 1_000_000, ts: NOW }, // $5
      { dept: 'fin', model: 'claude-sonnet-4-6', input: 0, output: 1_000_000, ts: NOW },          // $15
    ];
    const agg = aggregateUsage(entries, { now: NOW, budgetUsd: null });
    expect(agg.perDept.map((d) => d.dept)).toEqual(['fin', 'cyb']);
  });

  it('handles an empty ledger', () => {
    const agg = aggregateUsage([], { now: NOW, budgetUsd: 30 });
    expect(agg.mtdUsd).toBe(0);
    expect(agg.pctUsed).toBe(0);
  });
});

describe('assessBudget', () => {
  const mk = (over: Partial<ReturnType<typeof aggregateUsage>>) =>
    ({ perDept: [], mtdUsd: 0, mtdTokens: 0, last7dBurnUsdPerDay: 0, projectedMonthEndUsd: 0,
       daysLeftInMonth: 15, budgetUsd: 30, pctUsed: 0, ...over });

  it('returns null when display-only', () => {
    expect(assessBudget(mk({ budgetUsd: null, pctUsed: null }))).toBeNull();
  });
  it('ok below 80%', () => {
    expect(assessBudget(mk({ mtdUsd: 23.7, pctUsed: 79 }))!.severity).toBe('ok');
  });
  it('warning at >=80%', () => {
    expect(assessBudget(mk({ mtdUsd: 24, pctUsed: 80 }))!.severity).toBe('warning');
  });
  it('critical at >=100%', () => {
    expect(assessBudget(mk({ mtdUsd: 31, pctUsed: 103 }))!.severity).toBe('critical');
  });
  it('critical on projected overrun even below 100% MTD', () => {
    expect(assessBudget(mk({ mtdUsd: 15, pctUsed: 50, projectedMonthEndUsd: 45 }))!.severity).toBe('critical');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agents/usage.test.ts`
Expected: FAIL — cannot find module `./usage`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/agents/usage.ts
import type { DeptId } from '@/lib/data/departments';
import type { UsageEntry } from './types';
import type { Severity } from './health';
import { costOf } from '@/lib/cost';

export interface DeptUsage { dept: DeptId; tokens: number; costUsd: number }

export interface UsageAggregate {
  perDept: DeptUsage[];
  mtdUsd: number;
  mtdTokens: number;
  last7dBurnUsdPerDay: number;
  projectedMonthEndUsd: number;
  daysLeftInMonth: number;
  budgetUsd: number | null;
  pctUsed: number | null;
}

const DAY_MS = 86_400_000;

function startOfMonthUtc(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}
function daysInMonthUtc(now: number): number {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

export function aggregateUsage(
  entries: UsageEntry[],
  opts: { now: number; budgetUsd: number | null },
): UsageAggregate {
  const { now } = opts;
  const budgetUsd = opts.budgetUsd && opts.budgetUsd > 0 ? opts.budgetUsd : null;
  const monthStart = startOfMonthUtc(now);
  const sevenDayStart = now - 7 * DAY_MS;

  const perDeptMap = new Map<DeptId, DeptUsage>();
  let mtdUsd = 0;
  let mtdTokens = 0;
  let last7dUsd = 0;

  for (const e of entries) {
    const cost = costOf(e.model, { input: e.input, output: e.output });
    const tokens = e.input + e.output;
    if (e.ts >= monthStart) {
      mtdUsd += cost;
      mtdTokens += tokens;
      const cur = perDeptMap.get(e.dept) ?? { dept: e.dept, tokens: 0, costUsd: 0 };
      cur.tokens += tokens;
      cur.costUsd += cost;
      perDeptMap.set(e.dept, cur);
    }
    if (e.ts >= sevenDayStart) last7dUsd += cost;
  }

  const perDept = [...perDeptMap.values()].sort((a, b) => b.costUsd - a.costUsd);
  const last7dBurnUsdPerDay = last7dUsd / 7;
  const daysLeftInMonth = daysInMonthUtc(now) - new Date(now).getUTCDate();
  const projectedMonthEndUsd = mtdUsd + last7dBurnUsdPerDay * daysLeftInMonth;
  const pctUsed = budgetUsd ? (mtdUsd / budgetUsd) * 100 : null;

  return { perDept, mtdUsd, mtdTokens, last7dBurnUsdPerDay, projectedMonthEndUsd, daysLeftInMonth, budgetUsd, pctUsed };
}

export function assessBudget(agg: UsageAggregate): { severity: Severity; detail: string } | null {
  if (agg.budgetUsd == null || agg.pctUsed == null) return null;
  const pct = Math.round(agg.pctUsed);
  const spend = `$${agg.mtdUsd.toFixed(2)} / $${agg.budgetUsd.toFixed(2)}`;
  if (agg.pctUsed >= 100) return { severity: 'critical', detail: `budget exceeded: ${spend} (${pct}%)` };
  if (agg.projectedMonthEndUsd > agg.budgetUsd) {
    return { severity: 'critical', detail: `projected overrun: ~$${agg.projectedMonthEndUsd.toFixed(2)} vs $${agg.budgetUsd.toFixed(2)} budget` };
  }
  if (agg.pctUsed >= 80) return { severity: 'warning', detail: `budget ${pct}% used: ${spend}` };
  return { severity: 'ok', detail: `budget ${pct}% used: ${spend}` };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/agents/usage.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/usage.ts src/lib/agents/usage.test.ts
git commit -m "feat(usage): MTD/7d-burn aggregation + optional budget rule"
```

---

## Task 4: `completeRaw` surfaces the model

**Files:**
- Modify: `src/lib/claude.ts`

Type + passthrough change — verified with `tsc` (`completeRaw` hits the network, so no unit test).

- [ ] **Step 1: Add `model` to `CompleteResult`** (around line 32)

```ts
export interface CompleteResult {
  text: string;
  stopReason: string | null;
  usage: { input: number; output: number };
  /** v1.8 — the model actually used for the call (for cost attribution). */
  model: string;
}
```

- [ ] **Step 2: Return `model` from `completeRaw`** (the `return { ... }` near line 117 — `model` is already the resolved local from the destructure on line 72)

```ts
  return {
    text: texts.filter(Boolean).join('\n').trim(),
    stopReason,
    usage: { input, output },
    model,
  };
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/claude.ts
git commit -m "feat(claude): surface the model used on CompleteResult"
```

---

## Task 5: Redis usage ledger

**Files:**
- Modify: `src/lib/redis.ts`
- Test: `src/lib/redis.usage.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/redis.usage.test.ts
import { describe, it, expect } from 'vitest';
import { makeRedisRepo, type RedisClientLike } from './redis';
import type { UsageEntry } from './agents/types';

function memoryClient(): RedisClientLike {
  const lists = new Map<string, unknown[]>();
  const store = new Map<string, unknown>();
  return {
    async set(k, v) { store.set(k, v); return 'OK'; },
    async get<T>(k: string) { return (store.get(k) as T) ?? null; },
    async del(...ks: string[]) { ks.forEach((k) => store.delete(k)); return ks.length; },
    async mget<T>(ks: string[]) { return ks.map((k) => (store.get(k) as T) ?? null); },
    async lpush(k, v) { const l = lists.get(k) ?? []; l.unshift(v); lists.set(k, l); return l.length; },
    async lrem(k, _c, v) { const l = lists.get(k) ?? []; lists.set(k, l.filter((x) => x !== v)); return 0; },
    async ltrim(k, s, e) { const l = lists.get(k) ?? []; lists.set(k, l.slice(s, e === -1 ? undefined : e + 1)); return 'OK'; },
    async lrange<T>(k: string, s: number, e: number) { const l = (lists.get(k) ?? []) as T[]; return l.slice(s, e === -1 ? undefined : e + 1); },
  };
}

const DAY = 86_400_000;
const entry = (dept: UsageEntry['dept'], ts: number): UsageEntry =>
  ({ dept, model: 'claude-haiku-4-5-20251001', input: 100, output: 200, ts });

describe('usage ledger', () => {
  it('records entries and returns only those within the window', async () => {
    const repo = makeRedisRepo(memoryClient());
    const now = Date.now();
    await repo.recordUsage(entry('fin', now - 1 * DAY));
    await repo.recordUsage(entry('cyb', now - 50 * DAY)); // outside a 40d window

    const recent = await repo.getUsageSince(now - 40 * DAY);
    expect(recent).toHaveLength(1);
    expect(recent[0].dept).toBe('fin');
  });

  it('returns an empty array when nothing recorded', async () => {
    const repo = makeRedisRepo(memoryClient());
    expect(await repo.getUsageSince(0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/redis.usage.test.ts`
Expected: FAIL — `repo.recordUsage is not a function`.

- [ ] **Step 3: Implement the ledger in `redis.ts`**

Add `UsageEntry` to the type import (line 3):

```ts
import type { AgentStatus, AgentOutput, FeedEvent, HistoryEntry, DigestEntry, KbEntry, UsageEntry } from './agents/types';
```

Add constants near the other caps (after line ~11):

```ts
const USAGE_KEY = 'usage:ledger';
const USAGE_CAP = 1000; // ~months of runs at the current cadence; window-filtered on read
```

Add two methods to the `repo` object in `makeRedisRepo` (e.g. right after `getDigest`):

```ts
    async recordUsage(entry: UsageEntry) {
      await client.lpush(USAGE_KEY, entry);
      await client.ltrim(USAGE_KEY, 0, USAGE_CAP - 1);
    },
    async getUsageSince(sinceTs: number): Promise<UsageEntry[]> {
      const all = await client.lrange<UsageEntry>(USAGE_KEY, 0, USAGE_CAP - 1);
      return all.filter((e) => e && typeof e.ts === 'number' && e.ts >= sinceTs);
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/redis.usage.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/redis.ts src/lib/redis.usage.test.ts
git commit -m "feat(redis): append-only usage ledger (recordUsage/getUsageSince)"
```

---

## Task 6: Dept modules pass usage + model up

**Files:**
- Modify: `src/lib/agents/finance.ts`, `cyberx.ts`, `marketing.ts`, `rnd.ts`, `operations.ts`, `ceo.ts`

For **each** of the six modules: at the `completeRaw` call site, add `usage, model` to the destructure, and add `usage, model,` to the returned `AgentRunResult` object. Two examples below — apply the identical shape to all six. (Existing test mocks return no `model`; that resolves to `undefined`, which the runner safely skips — no test breakage.)

- [ ] **Step 1 — finance.ts:** change the destructure (line ~86)

```ts
  const { text: markdown, stopReason, usage, model } = await completeRaw({
```

and add to the returned object (alongside `incomplete`, before `meta`):

```ts
    usage, model,
```

- [ ] **Step 2 — operations.ts:** change the destructure (line ~127)

```ts
  const { text: markdown, stopReason, usage, model } = await completeRaw({
```

and add `usage, model,` to the returned object (alongside `incomplete`/`meta`).

- [ ] **Step 3 — apply the same two edits to `cyberx.ts`, `marketing.ts`, `rnd.ts`, `ceo.ts`**

For each: find `const { text: markdown, stopReason } = await completeRaw({` → add `, usage, model`; find the `return { ... }` and add `usage, model,`.

- [ ] **Step 4: Verify everything still compiles and existing tests pass**

Run: `npx tsc --noEmit && npx vitest run src/lib/agents`
Expected: PASS (no type errors; all existing dept tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agents/finance.ts src/lib/agents/cyberx.ts src/lib/agents/marketing.ts src/lib/agents/rnd.ts src/lib/agents/operations.ts src/lib/agents/ceo.ts
git commit -m "feat(agents): carry token usage + model on every run result"
```

---

## Task 7: Runner records usage + feeds the ops snapshot

**Files:**
- Modify: `src/lib/agents/runner.ts`
- Test: `src/lib/agents/runner.usage.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/agents/runner.usage.test.ts
import { describe, it, expect } from 'vitest';
import { makeRedisRepo, type RedisClientLike } from '@/lib/redis';
import { runAgent, type Agent } from './runner';
import type { AgentRunResult } from './types';

function memoryClient(): RedisClientLike {
  const lists = new Map<string, unknown[]>();
  const store = new Map<string, unknown>();
  return {
    async set(k, v) { store.set(k, v); return 'OK'; },
    async get<T>(k: string) { return (store.get(k) as T) ?? null; },
    async del(...ks: string[]) { ks.forEach((k) => store.delete(k)); return ks.length; },
    async mget<T>(ks: string[]) { return ks.map((k) => (store.get(k) as T) ?? null); },
    async lpush(k, v) { const l = lists.get(k) ?? []; l.unshift(v); lists.set(k, l); return l.length; },
    async lrem(k, _c, v) { const l = lists.get(k) ?? []; lists.set(k, l.filter((x) => x !== v)); return 0; },
    async ltrim(k, s, e) { const l = lists.get(k) ?? []; lists.set(k, l.slice(s, e === -1 ? undefined : e + 1)); return 'OK'; },
    async lrange<T>(k: string, s: number, e: number) { const l = (lists.get(k) ?? []) as T[]; return l.slice(s, e === -1 ? undefined : e + 1); },
  };
}

const baseResult: AgentRunResult = { markdown: '# x\n\n## Highlight\nh\n\n## Flags\nNone', summary: 's', feedMsg: 'm' };
const agentWith = (r: AgentRunResult): Agent => ({ dept: 'cyb', run: async () => r });

describe('runAgent — usage ledger', () => {
  it('records usage when the result carries usage + model', async () => {
    const repo = makeRedisRepo(memoryClient());
    await runAgent(agentWith({ ...baseResult, usage: { input: 10, output: 20 }, model: 'claude-haiku-4-5-20251001' }),
      { repo, notify: async () => {} });
    const ledger = await repo.getUsageSince(0);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({ dept: 'cyb', model: 'claude-haiku-4-5-20251001', input: 10, output: 20 });
    expect(typeof ledger[0].ts).toBe('number');
  });

  it('skips recording when usage/model are absent', async () => {
    const repo = makeRedisRepo(memoryClient());
    await runAgent(agentWith(baseResult), { repo, notify: async () => {} });
    expect(await repo.getUsageSince(0)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/agents/runner.usage.test.ts`
Expected: FAIL — ledger empty in the first test (recordUsage not yet wired).

- [ ] **Step 3: Wire `recordUsage` into the fan-out**

In `runAgent`, add to the `await Promise.all([ ... ])` array (after the `pushKb(...)` entry, around line 188):

```ts
      ...(result.usage && result.model
        ? [repo.recordUsage({ dept, model: result.model, input: result.usage.input, output: result.usage.output, ts: Date.parse(ts) })]
        : []),
```

- [ ] **Step 4: Feed the ledger into the ops snapshot**

In `buildContext`, the `else if (dept === 'ops')` branch (around line 91-107): read the ledger and include it.

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
          artifactCount: o?.artifacts?.length ?? 0,
          hasSummary: !!o?.summary,
          ts: o?.ts ?? null,
        };
      }),
    );
    const usage = await repo.getUsageSince(Date.now() - 40 * 86_400_000);
    companySnapshot = { statuses, digest, outputs, usage };
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/agents/runner.usage.test.ts && npx tsc --noEmit`
Expected: PASS (2 tests; no type errors).

- [ ] **Step 6: Commit**

```bash
git add src/lib/agents/runner.ts src/lib/agents/runner.usage.test.ts
git commit -m "feat(runner): record run usage to the ledger + feed ops snapshot"
```

---

## Task 8: Export `worst()` from health.ts

**Files:**
- Modify: `src/lib/agents/health.ts`

Operations needs to combine agent severity with the budget severity. `health.ts` already has the `worst(severities)` reducer — just export it.

- [ ] **Step 1: Export the helper** (line ~38)

```ts
export function worst(severities: Severity[]): Severity {
  return severities.reduce<Severity>((a, b) => (SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a), 'ok');
}
```

- [ ] **Step 2: Verify compile + existing health tests**

Run: `npx tsc --noEmit && npx vitest run src/lib/agents/health.test.ts`
Expected: PASS (export is additive; no behavior change).

- [ ] **Step 3: Commit**

```bash
git add src/lib/agents/health.ts
git commit -m "refactor(health): export worst() for cross-module severity composition"
```

---

## Task 9: Operations cost artifacts + budget wiring

**Files:**
- Modify: `src/lib/agents/operations.ts`
- Test: `src/lib/agents/operations.artifacts.test.ts` (add cases), `src/lib/agents/operations.test.ts` (add cases)

### 9a — cost artifact builder (TDD)

- [ ] **Step 1: Add failing tests to `operations.artifacts.test.ts`**

```ts
import { operationsCostArtifacts } from './operations';
import type { UsageAggregate } from './usage';

const aggBase: UsageAggregate = {
  perDept: [{ dept: 'fin', tokens: 1_000_000, costUsd: 4.1 }, { dept: 'cyb', tokens: 800_000, costUsd: 1.9 }],
  mtdUsd: 6, mtdTokens: 1_800_000, last7dBurnUsdPerDay: 0.55,
  projectedMonthEndUsd: 14.25, daysLeftInMonth: 15, budgetUsd: 30, pctUsed: 20,
};

describe('operationsCostArtifacts', () => {
  it('builds a per-agent cost bars chart + a budget table (api provenance)', () => {
    const arts = operationsCostArtifacts(aggBase);
    const bars = arts.find((a) => a.kind === 'bars');
    const table = arts.find((a) => a.kind === 'table');
    expect(bars?.title).toBe('agent cost (MTD)');
    expect(table?.title).toBe('cost & budget');
    expect(arts.every((a) => a.provenance === 'api')).toBe(true);
    // budget row present when budget set
    expect(JSON.stringify(table)).toContain('budget');
    expect(JSON.stringify(table)).toContain('20%');
  });

  it('shows "tracking only" when no budget is set', () => {
    const arts = operationsCostArtifacts({ ...aggBase, budgetUsd: null, pctUsed: null });
    const table = arts.find((a) => a.kind === 'table');
    expect(JSON.stringify(table)).toContain('tracking only');
  });

  it('renders a $0 table for an empty aggregate (no per-dept bars)', () => {
    const empty: UsageAggregate = { perDept: [], mtdUsd: 0, mtdTokens: 0, last7dBurnUsdPerDay: 0,
      projectedMonthEndUsd: 0, daysLeftInMonth: 15, budgetUsd: null, pctUsed: null };
    const arts = operationsCostArtifacts(empty);
    expect(arts.some((a) => a.kind === 'bars')).toBe(false);
    expect(arts.some((a) => a.kind === 'table')).toBe(true);
    expect(JSON.stringify(arts)).toContain('$0.00');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/agents/operations.artifacts.test.ts`
Expected: FAIL — `operationsCostArtifacts` not exported.

- [ ] **Step 3: Implement the builder in `operations.ts`**

Add imports at the top:

```ts
import { aggregateUsage, assessBudget, type UsageAggregate } from './usage';
import { worst } from './health';
```

(Update the existing `./health` import to drop `worst` duplication — `worst` now comes from the line above; keep `assessCompanyHealth, criticalAlerts, overallSeverity, formatHealth, type AgentHealth, type Severity` as-is.)

Add the builder + a budget parser:

```ts
function parseBudget(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Cost/budget charts built deterministically from our own ledger aggregate. */
export function operationsCostArtifacts(agg: UsageAggregate): Artifact[] {
  const arts: Artifact[] = [];
  if (agg.perDept.length > 0) {
    arts.push({
      kind: 'bars', title: 'agent cost (MTD)', unit: '$',
      series: agg.perDept.map((d) => ({ label: d.dept.toUpperCase(), value: Number(d.costUsd.toFixed(2)) })),
    });
  }
  const rows: string[][] = [
    ['spend (MTD)', `$${agg.mtdUsd.toFixed(2)}`],
    ['tokens (MTD)', agg.mtdTokens.toLocaleString('en-US')],
    ['burn (7d avg)', `$${agg.last7dBurnUsdPerDay.toFixed(2)}/day`],
  ];
  if (agg.budgetUsd != null) {
    rows.push(['budget', `$${agg.budgetUsd.toFixed(2)}/mo`]);
    rows.push(['used', `${Math.round(agg.pctUsed ?? 0)}%`]);
    rows.push(['projected month-end', `$${agg.projectedMonthEndUsd.toFixed(2)}`]);
  } else {
    rows.push(['budget', 'tracking only (set MONTHLY_BUDGET_USD)']);
  }
  arts.push({ kind: 'table', title: 'cost & budget', columns: ['metric', 'value'], rows });
  return arts.map((a) => withProvenance(a, 'api'));
}
```

- [ ] **Step 4: Run to verify the builder tests pass**

Run: `npx vitest run src/lib/agents/operations.artifacts.test.ts`
Expected: PASS.

### 9b — wire budget into run() severity / summary / flags / alert

- [ ] **Step 5: Add failing tests to `operations.test.ts`**

```ts
import { afterEach } from 'vitest';
import type { UsageEntry } from './types';

describe('operations.run — budget monitoring', () => {
  afterEach(() => { vi.unstubAllEnvs(); completeRawMock.mockClear(); });

  const now = Date.now();
  // $6 of Sonnet output (400k @ $15/Mtok) this month — over a $5 budget.
  const overBudget: UsageEntry[] = [{ dept: 'fin', model: 'claude-sonnet-4-6', input: 0, output: 400_000, ts: now }];
  const ctxWithUsage = (usage: UsageEntry[]): AgentContext => ({
    ownHistory: [], companyDigest: [], todayPeers: [],
    companySnapshot: { statuses: [{ dept: 'cyb', state: 'done', lastRun: new Date(now).toISOString() }], digest: [], outputs: [], usage },
  });

  it('fires a critical OPS ALERT when the budget is exceeded', async () => {
    vi.stubEnv('MONTHLY_BUDGET_USD', '5');
    const r = await run(ctxWithUsage(overBudget));
    expect(r.alert?.severity).toBe('critical');
    expect(r.alert?.text).toContain('OPS ALERT');
    expect(r.alert?.text.toUpperCase()).toContain('BUDGET');
  });

  it('does not alert on budget when unset (tracking only)', async () => {
    const r = await run(ctxWithUsage(overBudget)); // no MONTHLY_BUDGET_USD
    expect(r.alert).toBeUndefined();
    expect((r.artifacts ?? []).some((a) => a.title === 'cost & budget')).toBe(true);
  });

  it('always includes the cost & budget artifact', async () => {
    const r = await run(ctxWithUsage([]));
    expect((r.artifacts ?? []).some((a) => a.title === 'cost & budget')).toBe(true);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npx vitest run src/lib/agents/operations.test.ts`
Expected: FAIL — no budget alert / no cost artifact yet.

- [ ] **Step 7: Wire budget into `run()`**

In `run()`, rename the local agent-severity var and add budget composition. Replace the block (lines ~122-124):

```ts
  const healthLines = formatHealth(healths);
  const agentWorst = overallSeverity(healths);
  const crit = criticalAlerts(healths);

  const agg = aggregateUsage(snap?.usage ?? [], {
    now: Date.now(),
    budgetUsd: parseBudget(process.env.MONTHLY_BUDGET_USD),
  });
  const budget = assessBudget(agg);
  const combinedWorst = worst([agentWorst, budget?.severity ?? 'ok']);
  const budgetLine = agg.budgetUsd == null
    ? `tracking only — MTD $${agg.mtdUsd.toFixed(2)}, burn $${agg.last7dBurnUsdPerDay.toFixed(2)}/day (no budget set)`
    : (budget?.detail ?? `budget ok — $${agg.mtdUsd.toFixed(2)} / $${agg.budgetUsd.toFixed(2)}`);
```

Add the budget line to the prompt — extend the prompt string's monitoring section. Change the `Agent run-health (internal monitoring):\n${healthLines || 'no snapshot'}\n\n...` portion to also include:

```ts
`...Agent run-health (internal monitoring):\n${healthLines || 'no snapshot'}\n\nงบประมาณ Claude API (internal):\n${budgetLine}\n\n...`
```

and append to the Thai instruction: `... ถ้างบประมาณเกิน/ใกล้เกิน ให้ระบุใน ## Flags ด้วย`.

Add the cost artifacts to the artifacts array (line ~136):

```ts
  const artifacts = [
    ...opsArtifacts(deploys, activity),
    ...agentHealthArtifacts(healths),
    ...operationsCostArtifacts(agg),
    ...opsNoteArtifacts(findings),
  ];
```

Update summary to use `combinedWorst` and append a budget note. Replace the summary block (lines ~143-149):

```ts
  const SEV_EMOJI: Record<Severity, string> = { ok: '🟢', info: '🟢', warning: '🟡', critical: '🔴' };
  const deployPart = allOk ? 'all deploys green' : 'deploy attention needed';
  const agentPart =
    agentWorst === 'critical' ? `${crit.length} agent(s) need urgent attention`
    : agentWorst === 'warning' ? 'agent warnings present'
    : 'all agents healthy';
  const budgetPart = budget && budget.severity !== 'ok' ? ` · ${budget.detail}` : '';
  const baseSummary = `${SEV_EMOJI[combinedWorst]} ${agentPart} · ${deployPart}${budgetPart}`;
```

Update the alert to also fire on budget-critical. Replace the `const alert = ...` block (lines ~151-164):

```ts
  const budgetCritical = budget?.severity === 'critical';
  const alertSystems = [...crit.map((h) => h.dept.toUpperCase()), ...(budgetCritical ? ['BUDGET'] : [])];
  const alertSymptoms = [
    ...crit.map((h) => `${h.dept.toUpperCase()} ${h.issues.filter((i) => i.severity === 'critical').map((i) => i.detail).join('; ')}`),
    ...(budgetCritical && budget ? [`BUDGET ${budget.detail}`] : []),
  ];
  const alert =
    alertSystems.length > 0
      ? {
          severity: 'critical' as const,
          text:
            `🔴 OPS ALERT\nระบบ: ${alertSystems.join(', ')}\n` +
            `อาการ: ${alertSymptoms.join(' | ')}\n` +
            `Action: ตรวจ cron/logs ของเอเจนต์ที่กระทบ หรือปรับ cadence/งบประมาณ แล้วรันใหม่`,
        }
      : undefined;
```

Add `agg`/`budget` to `meta` (optional, useful for debugging) — extend the returned `meta`:

```ts
    meta: { deploys, activity, fixToday: findings.fixToday, notes: findings.notes.length, health: healths, stopReason, cost: { mtdUsd: agg.mtdUsd, budgetUsd: agg.budgetUsd } },
```

- [ ] **Step 8: Run the full operations suite**

Run: `npx vitest run src/lib/agents/operations.test.ts src/lib/agents/operations.artifacts.test.ts && npx tsc --noEmit`
Expected: PASS (new + existing tests; no type errors).

- [ ] **Step 9: Commit**

```bash
git add src/lib/agents/operations.ts src/lib/agents/operations.test.ts src/lib/agents/operations.artifacts.test.ts
git commit -m "feat(ops): cost/budget artifacts + budget rule into severity/alert"
```

---

## Task 10: Version, docs, brief, full verification

**Files:**
- Modify: `package.json`, `CHANGELOG.md`, `CLAUDE.md`, `.agents/Operations Agent.md`

- [ ] **Step 1: Bump the version**

In `package.json`, change `"version": "1.7.0"` → `"version": "1.8.0"`.

- [ ] **Step 2: Add the CHANGELOG entry** (insert above `## [1.7.0]`, and add a release link near the top of the link list)

```markdown
## [1.8.0] — 2026-06-15

**Operations cost & budget monitor (v1.7 Phase 2).**

### Added
- Per-run token usage is captured into an append-only Redis ledger
  (`usage:ledger`) by the runner; new pure `src/lib/cost.ts` (per-model pricing)
  and `src/lib/agents/usage.ts` (MTD + rolling-7-day-burn aggregation, projection).
- Operations renders a per-agent **cost bars** chart and a **cost & budget**
  table (provenance `'api'`): MTD spend, tokens, 7-day burn; plus budget %, days
  left and projected month-end when a budget is set.

### Changed
- `completeRaw()` now surfaces the `model` used; all six dept modules carry
  `usage` + `model` on their run result.
- When `MONTHLY_BUDGET_USD` is set, budget status feeds the v1.7 severity system:
  🟡 at ≥80% MTD, 🔴 at ≥100% or projected month-end overrun — routed into the
  Ops summary + `## Flags` + the `🔴 OPS ALERT` Telegram. Unset/`0` ⇒ display-only.

### Env
- New optional **`MONTHLY_BUDGET_USD`** — monthly Claude-spend budget in USD.
  Unset or `≤ 0` ⇒ tracking-only (no budget alerts).
```

And add the link line (with the others at the file bottom):

```markdown
[1.8.0]: https://github.com/khantee8/company.nanoteofficial.me/releases/tag/v1.8.0
```

- [ ] **Step 3: Update CLAUDE.md**

Replace the v1.7.0 current entry (line ~34) with a v1.8.0 entry, and update the "Earlier releases" pointer to include v1.7.0:

```markdown
**v1.8.0 (current) — Operations cost & budget monitor.** Completes the v1.7 Phase 2 deferral: every LLM run's token `usage` (+ the model used) is recorded by `runner.ts` into an append-only Redis ledger (`usage:ledger`); pure `src/lib/cost.ts` (per-model pricing, read-time costing) + `src/lib/agents/usage.ts` (`aggregateUsage` → MTD + rolling-7-day burn + month-end projection; `assessBudget`) turn it into a cost view. Operations renders a per-agent **cost bars** chart + a **cost & budget** table (provenance `'api'`) and, when **`MONTHLY_BUDGET_USD`** is set, folds a budget rule (🟡 ≥80% MTD, 🔴 ≥100% or projected overrun) into its severity → summary + `## Flags` + `🔴 OPS ALERT`. Budget is **optional**: unset/`0` ⇒ display-only (track + show spend, no alerts). `health.ts` is unchanged (budget is company-level, composed in `operations.ts` via the exported `worst()`); `completeRaw()` gained `model`. See `docs/superpowers/specs/2026-06-15-v18-ops-cost-budget-monitor-design.md`.

_Earlier releases (**v0.1.0 → v1.7.0**) are summarized in [`CHANGELOG.md`](./CHANGELOG.md)._
```

Add to the Env Vars section (line ~146), at the end of the paragraph:

```markdown
`MONTHLY_BUDGET_USD` (optional — v1.8, Operations' monthly Claude-spend budget in USD; unset or ≤ 0 ⇒ cost tracking is display-only, no budget alerts).
```

- [ ] **Step 4: Update the Operations brief** so its narrative reflects real budget monitoring

In `.agents/Operations Agent.md`, find the section describing credit/token monitoring (the aspirational token tables). Add a sentence making it concrete (Thai, matching the brief's voice):

```markdown
ระบบติดตามต้นทุนจริงแล้ว: ดูการ์ด "agent cost (MTD)" และตาราง "cost & budget" บนแดชบอร์ด — มีค่าใช้จ่ายสะสมเดือนนี้ (MTD), อัตราเบิร์น 7 วัน และถ้าตั้ง MONTHLY_BUDGET_USD จะมี % การใช้และการแจ้งเตือนเมื่อ ≥80% (เตือน) หรือ ≥100%/คาดว่าจะเกิน (วิกฤต) ผ่าน ## Flags และ OPS ALERT
```

- [ ] **Step 5: Full verification suite**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: all green. The previous suite was 308 tests; expect ≈ +18 from this plan.

- [ ] **Step 6: Visual check (no visual unit tests for artifacts)**

Run: `npm run dev`, open `http://localhost:3000/dashboard/ops`. There won't be live ledger data locally without Redis; confirm the page renders without errors and the cost artifacts appear once data exists. (Optionally seed a ledger entry via a scratch script against a real Redis to eyeball the bars/table.) Capture a screenshot.

- [ ] **Step 7: Commit**

```bash
git add package.json CHANGELOG.md CLAUDE.md ".agents/Operations Agent.md"
git commit -m "release: v1.8.0 — Operations cost & budget monitor"
```

---

## Self-review (completed during planning)

- **Spec coverage:** ledger storage (Tasks 5,7) · pricing (1) · aggregation MTD+7d+projection (3) · optional/display-only budget (3,9) · severity+OPS ALERT integration (8,9) · `usage`/`model` plumbing (2,4,6) · artifacts (9) · `health.ts` untouched-except-export (8) · config `MONTHLY_BUDGET_USD` (9,10) · edge cases (covered in 3/5/9 tests) · version+docs+brief (10). All sections map to a task.
- **Refinement vs spec:** ledger is a Redis **list** (client has no `zadd`) trimmed by count; budget panel is a **`table`** (the `scorecard` kind is status-tiles only). Both noted inline; intent preserved.
- **Type consistency:** `UsageEntry` (types.ts) used identically in cost/usage/redis/runner/operations; `aggregateUsage`/`assessBudget`/`UsageAggregate`/`operationsCostArtifacts`/`worst` signatures match across tasks; `costOf(model, {input,output})` consistent.
- **No placeholders:** every code step shows complete code; the only "verify" note is the three pricing rates (data accuracy), flagged explicitly in Task 1.
```
