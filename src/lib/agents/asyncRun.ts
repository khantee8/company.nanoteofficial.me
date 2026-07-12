// src/lib/agents/asyncRun.ts — v1.12 async batch run lifecycle. Every dept run
// submits as an Anthropic Message Batch instead of a synchronous, timeout-
// bound request; `submitRun` self-polls for a few minutes (the fast path),
// and `pollPendingRuns` is the standalone collector `/api/cron/poll` calls as
// the backstop for anything slower (or a serverless function that got killed
// mid self-poll). Both funnel a finished batch through the SAME `collect()` →
// `persistRunResult()` path — the post-LLM pipeline (bilingual split, role-
// gated KB publish, Library sync, Telegram) is untouched by this file.
import type Anthropic from '@anthropic-ai/sdk';
import type { DeptId } from '@/lib/data/departments';
import type { RunOverrides, AgentRunResult } from './types';
import type { PendingRun } from '@/lib/redis';
import type { RunnerDeps } from './runner';
import { buildContext, persistRunResult } from './runner';
import { PREPARES, FINALIZES } from './index';
import {
  buildRequestShape,
  createAgentBatch,
  getAgentBatch,
  completionFromMessage,
  type CompleteResult,
} from '@/lib/claude';

export const MAX_CONTINUATIONS = 3;
export const STALE_MS = 6 * 3600_000;

const DEFAULT_SELF_POLL_MS = 180_000;
const DEFAULT_POLL_INTERVAL_MS = 15_000;

type BatchPoll = Awaited<ReturnType<typeof getAgentBatch>>;

export type PollAction =
  | { kind: 'wait' }
  | { kind: 'finalize'; message: Anthropic.Messages.Message }
  | { kind: 'continue'; message: Anthropic.Messages.Message }
  | { kind: 'fail'; reason: string };

/** Pure decision table driving both the self-poll loop and the standalone
 *  poll collector. Staleness is checked FIRST so a batch stuck in_progress
 *  past 6h is killed rather than waited on forever. */
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

function nowIso(): string {
  return new Date().toISOString();
}

/** A finished batch message → the persisted AgentRunResult, or `null` if
 *  another collector already owns this run. Rebuilds the agent context
 *  fresh at collection time (a batch may sit for minutes to hours; a stale
 *  ctx would understate CEOX's KPIs or miss a same-day peer report) rather
 *  than reusing the snapshot taken at submit time. Shared by the self-poll
 *  loop and the standalone poll collector — collection logic lives here
 *  exactly once.
 *
 *  F3 — self-poll and the backstop poller can both observe the same batch
 *  as `ended` (self-poll running past its deadline right as the backstop
 *  fires). Before persisting, claim `run:claim:<id>` (SET NX, 10-min TTL);
 *  the loser skips silently rather than double-publishing/double-notifying. */
async function collect(run: PendingRun, message: Anthropic.Messages.Message, deps: RunnerDeps): Promise<AgentRunResult | null> {
  const { repo, notify } = deps;
  if (!(await repo.claimPendingRun(run.id))) return null;
  const single = completionFromMessage(message);
  const out: CompleteResult = {
    text: [...run.partialTexts, single.text].filter(Boolean).join('\n').trim(),
    stopReason: single.stopReason,
    usage: { input: run.usageAcc.input + single.usage.input, output: run.usageAcc.output + single.usage.output },
    model: single.model,
  };
  const ctx = await buildContext(run.dept, repo);
  const result = FINALIZES[run.dept](ctx, run.meta as never, out);
  await persistRunResult(run.dept, result, deps);
  await repo.deletePendingRun(run.id);
  // Sweep-originated runs (OperX self-heal) get the same 🔧 "recovered" alert
  // the pre-v1.12 inline retry sent, moved here since collection is now the
  // async step that actually finishes the rerun.
  if (run.origin === 'sweep') {
    await repo.pushSweepLog({ dept: run.dept, ok: true, detail: result.summary, ts: Date.now() });
    await notify(`🔧 OperX self-heal: ${run.dept.toUpperCase()} recovered`);
  }
  return result;
}

/** Resume a paused turn: append the assistant `content` verbatim (never a
 *  "continue" user message — mirrors `completeRaw`'s own resume semantics)
 *  and resubmit as a fresh batch, accumulating partial text/usage so the
 *  eventual `collect()` sees the whole multi-turn research run.
 *
 *  I2 — returns `null` if the new batch was created but persisting the
 *  updated record then failed. Left alone, the OLD record (still pointing
 *  at the now-consumed pause_turn batch) would stay in the pending index:
 *  the next poll would re-observe the same pause_turn result and call
 *  `continueRun` again, spawning a fresh orphan batch every cycle until the
 *  6h staleness kill. Failing the run outright here — rather than letting
 *  the save error escape to a caller's per-run catch — deletes the record
 *  so that never happens. */
