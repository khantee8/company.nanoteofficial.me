# v1.12 "Async Company + Chibi Crew" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** All six agent runs move onto the Anthropic Message Batches API (submit in one invocation, collect via poller — kills the 300s timeout class, halves token cost), and the office pixel agents become six original chibi-shonen characters.

**Architecture:** Each dept module splits into pure `prepare(ctx)` → request opts and `finalize(ctx, meta, completion)` → `AgentRunResult`; the sync `run()` composes them so existing tests hold. A Redis pending-run record tracks submitted batches; `/api/cron/run` submits + self-polls ~3 min; `/api/cron/poll` (GitHub-Actions-triggered) collects, resumes `pause_turn` continuations (cap 3), enforces a 6h staleness kill, and funnels results into the UNCHANGED runner fan-out via an extracted `persistRunResult()`. Sprites are data-only (`PixelRect` grid 9×11 → 14×18).

**Tech Stack:** Next.js 16, TypeScript, `@anthropic-ai/sdk` batches API, Upstash Redis, Vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-07-07-v112-async-substrate-chibi-crew-design.md`

## Global Constraints

- The post-LLM pipeline is UNTOUCHED behavior: `normalizeReportOrder` → bilingual split → highlight/flags parsing → v1.11 role seam (`isFrontendDept` + `qualityGate`, backend depts write no KB) → publish/Library-sync/Telegram. Batch-collected runs MUST flow through the same code (`persistRunResult`), not a copy.
- The sync `run(ctx)` path per dept must keep working (tests + fallback); it becomes `prepare → completeRaw → finalize` with byte-identical behavior.
- MCP-in-batches is unverified: batch submission MUST runtime-fallback — on a 400 submit error whose message mentions `mcp`, resubmit once without `mcpServers` and with `webSearch: true`.
- `pause_turn` continuations: resume by appending the assistant `content` verbatim as an assistant message (never a "continue" user message — matches `completeRaw`), accumulate text and usage across continuations, cap at **3**, then treat as errored.
- Pending runs older than **6h** → `error` status + record deleted.
- New `AgentState` value `'queued'`: every exhaustive `Record<AgentState, …>` map treats it like `'running'` visually, with the label "queued".
- Watchdog semantics preserved: `markRetried` before submit; the 🔧 recovered / 🚨 failed-twice notifications move to poll-collection time for sweep-originated runs.
- No new required env vars. `CRON_SECRET` gates `/api/cron/poll` exactly like `/api/cron/run`. The GH workflow reads it from a repo secret.
- Sprites: same `PixelRect`/generator API; grid 14×18; `SPRITE_WIDTH/HEIGHT = 42/54`; original characters only (One Piece-inspired aesthetic, no copies); dept brand colors stay dominant.
- Run `npx tsc --noEmit` and `npm test` before every commit; `npm run lint` 0/0 before release.

---

### Task 1: claude.ts — request-shape extraction + batch wrappers

**Files:**
- Modify: `src/lib/claude.ts`
- Test: `src/lib/claude.batch.test.ts` (create)

**Interfaces:**
- Produces: `buildRequestShape(opts: CompleteOpts): { params: Record<string, unknown>; useMcp: boolean }`; `completionFromMessage(msg): CompleteResult` (textOf + usage + stop_reason of ONE message); `createAgentBatch(customId: string, shape: { params; useMcp }): Promise<string>` (returns batch id); `getAgentBatch(batchId: string): Promise<{ status: 'in_progress' } | { status: 'ended'; result: BatchItemResult }>` where `BatchItemResult = { type: 'succeeded'; message: Anthropic.Messages.Message } | { type: 'errored' | 'expired' | 'canceled'; error?: string }`. Task 6 consumes all of these.

- [ ] **Step 1: Write failing tests** — `buildRequestShape` is pure; test it directly:

```ts
// src/lib/claude.batch.test.ts
import { describe, it, expect } from 'vitest';
import { buildRequestShape } from './claude';