async function continueRun(run: PendingRun, message: Anthropic.Messages.Message, deps: RunnerDeps): Promise<PendingRun | null> {
  const resumeContent = [...run.resumeContent, message.content];
  const shape = buildRequestShape(run.opts);
  const messages = shape.params.messages as unknown[];
  for (const c of resumeContent) messages.push({ role: 'assistant', content: c });
  const batchId = await createAgentBatch(run.customId, shape);
  const single = completionFromMessage(message);
  const next: PendingRun = {
    ...run,
    batchId,
    continuations: run.continuations + 1,
    partialTexts: [...run.partialTexts, single.text],
    usageAcc: { input: run.usageAcc.input + single.usage.input, output: run.usageAcc.output + single.usage.output },
    resumeContent,
    useMcp: shape.useMcp,
  };
  try {
    await deps.repo.savePendingRun(next);
  } catch (err) {
    const message2 = err instanceof Error ? err.message : String(err);
    await fail(run, `continuation save failed: ${message2}`, deps);
    return null;
  }
  return next;
}

/** Terminal failure: same notify text shape as `runAgent`'s catch block,
 *  plus the sweep-origin 🚨 "failed twice today" alert (the second half of
 *  the pre-v1.12 inline watchdog failure path — the first half, the ⚠ failed
 *  notify, now fires here too since a batch failure never reaches runAgent's
 *  own try/catch). */
async function fail(run: PendingRun, reason: string, deps: RunnerDeps): Promise<void> {
  const { repo, notify } = deps;
  await repo.setStatus({ dept: run.dept, state: 'error', lastRun: nowIso(), error: reason });
  await notify(`*${run.dept.toUpperCase()}* ⚠ failed: ${reason}`);
  await repo.deletePendingRun(run.id);
  if (run.origin === 'sweep') {
    await repo.pushSweepLog({ dept: run.dept, ok: false, detail: reason, ts: Date.now() });
    await notify(`🚨 OperX: ${run.dept.toUpperCase()} failed twice today — needs you (${reason.slice(0, 120)})`);
  }
}

export interface SubmitOptions {
  overrides?: RunOverrides;
  origin?: PendingRun['origin'];
  /** Self-poll window in ms (default 180_000 = 3 min). */
  selfPollMs?: number;
  /** Self-poll check interval in ms (default 15_000) — injectable so tests
   *  don't have to sleep in wall-clock time. */
  pollIntervalMs?: number;
}

/** Submit one dept's run as a batch, then self-poll for up to `selfPollMs`
 *  so a fast batch resolves within the same request that triggered it — the
 *  standalone `/api/cron/poll` sweep (GitHub Actions, every 10 min) is the
 *  backstop for anything slower or for a function killed mid self-poll.
 *  Status only flips to `queued` once the batch is actually accepted: a
 *  submit failure (including an exhausted MCP fallback) never parks a
 *  phantom pending run. */