describe('buildRequestShape', () => {
  it('plain web-search shape: tools carry web_search with max_uses', () => {
    const { params, useMcp } = buildRequestShape({ system: 's', prompt: 'p', maxTokens: 100, webSearch: true, maxSearches: 2 });
    expect(useMcp).toBe(false);
    expect(params).toMatchObject({
      max_tokens: 100, system: 's',
      messages: [{ role: 'user', content: 'p' }],
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 2, allowed_callers: ['direct'] }],
    });
    expect(params).not.toHaveProperty('mcp_servers');
  });

  it('MCP shape: mcp_toolset + mcp_servers + useMcp flag', () => {
    const { params, useMcp } = buildRequestShape({ system: 's', prompt: 'p', mcpServers: [{ url: 'https://m/api', name: 'thai-funds', token: 't' }] });
    expect(useMcp).toBe(true);
    expect(params).toMatchObject({
      tools: [{ type: 'mcp_toolset', mcp_server_name: 'thai-funds' }],
      mcp_servers: [{ type: 'url', url: 'https://m/api', name: 'thai-funds', authorization_token: 't' }],
    });
  });

  it('no tools → no tools key', () => {
    const { params } = buildRequestShape({ system: 's', prompt: 'p' });
    expect(params).not.toHaveProperty('tools');
  });
});
```

Run: `npx vitest run src/lib/claude.batch.test.ts` → FAIL (not exported).

- [ ] **Step 2: Implement** — extract the tools/mcp_servers/messages/model/max_tokens construction that currently lives inline in `completeRaw` into:

```ts
/** v1.12 — the request shape shared by the sync stream path and batch submission. */
export function buildRequestShape(opts: CompleteOpts): { params: Record<string, unknown>; useMcp: boolean } {
  const { system, prompt, model = MODEL, maxTokens = 1500, webSearch = false, maxSearches = 5, mcpServers } = opts;
  const useMcp = !!mcpServers && mcpServers.length > 0;
  const tools: unknown[] = [
    ...(useMcp ? mcpServers!.map((s) => ({ type: 'mcp_toolset', mcp_server_name: s.name })) : []),
    ...(webSearch ? [{ type: 'web_search_20260209', name: 'web_search', max_uses: maxSearches, allowed_callers: ['direct'] }] : []),
  ];
  const mcp_servers = useMcp
    ? mcpServers!.map((s) => ({ type: 'url', url: s.url, name: s.name, ...(s.token ? { authorization_token: s.token } : {}) }))
    : undefined;
  return {
    useMcp,
    params: {
      model, max_tokens: maxTokens, system,
      messages: [{ role: 'user', content: prompt }] as Anthropic.Messages.MessageParam[],
      ...(tools.length ? { tools } : {}),
      ...(mcp_servers ? { mcp_servers } : {}),
    },
  };
}
```

Rewire `completeRaw` to call it (spread `shape.params`, keep its resume loop mutating `shape.params.messages` — behavior byte-identical; the existing `claude.mcp.test.ts` and all dept tests must stay green). Add:

```ts
export function completionFromMessage(msg: Anthropic.Messages.Message): CompleteResult {
  return { text: textOf(msg), stopReason: msg.stop_reason, usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens }, model: msg.model };
}

/** Submit a one-request agent batch. MCP shapes go through the beta batches
 *  surface with the connector beta header. Returns the batch id. */
export async function createAgentBatch(customId: string, shape: { params: Record<string, unknown>; useMcp: boolean }): Promise<string> {
  const requests = [{ custom_id: customId, params: shape.params }] as never;
  const batch = shape.useMcp
    ? await client().beta.messages.batches.create({ requests, betas: [MCP_BETA] } as never)
    : await client().messages.batches.create({ requests });
  return (batch as { id: string }).id;
}

export type BatchItemResult =
  | { type: 'succeeded'; message: Anthropic.Messages.Message }
  | { type: 'errored' | 'expired' | 'canceled'; error?: string };

export async function getAgentBatch(batchId: string): Promise<{ status: 'in_progress' } | { status: 'ended'; result: BatchItemResult }> {
  const b = await client().messages.batches.retrieve(batchId);
  if (b.processing_status !== 'ended') return { status: 'in_progress' };
  for await (const item of await client().messages.batches.results(batchId)) {
    const r = item.result as { type: string; message?: unknown; error?: { message?: string } };
    if (r.type === 'succeeded') return { status: 'ended', result: { type: 'succeeded', message: r.message as Anthropic.Messages.Message } };
    return { status: 'ended', result: { type: r.type as 'errored', error: r.error?.message } };
  }
  return { status: 'ended', result: { type: 'errored', error: 'empty batch results' } };
}
```

(If the installed SDK's beta batches surface differs, check `node_modules/@anthropic-ai/sdk` for the exact `beta.messages.batches` binding; if it has none, submit MCP shapes through the plain batches endpoint — the runtime fallback in Task 6 catches a rejection.)

- [ ] **Step 3: Verify + commit**

Run: `npx vitest run src/lib/claude.batch.test.ts src/lib/claude.mcp.test.ts && npm test 2>&1 | tail -3 && npx tsc --noEmit` → all green.

```bash
git add src/lib/claude.ts src/lib/claude.batch.test.ts
git commit -m "feat(v1.12): buildRequestShape + agent batch wrappers in claude.ts"
```

---

### Task 2: `queued` state + pending-run Redis CRUD

**Files:**
- Modify: `src/lib/agents/types.ts` (AgentState), `src/lib/redis.ts`, plus every exhaustive `AgentState` map (tsc will point at them; known consumers: `src/lib/agents/ceo.ts` STATE_TO_TILE, `src/lib/agents/behaviours.ts`, `src/lib/agents/stateOverlay.ts`, `src/lib/agents/health.ts`, `src/components/{ExecDashboard,OfficeApp,OfficeCanvas,AgentDetail}.tsx`, `src/components/admin/{AgentInspector,AgentsPanel,OverviewPanel}.tsx`)
- Test: `src/lib/redis.test.ts` (extend)

**Interfaces:**
- Produces: `AgentState = 'idle' | 'queued' | 'running' | 'done' | 'error'`; exported `interface PendingRun { id: string; dept: DeptId; submittedAt: number; batchId: string; customId: string; continuations: number; origin: 'cron' | 'admin' | 'telegram' | 'sweep'; opts: CompleteOpts; meta: unknown; partialTexts: string[]; usageAcc: { input: number; output: number }; resumeContent: unknown[] }` (in `redis.ts`, `CompleteOpts` imported from `@/lib/claude`; `resumeContent` holds each paused turn's assistant `content` array in order, for continuation resubmission); repo methods `savePendingRun(run: PendingRun)`, `getPendingRuns(): Promise<PendingRun[]>`, `deletePendingRun(id: string)`. Keys: `run:pending:<id>` + set-style index list `run:pending:index` (mirror the `kb:entry:`/`kb:index` pattern incl. `lrem` on delete).

- [ ] **Step 1: Failing tests** (extend `redis.test.ts` with its in-memory client):

```ts
it('pending runs: save, list, delete', async () => {
  const run = { id: 'fin:2026-07-07T10:00:00Z', dept: 'fin', submittedAt: 1, batchId: 'b1', customId: 'c1',
    continuations: 0, origin: 'cron', opts: { system: 's', prompt: 'p' }, meta: {}, partialTexts: [], usageAcc: { input: 0, output: 0 } };
  await repo.savePendingRun(run as never);
  expect((await repo.getPendingRuns()).map((r) => r.id)).toEqual([run.id]);
  await repo.deletePendingRun(run.id);
  expect(await repo.getPendingRuns()).toEqual([]);
});
```

- [ ] **Step 2: Implement** — `types.ts`: add `'queued'` to `AgentState`. `redis.ts`: `PENDING_KEY = (id) => \`run:pending:${id}\``, `PENDING_INDEX = 'run:pending:index'`; `savePendingRun` = `set` + `lpush` + `ltrim(0, 49)`; `getPendingRuns` = `lrange` → `mget` → filter nulls; `deletePendingRun` = `del` + `lrem`. Then run `npx tsc --noEmit` and fix EVERY exhaustive-map error by mapping `queued` to the same value as `running` (tile `'warn'`, animations, badge colors) with display label `queued` where a label string exists. In `health.ts`, treat `queued` exactly like `running` for staleness assessment.

- [ ] **Step 3: Verify + commit**

Run: `npx vitest run src/lib/redis.test.ts && npx tsc --noEmit && npm test 2>&1 | tail -3` → green.

```bash
git add -A src && git commit -m "feat(v1.12): queued agent state + pending-run Redis CRUD"
```

---

### Task 3: runner.ts — extract `persistRunResult`

**Files:**
- Modify: `src/lib/agents/runner.ts`
- Test: existing `runner.test.ts` / `runner.kb.test.ts` must pass UNCHANGED (behavior-preserving refactor)

**Interfaces:**
- Produces: `export async function persistRunResult(dept: DeptId, result: AgentRunResult, deps: RunnerDeps): Promise<void>` — the entire post-LLM half of `runAgent` verbatim: `ts`/`date` computation, `normalizeReportOrder` + `splitBilingual`, highlight/flags parsing, the v1.11 frontend `related` auto-fill (`listKb` + DEPT_ORDER filter), the role-seam `Promise.all` fan-out (status done, output, feed, history, digest, conditional `pushKb` with `qualityGate`, usage recording), the `pushLibrarySync` ∥ notify tail, and the `result.alert` notify. `runAgent` becomes: setStatus running → `buildContext` → `agent.run(ctx)` → `persistRunResult(dept, result, deps)` → return result, with its catch block unchanged. Also export `buildContext` (already exported) and keep `todayDate` export from the v1.11 round.