export async function submitRun(dept: DeptId, deps: RunnerDeps, options?: SubmitOptions): Promise<{ queued: boolean; summary?: string }> {
  const { repo } = deps;
  const origin = options?.origin ?? 'cron';

  // I1 — an operator Run-now / Telegram `/run` firing while a batch for
  // this dept is already queued must not create a second run: the existing
  // record's collector (self-poll or the backstop poller) owns the
  // eventual outcome, so bail out before submitting anything new.
  const existingPending = await repo.getPendingRuns();
  if (existingPending.some((r) => r.dept === dept)) return { queued: true };

  const ctx = await buildContext(dept, repo, options?.overrides);
  const { opts: prepOpts, meta } = await PREPARES[dept](ctx);

  // MCP-in-batches is unverified: on a submit rejection whose message
  // mentions `mcp`, resubmit once without the connector (plain web_search).
  let opts = prepOpts;
  let shape = buildRequestShape(opts);
  const customId = `${dept}-${Date.now()}`;
  let batchId: string;
  try {
    batchId = await createAgentBatch(customId, shape);
  } catch (err) {
    if (/mcp/i.test(String(err)) && opts.mcpServers) {
      const fallback = { ...opts, mcpServers: undefined, webSearch: true };
      shape = buildRequestShape(fallback);
      batchId = await createAgentBatch(customId, shape);
      opts = fallback;
      // Surface the degradation — a silent fallback looks identical to a
      // healthy hybrid run until the report complains about missing SEC data.
      await repo.pushEvent({
        dept,
        msg: `${dept.toUpperCase()} MCP connector rejected at submit — resubmitted web_search-only`,
        ts: nowIso(),
      });
    } else {
      throw err;
    }
  }

  const iso = nowIso();
  let run: PendingRun = {
    id: `${dept}:${iso}`,
    dept,
    submittedAt: Date.now(),
    batchId,
    customId,
    continuations: 0,
    origin,
    opts,
    meta,
    partialTexts: [],
    usageAcc: { input: 0, output: 0 },
    resumeContent: [],
    useMcp: shape.useMcp,
  };
  await repo.savePendingRun(run);
  await repo.setStatus({ dept, state: 'queued', lastRun: iso });
  await repo.pushEvent({ dept, msg: `${dept.toUpperCase()} submitted batch`, ts: iso });

  const deadline = Date.now() + (options?.selfPollMs ?? DEFAULT_SELF_POLL_MS);
  const intervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  for (;;) {
    try {
      const batch = await getAgentBatch(run.batchId, run.useMcp);
      const action = decidePoll(run, batch, Date.now());
      if (action.kind === 'finalize') {
        const result = await collect(run, action.message, deps);
        // `result` is null iff the backstop poller won the collection race
        // (F3) — the batch is already durably queued/handled either way, so
        // report `queued: true` rather than fabricating a summary.
        return result ? { queued: false, summary: result.summary } : { queued: true };
      }
      if (action.kind === 'continue') {
        const next = await continueRun(run, action.message, deps);
        // I2 — `null` means continueRun already failed the run (its save
        // threw); mirror the `fail` branch below rather than looping on a
        // stale `run` reference.
        if (!next) return { queued: false };
        run = next;
      } else if (action.kind === 'fail') {
        await fail(run, action.reason, deps);
        return { queued: false };
      }
    } catch {
      // F4 — self-poll is best-effort: the batch is already durably queued
      // in Redis, so a thrown getAgentBatch/collect error here must NOT
      // reject submitRun. Fall through to the standalone backstop poller
      // (`/api/cron/poll`) instead of failing the whole submit request.
      return { queued: true };
    }
    if (Date.now() >= deadline) return { queued: true };
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

/** `submitRun`, but with a caller-side safety net: a submit-time throw (batch
 *  creation itself failed — network error, exhausted MCP fallback, etc.)
 *  never leaves the dept silently `queued`/stale in Redis or the operator
 *  unnotified. Mirrors `runAgent`'s own catch block exactly (same status
 *  write, same `⚠ failed` notify text) before rethrowing so each call site
 *  can still layer its own submit-failure handling (HTTP 500, sweep log, …).
 *  Every caller of `submitRun` should go through this wrapper instead. */
export async function submitRunSafe(dept: DeptId, deps: RunnerDeps, options?: SubmitOptions): Promise<{ queued: boolean; summary?: string }> {
  try {
    return await submitRun(dept, deps, options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await deps.repo.setStatus({ dept, state: 'error', lastRun: nowIso(), error: message });
    await deps.notify(`*${dept.toUpperCase()}* ⚠ failed: ${message}`);
    throw err;
  }
}

/** Standalone poll collector — the GitHub-Actions-triggered backstop
 *  (`/api/cron/poll`) for batches that outlive a self-poll window. Runs are
 *  always few, so a sequential for-of is fine (and keeps ordering simple to
 *  reason about for the eventual sweep-outcome Telegram messages).
 *
 *  F1 — dedupes by id (defense in depth on top of the `savePendingRun`
 *  upsert fix): a duplicate id in the index must not be collected twice.
 *  F2 — staleness is checked BEFORE any network call, so a run stuck past
 *  `STALE_MS` (or whose batch id is permanently 404/expired on Anthropic's
 *  side) fails without ever touching `getAgentBatch`; and each run's
 *  processing is isolated in its own try/catch so one run throwing (a
 *  flaky `getAgentBatch`/collect) never stops the rest of the batch from
 *  being processed — it's simply counted as still-pending. */
export async function pollPendingRuns(deps: RunnerDeps): Promise<{ collected: number; pending: number }> {
  const all = await deps.repo.getPendingRuns();
  const seen = new Set<string>();
  const runs = all.filter((run) => {
    if (seen.has(run.id)) return false;
    seen.add(run.id);
    return true;
  });

  let collected = 0;
  let pending = 0;
  for (const run of runs) {
    try {
      const now = Date.now();
      if (now - run.submittedAt > STALE_MS) {
        await fail(run, 'stale (>6h)', deps);
        continue;
      }
      const batch = await getAgentBatch(run.batchId, run.useMcp);
      const action = decidePoll(run, batch, now);
      if (action.kind === 'wait') {
        pending++;
      } else if (action.kind === 'finalize') {
        const result = await collect(run, action.message, deps);
        if (result) collected++; // else: another collector already owns it (F3) — skip silently
      } else if (action.kind === 'continue') {
        const next = await continueRun(run, action.message, deps);
        // I2 — `null` means continueRun's save failed and it already
        // called `fail()` (record deleted, status error, notified); don't
        // double-count this run as pending.
        if (next) pending++;
      } else {
        await fail(run, action.reason, deps);
      }
    } catch (err) {
      // Isolation: a throw from this run's getAgentBatch/collect must not
      // prevent the remaining runs in this poll from being processed.
      await deps.repo.pushEvent({ dept: run.dept, msg: `${run.dept.toUpperCase()} poll error: ${String(err)}`, ts: nowIso() }).catch(() => {});
      pending++;
    }
  }
  return { collected, pending };
}