- [ ] **Step 1: Refactor exactly as above** (cut/paste into the new function; no logic edits — resist cleanups).
- [ ] **Step 2: Verify + commit**

Run: `npx vitest run src/lib/agents/runner.test.ts src/lib/agents/runner.kb.test.ts && npm test 2>&1 | tail -3 && npx tsc --noEmit` → all green with ZERO test edits.

```bash
git add src/lib/agents/runner.ts && git commit -m "refactor(v1.12): extract persistRunResult from runAgent (behavior-preserving)"
```

---

### Task 4: Finance prepare/finalize split (the template)

**Files:**
- Modify: `src/lib/agents/finance.ts`
- Test: `src/lib/agents/finance.test.ts` (extend), existing finance tests unchanged

**Interfaces:**
- Produces (pattern every dept follows): `export interface FinMeta { theme: string; label: string }`; `export async function prepare(ctx: AgentContext): Promise<{ opts: CompleteOpts; meta: FinMeta }>` — everything `run()` currently does BEFORE `completeRaw` (theme pick, context format, MCP env wiring, prompt build, `applyOverrides(...)` applied); `export function finalize(ctx: AgentContext, meta: FinMeta, out: CompleteResult): AgentRunResult` — everything AFTER (parseFinanceFindings, artifacts, incomplete/summary, return object) with `out.text/stopReason/usage/model` replacing the destructured completeRaw result. `run(ctx)` becomes:

```ts
export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const { opts, meta } = await prepare(ctx);
  const out = await completeRaw(opts);
  return finalize(ctx, meta, out);
}
```

- [ ] **Step 1: Failing test** (append to finance.test.ts):

```ts
it('prepare/finalize split: prepare returns hybrid request opts; finalize builds the result without I/O', async () => {
  vi.stubEnv('THAI_FUNDS_MCP_URL', 'https://mcp.example/api/mcp');
  const { prepare, finalize } = await import('./finance');
  const { opts, meta } = await prepare(ctx);
  // v1.12 restores the v1.6 hybrid: web_search + MCP together — the 300s cap
  // that forced MCP-only (v1.10.1) is gone under the batch substrate.
  expect(opts).toMatchObject({ model: 'claude-sonnet-4-6', webSearch: true, maxTokens: 8000 });
  expect(opts.mcpServers).toEqual([expect.objectContaining({ url: 'https://mcp.example/api/mcp' })]);
  expect(meta.theme).toBeTruthy();
  const result = finalize(ctx, meta, { text: '```json findings\n{"theme":"x","funds":[]}\n```', stopReason: 'end_turn', usage: { input: 1, output: 1 }, model: 'm' });
  expect(result.incomplete).toBe(true); // zero cited funds
  vi.unstubAllEnvs();
});
```

- [ ] **Step 2: Implement the split AND restore Finance's hybrid research** (spec: "with the cap gone, restore `webSearch: true` alongside MCP"): in `prepare`, set `webSearch: true` unconditionally, raise `maxSearches` back to 4, restore the two-source prompt (web_search for names/master-fund/1y-returns + thai-funds-mcp for official SEC numbers — the v1.6 hybrid text that the v1.10.1 `sourceBrief` conditional replaced), and update the `// ponytail:` comment to say the batch substrate removed the 300s pressure. **Fallout to update in the same task:** the v1.10.1 "MCP-only" tests — `finance.test.ts` "run — research source selection" block (now asserts `webSearch: true` WITH MCP configured; the no-MCP case still asserts `webSearch: true`) and `finance.run.test.ts`'s "MCP-only" assertion (back to hybrid). All other finance tests stay green (they mock `completeRaw`, which `run` still calls).
- [ ] **Step 3: Commit**

```bash
npx vitest run src/lib/agents/finance.test.ts src/lib/agents/finance.run.test.ts && npx tsc --noEmit
git add src/lib/agents/finance.ts src/lib/agents/finance.test.ts
git commit -m "feat(v1.12): finance prepare/finalize split"
```

---

### Task 5: Split the other five depts + registries

**Files:**
- Modify: `src/lib/agents/{cyberx,marketing,rnd,operations,ceo}.ts`, `src/lib/agents/index.ts`
- Test: each dept's existing tests unchanged; one split test per dept mirroring Task 4's (assert `prepare` opts shape incl. each dept's model/maxTokens/webSearch, and one `finalize` behavior)

Apply the EXACT Task 4 pattern to each module. Per-dept `meta` types: cyberx `{ kev: KevItem[] }`-style — whatever local variables the post-LLM half consumes (read each `run()`; everything fetched before `completeRaw` that is used after it goes into `meta`; e.g. rnd's `repos`, operations' deploy/activity/health/budget structures, ceo has none beyond the prompt → `meta = {}`). `finalize` must be synchronous and I/O-free for every dept. In `src/lib/agents/index.ts` add:

```ts
export const PREPARES: Record<DeptId, (ctx: AgentContext) => Promise<{ opts: CompleteOpts; meta: unknown }>> = {
  ceo: ceo.prepare, cyb: cyberx.prepare, fin: finance.prepare, mkt: marketing.prepare, rnd: rnd.prepare, ops: operations.prepare,
};
export const FINALIZES: Record<DeptId, (ctx: AgentContext, meta: never, out: CompleteResult) => AgentRunResult> = {
  ceo: ceo.finalize, cyb: cyberx.finalize, fin: finance.finalize, mkt: marketing.finalize, rnd: rnd.finalize, ops: operations.finalize,
};
```

- [ ] Implement dept by dept, running that dept's tests after each; then `npm test` + `npx tsc --noEmit` all green.
- [ ] Commit: `git add src/lib/agents && git commit -m "feat(v1.12): prepare/finalize split for all six depts + registries"`

---

### Task 6: asyncRun.ts — submit, poll, continuation, staleness

**Files:**
- Create: `src/lib/agents/asyncRun.ts`
- Test: `src/lib/agents/asyncRun.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5 (`createAgentBatch`, `getAgentBatch`, `completionFromMessage`, `buildRequestShape`, `PendingRun` CRUD, `PREPARES`/`FINALIZES`, `persistRunResult`, `buildContext`).
- Produces: `submitRun(dept: DeptId, deps: RunnerDeps, options?: { overrides?: RunOverrides; origin?: PendingRun['origin']; selfPollMs?: number }): Promise<{ queued: boolean; summary?: string }>`; `pollPendingRuns(deps: RunnerDeps): Promise<{ collected: number; pending: number }>`; pure `decidePoll(run: PendingRun, batch: Awaited<ReturnType<typeof getAgentBatch>>, now: number): PollAction` with `type PollAction = { kind: 'wait' } | { kind: 'finalize'; message: Anthropic.Messages.Message } | { kind: 'continue'; message: Anthropic.Messages.Message } | { kind: 'fail'; reason: string }`.

- [ ] **Step 1: Failing tests for `decidePoll`** (pure decision table):

```ts
const base: PendingRun = { id: 'fin:t', dept: 'fin', submittedAt: 1000, batchId: 'b', customId: 'c', continuations: 0,
  origin: 'cron', opts: { system: 's', prompt: 'p' }, meta: {}, partialTexts: [], usageAcc: { input: 0, output: 0 }, resumeContent: [] };
const msg = (stop: string) => ({ stop_reason: stop, content: [], usage: { input_tokens: 1, output_tokens: 1 }, model: 'm' }) as never;

it('in_progress → wait',            () => expect(decidePoll(base, { status: 'in_progress' }, 2000).kind).toBe('wait'));
it('succeeded end_turn → finalize', () => expect(decidePoll(base, { status: 'ended', result: { type: 'succeeded', message: msg('end_turn') } }, 2000).kind).toBe('finalize'));
it('pause_turn under cap → continue', () => expect(decidePoll(base, { status: 'ended', result: { type: 'succeeded', message: msg('pause_turn') } }, 2000).kind).toBe('continue'));
it('pause_turn at cap → fail',      () => expect(decidePoll({ ...base, continuations: 3 }, { status: 'ended', result: { type: 'succeeded', message: msg('pause_turn') } }, 2000).kind).toBe('fail'));
it('errored → fail',                () => expect(decidePoll(base, { status: 'ended', result: { type: 'errored', error: 'x' } }, 2000).kind).toBe('fail'));
it('stale >6h → fail even in_progress', () => expect(decidePoll(base, { status: 'in_progress' }, 1000 + 6 * 3600_000 + 1).kind).toBe('fail'));
```

- [ ] **Step 2: Implement**

```ts
export const MAX_CONTINUATIONS = 3;
export const STALE_MS = 6 * 3600_000;

export function decidePoll(run: PendingRun, batch: BatchPoll, now: number): PollAction {
  if (now - run.submittedAt > STALE_MS) return { kind: 'fail', reason: 'stale (>6h)' };
  if (batch.status === 'in_progress') return { kind: 'wait' };
  const r = batch.result;
  if (r.type !== 'succeeded') return { kind: 'fail', reason: r.error ?? r.type };
  if (r.message.stop_reason === 'pause_turn') {
    return run.continuations >= MAX_CONTINUATIONS
      ? { kind: 'fail', reason: `pause_turn continuation cap (${MAX_CONTINUATIONS})` }
      : { kind: 'continue', message: r.message };
  }
  return { kind: 'finalize', message: r.message };
}
```

`submitRun` flow (status becomes `queued` only after a successful submission):
1. `const ctx = await buildContext(dept, repo, options?.overrides)`; `const { opts, meta } = await PREPARES[dept](ctx)`.
2. `let shape = buildRequestShape(opts)`; `try { batchId = await createAgentBatch(customId, shape) } catch (err) { if (/mcp/i.test(String(err)) && opts.mcpServers) { const fallback = { ...opts, mcpServers: undefined, webSearch: true }; shape = buildRequestShape(fallback); batchId = await createAgentBatch(customId, shape); opts = fallback; } else throw err; }` (MCP-in-batch runtime fallback per Global Constraints).
3. `savePendingRun({...})` + `setStatus({ dept, state: 'queued', lastRun: iso })` + `pushEvent` "submitted batch".
4. Self-poll loop: `deadline = Date.now() + (options?.selfPollMs ?? 180_000)`; every 15s `getAgentBatch` → `decidePoll` → on `finalize` call the shared `collect()` below and return `{ queued: false, summary }`; on `continue`/`fail` act the same as the poller; on deadline return `{ queued: true }`.
- `collect(run, message, deps)`: accumulate `partialTexts.push(text)` etc.; build `out: CompleteResult` = `{ text: [...run.partialTexts, textOf(message)].filter(Boolean).join('\n').trim(), stopReason, usage: accumulated + message usage, model: message.model }` via `completionFromMessage` + accumulation; **rebuild ctx** `await buildContext(run.dept, deps.repo)` (fresh snapshot is fine — CEO's KPIs get FRESHER data); `const result = FINALIZES[run.dept](ctx, run.meta as never, out)`; `await persistRunResult(run.dept, result, deps)`; `await deletePendingRun(run.id)`; sweep-origin: `pushSweepLog({ dept, ok: true, detail: result.summary, ts })` + 🔧 notify.
- `continueRun(run, message)`: `const resumeContent = [...run.resumeContent, message.content]`; new shape = `buildRequestShape(run.opts)`, then append each stored assistant content in order: `for (const c of resumeContent) (shape.params.messages as unknown[]).push({ role: 'assistant', content: c })` — this mirrors `completeRaw`'s resume semantics across poll cycles. Then `createAgentBatch` again and `savePendingRun({ ...run, batchId: newId, continuations: run.continuations + 1, partialTexts: [...run.partialTexts, textOf(message)], usageAcc: accumulated, resumeContent })`.
- `fail(run, reason)`: `setStatus error` + ⚠ notify (same text shape as runAgent's catch) + `deletePendingRun`; sweep-origin → `pushSweepLog ok:false` + 🚨 "failed twice today" notify.
- `pollPendingRuns`: `getPendingRuns()` → sequential for-of (runs are few) → act per decision; return counts.

- [ ] **Step 3: Integration-style tests** with mocked `claude.ts` module (`vi.mock`) + fake repo: submit happy path (self-poll finds `end_turn` on first check → `persistRunResult` called, pending deleted, status sequence queued→done via persist); submit with immediate MCP 400 → fallback resubmitted without mcpServers; poll with pause_turn → new batch created, continuations=1, pending updated not deleted; poll stale → status error + deleted.
- [ ] **Step 4: Verify + commit**

```bash
npx vitest run src/lib/agents/asyncRun.test.ts && npm test 2>&1 | tail -3 && npx tsc --noEmit
git add src/lib/agents/asyncRun.ts src/lib/agents/asyncRun.test.ts src/lib/redis.ts src/lib/redis.test.ts
git commit -m "feat(v1.12): async run lifecycle — submit, self-poll, continuation, staleness"
```

---

### Task 7: Switch all callers + the poll route

**Files:**
- Modify: `src/app/api/cron/run/route.ts`, `src/app/api/admin/run/route.ts`, `src/app/api/telegram/route.ts` (`/run` handler), `src/lib/agents/watchdog.ts`
- Create: `src/app/api/cron/poll/route.ts`
- Test: `src/lib/agents/watchdog.sweep.test.ts` (adapt), route conventions = no unit tests

- [ ] **Step 1: cron run route** — replace the `runAgent(...)` call with `const r = await submitRun(dept, { repo: getRepo(), notify: (t) => sendMessage(t) }, { origin: 'cron' })` and respond `{ ok: true, dept, queued: r.queued, summary: r.summary }`. Sweep branch unchanged (watchdog handles its own submit in Step 4).
- [ ] **Step 2: poll route**

```ts
// src/app/api/cron/poll/route.ts — v1.12 batch collector. CRON_SECRET-gated;
// triggered by the GitHub Actions schedule (self-poll in submitRun is the fast path).
import { NextRequest, NextResponse } from 'next/server';
import { pollPendingRuns } from '@/lib/agents/asyncRun';
import { getRepo } from '@/lib/redis';
import { sendMessage } from '@/lib/telegram';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse('unauthorized', { status: 401 });
  }
  try {
    const r = await pollPendingRuns({ repo: getRepo(), notify: (t) => sendMessage(t) });
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 3: admin run + telegram** — same `submitRun` swap (`origin: 'admin'` / `'telegram'`); when `queued: true`, admin responds `{ ok: true, queued: true }` and Telegram replies `⏳ queued — รายงานจะแจ้งเตือนเมื่อเสร็จ` (report notifies on completion); when `queued: false` keep today's success responses.
- [ ] **Step 4: watchdog** — in `runSweep`, replace the `runAgent`/try-catch block with: `markRetried` (unchanged, before) → announce notify (unchanged) → `const r = await submitRun(dept, deps, { overrides: SAFE_OVERRIDES, origin: 'sweep', selfPollMs: 120_000 })` → if it returns without throwing, the outcome notification is now owned by collection (asyncRun's sweep-origin handling); a THROW from submitRun (submission itself failed) keeps the existing catch → sweep log ok:false + 🚨. Adapt `watchdog.sweep.test.ts`: mock `asyncRun.submitRun`; assert markRetried-before-submit ordering, announce notify, and the throw path.
- [ ] **Step 5: Verify + commit**

```bash
npm test 2>&1 | tail -3 && npx tsc --noEmit && npm run lint 2>&1 | tail -2
git add src/app/api src/lib/agents/watchdog.ts src/lib/agents/watchdog.sweep.test.ts
git commit -m "feat(v1.12): all run triggers submit batches; /api/cron/poll collector"
```

---

### Task 8: GitHub Actions poll workflow

**Files:**
- Create: `.github/workflows/poll.yml`

- [ ] **Step 1: Write the workflow**

```yaml
# Collects finished agent batch runs. The in-request self-poll is the fast
# path; this schedule is the backstop (GH cron is best-effort, drift is fine).
name: poll-agent-batches
on:
  schedule:
    - cron: '*/10 * * * *'
  workflow_dispatch: {}
jobs:
  poll:
    runs-on: ubuntu-latest
    steps:
      - name: Poll company.nanoteofficial.me for finished batches
        run: |
          curl -fsS -m 280 -H "Authorization: Bearer $CRON_SECRET" \
            "https://company.nanoteofficial.me/api/cron/poll"
        env:
          CRON_SECRET: ${{ secrets.CRON_SECRET }}
```

- [ ] **Step 2: Commit** (`git add .github && git commit -m "feat(v1.12): GitHub Actions batch-poll schedule"`). NOTE for release: the user must add the `CRON_SECRET` repo secret (Settings → Secrets → Actions) before the workflow works — record this in the task report as a manual follow-up.

---

### Task 9: Chibi Shonen sprite crew

**Files:**
- Modify: `src/lib/agents/sprites.ts`
- Test: `src/lib/agents/sprites.test.ts` (create)

**Interfaces:** same exports (`PixelRect`, `SPRITE_DATA` private, `spriteRects`, `spriteSvg`); constants become `SPRITE_VIEWBOX_W = 14`, `SPRITE_VIEWBOX_H = 18`, `SPRITE_WIDTH = 42`, `SPRITE_HEIGHT = 54`.

- [ ] **Step 1: Failing sanity test**

```ts
// src/lib/agents/sprites.test.ts
import { describe, it, expect } from 'vitest';
import { spriteRects, SPRITE_VIEWBOX_W, SPRITE_VIEWBOX_H } from './sprites';
import { DEPARTMENTS } from '@/lib/data/departments';

describe('chibi sprite data', () => {
  it('viewbox is the 14x18 chibi grid', () => {
    expect([SPRITE_VIEWBOX_W, SPRITE_VIEWBOX_H]).toEqual([14, 18]);
  });
  for (const d of DEPARTMENTS) {
    it(`${d.id} has a substantial in-bounds sprite with valid colors`, () => {
      const rects = spriteRects(d.id);
      expect(rects.length).toBeGreaterThan(20); // chibi detail, not the old 9x11 blob
      for (const r of rects) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(SPRITE_VIEWBOX_W);
        expect(r.y + r.h).toBeLessThanOrEqual(SPRITE_VIEWBOX_H);
        expect(r.fill).toMatch(/^#[0-9a-fA-F]{3,8}$/);
      }
    });
  }
});
```

- [ ] **Step 2: Author the six characters.** Style A (chibi shonen): head rows 0–9 of 18 (≈ half), 2×2-pixel eyes, mouth row, compact body, shoes. Use the approved mockup maps as the canonical starting point for CEOX and CyberX — they live in `.superpowers/brainstorm/*/content/charstyle.html` (14-wide ASCII grids in the generator comments of the session scratchpad `gen-mockup.js`; CEOX: blond spikes `#ffdd57`, crimson draped coat `#b03a2e`, white shirt, `#7f8cff` tie, gold epaulettes; CyberX: `#0c2a1e` hood, `#39ff9d` visor + zipper). Author FinX (rimmed glasses — dark 1px frames around the eyes, navy `#1a1a3e` suit, `#7f8cff` tie), M&SX (beret + headphone band `#333` over the head, `#ff6b9d` jacket), AIX (goggles pushed up — `#666` band + `#00cfff44` lenses on the forehead, white/`#dde0f0` lab coat, `#00cfff` accents), OperX (headset arc + mic pixel, `#ff9a3c` vest over dark shirt, brown `#7a4a21` wrench-holster pixel at the hip) in the same proportions. Keep skin tones varied as today (`#f5c5a3`/`#ffd1a3`/`#ffe0b2`). Update the four constants.
- [ ] **Step 3: Anchor check on the dev server.** `npm run dev` → screenshot the office (`/`) — all six chibi agents must stand ON the floor at their desks (not floating/sunken), on both floors (mezzanine + ground). `src/lib/agents/Agent.ts` consumes `SPRITE_WIDTH/HEIGHT` — if agents visibly float or sink, adjust the draw offset where the engine anchors the sprite (look for the vertical offset applied around the sprite draw in the engine/Agent code) rather than the constants. Attach the screenshot path in the report.
- [ ] **Step 4: Verify + commit**

```bash
npx vitest run src/lib/agents/sprites.test.ts && npm test 2>&1 | tail -3 && npx tsc --noEmit
git add src/lib/agents/sprites.ts src/lib/agents/sprites.test.ts src/lib/agents/Agent.ts
git commit -m "feat(v1.12): chibi shonen crew — six original manga-style pixel agents"
```

---

### Task 10: Release — version, docs, full verification

**Files:**
- Modify: `package.json` (+ lock via `npm version 1.12.0 --no-git-tag-version`), `CHANGELOG.md`, `CLAUDE.md`, `.agents/Operation Agent.md` (one line: batch runs bill at 50% — keeps the cost narrative honest)

- [ ] **Step 1:** CHANGELOG `## [1.12.0] — <date>` with Added (async batch substrate: prepare/finalize split, pending runs, `/api/cron/poll` + GH Actions, `queued` state, pause_turn continuations, 6h staleness, MCP-in-batch fallback, 50% batch pricing; chibi shonen sprite crew) and Changed (Finance regains `web_search`; run triggers reply "queued" when the self-poll window is exceeded). CLAUDE.md: current-version paragraph + a "**v1.12.0 (current)**" release paragraph + update the Key Constraints cron bullet to mention the poll workflow; update the finance MCP-only sentence (web_search restored under batches).
- [ ] **Step 2: Full gates** — `npm test`, `npx tsc --noEmit`, `npm run lint` (0/0), `npm run build`; dev-server spot-checks: office shows the chibi crew; `curl -H "Authorization: Bearer wrong" localhost:3000/api/cron/poll` → 401.
- [ ] **Step 3: Commit** `release: v1.12.0 — Async Company + Chibi Crew (batch substrate, queued runs, manga agents)`.

---

### Post-plan (after all tasks)

1. Final whole-branch review (requesting-code-review template, most capable model), fix findings.
2. `/code-review` + base-deployment per the established flow; push to main.
3. **Manual (user):** add `CRON_SECRET` as a GitHub Actions repo secret; confirm the first scheduled workflow run is green.
4. Prod verify: next cron submits a batch (status `queued` → `done`), report lands with Telegram notify; office canvas shows the chibi crew; Finance's first batch run completes (watch whether the MCP fallback fired — the pending record's opts reveal it).
