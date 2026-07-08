import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PendingRun, RedisRepo } from '@/lib/redis';
import type { DeptId } from '@/lib/data/departments';

// Mock only the network-touching claude.ts wrappers — buildRequestShape and
// completionFromMessage are pure and stay real so the async flow exercises
// real request-shape/accumulation logic.
vi.mock('@/lib/claude', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/claude')>();
  return { ...actual, createAgentBatch: vi.fn(), getAgentBatch: vi.fn() };
});

// Mock the dept registry — asyncRun only needs PREPARES/FINALIZES to behave
// like a dept module; the real registry would pull in every dept's role-spec
// file reads (roles.ts) which is out of scope for this file's tests.
vi.mock('./index', () => ({
  PREPARES: {
    fin: vi.fn(), ceo: vi.fn(), cyb: vi.fn(), mkt: vi.fn(), rnd: vi.fn(), ops: vi.fn(),
  },
  FINALIZES: {
    fin: vi.fn(), ceo: vi.fn(), cyb: vi.fn(), mkt: vi.fn(), rnd: vi.fn(), ops: vi.fn(),
  },
}));

import { submitRun, pollPendingRuns, decidePoll, MAX_CONTINUATIONS } from './asyncRun';
import * as claudeLib from '@/lib/claude';
import { PREPARES, FINALIZES } from './index';

const createAgentBatch = vi.mocked(claudeLib.createAgentBatch);
const getAgentBatch = vi.mocked(claudeLib.getAgentBatch);
const prepFin = vi.mocked(PREPARES.fin);
const finalFin = vi.mocked(FINALIZES.fin);

function fakeRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getHistory: vi.fn(async () => []),
    getDigest: vi.fn(async () => []),
    getStatus: vi.fn(async (dept: DeptId) => ({ dept, state: 'idle' as const, lastRun: null })),
    getOutput: vi.fn(async () => null),
    setOutput: vi.fn(async () => {}),
    pushEvent: vi.fn(async () => {}),
    setStatus: vi.fn(async () => {}),
    pushHistory: vi.fn(async () => {}),
    pushDigest: vi.fn(async () => {}),
    pushKb: vi.fn(async () => {}),
    listKb: vi.fn(async () => []),
    recordUsage: vi.fn(async () => {}),
    getUsageSince: vi.fn(async () => []),
    getSweepLog: vi.fn(async () => []),
    pushSyncLog: vi.fn(async () => {}),
    pushSweepLog: vi.fn(async () => {}),
    savePendingRun: vi.fn(async () => {}),
    getPendingRuns: vi.fn(async () => []),
    deletePendingRun: vi.fn(async () => {}),
    ...overrides,
  } as unknown as RedisRepo;
}

// A batch item's `message`, shaped like an Anthropic.Messages.Message just
// enough for completionFromMessage/textOf — cast away the rest (mirrors the
// brief's own decidePoll fixture).
const msg = (stop: string, extra: Partial<{ input: number; output: number; model: string }> = {}) =>
  ({
    stop_reason: stop,
    content: [{ type: 'text', text: `text-${stop}` }],
    usage: { input_tokens: extra.input ?? 1, output_tokens: extra.output ?? 1 },
    model: extra.model ?? 'm',
  }) as never;

beforeEach(() => {
  createAgentBatch.mockReset();
  getAgentBatch.mockReset();
  prepFin.mockReset();
  prepFin.mockResolvedValue({ opts: { system: 's', prompt: 'p' }, meta: { theme: 'x' } });
  finalFin.mockReset();
  finalFin.mockImplementation(
    () =>
      ({
        markdown: '## Highlight\nhi\n\n## Flags\n- none',
        summary: 'fin done',
        feedMsg: 'fin ran',
        sources: [{ url: 'https://x', title: 't', date: '2026-07-08' }],
        provenance: 'web',
      }) as never,
  );
});

describe('decidePoll', () => {
  const base: PendingRun = {
    id: 'fin:t', dept: 'fin', submittedAt: 1000, batchId: 'b', customId: 'c', continuations: 0,
    origin: 'cron', opts: { system: 's', prompt: 'p' }, meta: {}, partialTexts: [],
    usageAcc: { input: 0, output: 0 }, resumeContent: [], useMcp: false,
  };

  it('in_progress → wait', () => {
    expect(decidePoll(base, { status: 'in_progress' }, 2000).kind).toBe('wait');
  });
  it('succeeded end_turn → finalize', () => {
    expect(decidePoll(base, { status: 'ended', result: { type: 'succeeded', message: msg('end_turn') } }, 2000).kind).toBe('finalize');
  });
  it('pause_turn under cap → continue', () => {
    expect(decidePoll(base, { status: 'ended', result: { type: 'succeeded', message: msg('pause_turn') } }, 2000).kind).toBe('continue');
  });
  it('pause_turn at cap → fail', () => {
    expect(
      decidePoll({ ...base, continuations: MAX_CONTINUATIONS }, { status: 'ended', result: { type: 'succeeded', message: msg('pause_turn') } }, 2000).kind,
    ).toBe('fail');
  });
  it('errored → fail', () => {
    expect(decidePoll(base, { status: 'ended', result: { type: 'errored', error: 'x' } }, 2000).kind).toBe('fail');
  });
  it('stale >6h → fail even in_progress', () => {
    expect(decidePoll(base, { status: 'in_progress' }, 1000 + 6 * 3600_000 + 1).kind).toBe('fail');
  });
});

describe('submitRun', () => {
  it('happy path: self-poll finds end_turn on first check → persists + deletes pending, status queued→done', async () => {
    const repo = fakeRepo();
    const notify = vi.fn(async () => {});
    createAgentBatch.mockResolvedValueOnce('batch1');
    getAgentBatch.mockResolvedValueOnce({ status: 'ended', result: { type: 'succeeded', message: msg('end_turn') } });

    const res = await submitRun('fin', { repo, notify }, { selfPollMs: 1000, pollIntervalMs: 5 });

    expect(res).toEqual({ queued: false, summary: 'fin done' });
    expect(createAgentBatch).toHaveBeenCalledTimes(1);
    expect(getAgentBatch).toHaveBeenCalledWith('batch1', false);
    expect(repo.savePendingRun).toHaveBeenCalledTimes(1);
    expect(repo.setStatus).toHaveBeenNthCalledWith(1, expect.objectContaining({ dept: 'fin', state: 'queued' }));
    expect(repo.setStatus).toHaveBeenLastCalledWith(expect.objectContaining({ dept: 'fin', state: 'done', summary: 'fin done' }));
    expect(repo.deletePendingRun).toHaveBeenCalledWith(expect.stringMatching(/^fin:/));
    expect(repo.pushKb).toHaveBeenCalledWith(expect.objectContaining({ status: 'published' }));
  });

  it('MCP 400 on submit → resubmits once without mcpServers, webSearch:true', async () => {
    const repo = fakeRepo();
    const notify = vi.fn(async () => {});
    prepFin.mockResolvedValueOnce({
      opts: { system: 's', prompt: 'p', mcpServers: [{ url: 'https://mcp', name: 'thai-funds' }] },
      meta: {},
    });
    createAgentBatch.mockRejectedValueOnce(new Error('mcp connector: 400 bad request'));
    createAgentBatch.mockResolvedValueOnce('batch-fallback');
    getAgentBatch.mockResolvedValueOnce({ status: 'in_progress' });

    const res = await submitRun('fin', { repo, notify }, { selfPollMs: 0 });

    expect(res).toEqual({ queued: true });
    expect(createAgentBatch).toHaveBeenCalledTimes(2);
    const secondShape = createAgentBatch.mock.calls[1][1] as { params: Record<string, unknown>; useMcp: boolean };
    expect(secondShape.useMcp).toBe(false);
    expect(secondShape.params).not.toHaveProperty('mcp_servers');
    expect(repo.savePendingRun).toHaveBeenCalledWith(
      expect.objectContaining({
        batchId: 'batch-fallback',
        useMcp: false,
        opts: expect.objectContaining({ webSearch: true, mcpServers: undefined }),
      }),
    );
  });

  it('sweep origin: successful collection fires pushSweepLog ok:true + a 🔧 recovered notify (in addition to the normal run notify)', async () => {
    const repo = fakeRepo();
    const notify = vi.fn(async () => {});
    createAgentBatch.mockResolvedValueOnce('batch1');
    getAgentBatch.mockResolvedValueOnce({ status: 'ended', result: { type: 'succeeded', message: msg('end_turn') } });

    await submitRun('fin', { repo, notify }, { origin: 'sweep', selfPollMs: 1000, pollIntervalMs: 5 });

    expect(repo.pushSweepLog).toHaveBeenCalledWith(expect.objectContaining({ dept: 'fin', ok: true, detail: 'fin done' }));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('🔧'));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('recovered'));
  });
});

describe('pollPendingRuns', () => {
  it('pause_turn → resubmits a new batch, continuations=1, pending run updated (not deleted)', async () => {
    const run: PendingRun = {
      id: 'fin:t1', dept: 'fin', submittedAt: Date.now(), batchId: 'b-old', customId: 'fin-1', continuations: 0,
      origin: 'cron', opts: { system: 's', prompt: 'p' }, meta: {}, partialTexts: [],
      usageAcc: { input: 0, output: 0 }, resumeContent: [], useMcp: false,
    };
    const repo = fakeRepo({ getPendingRuns: vi.fn(async () => [run]) });
    const notify = vi.fn(async () => {});
    getAgentBatch.mockResolvedValueOnce({ status: 'ended', result: { type: 'succeeded', message: msg('pause_turn') } });
    createAgentBatch.mockResolvedValueOnce('b-new');

    const res = await pollPendingRuns({ repo, notify });

    expect(res).toEqual({ collected: 0, pending: 1 });
    expect(createAgentBatch).toHaveBeenCalledWith('fin-1', expect.anything());
    expect(repo.savePendingRun).toHaveBeenCalledWith(expect.objectContaining({ batchId: 'b-new', continuations: 1 }));
    expect(repo.deletePendingRun).not.toHaveBeenCalled();
  });

  it('stale (>6h) → status error, pending run deleted, not collected', async () => {
    const staleRun: PendingRun = {
      id: 'cyb:t0', dept: 'cyb', submittedAt: Date.now() - 7 * 3600_000, batchId: 'b-stale', customId: 'cyb-1', continuations: 0,
      origin: 'cron', opts: { system: 's', prompt: 'p' }, meta: {}, partialTexts: [],
      usageAcc: { input: 0, output: 0 }, resumeContent: [], useMcp: false,
    };
    const repo = fakeRepo({ getPendingRuns: vi.fn(async () => [staleRun]) });
    const notify = vi.fn(async () => {});
    getAgentBatch.mockResolvedValueOnce({ status: 'in_progress' });

    const res = await pollPendingRuns({ repo, notify });

    expect(res).toEqual({ collected: 0, pending: 0 });
    expect(repo.setStatus).toHaveBeenCalledWith(expect.objectContaining({ dept: 'cyb', state: 'error' }));
    expect(repo.deletePendingRun).toHaveBeenCalledWith('cyb:t0');
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('⚠ failed'));
  });

  it('stale + sweep origin → also fires pushSweepLog ok:false + a 🚨 failed-twice notify', async () => {
    const staleRun: PendingRun = {
      id: 'mkt:t0', dept: 'mkt', submittedAt: Date.now() - 7 * 3600_000, batchId: 'b-stale', customId: 'mkt-1', continuations: 0,
      origin: 'sweep', opts: { system: 's', prompt: 'p' }, meta: {}, partialTexts: [],
      usageAcc: { input: 0, output: 0 }, resumeContent: [], useMcp: false,
    };
    const repo = fakeRepo({ getPendingRuns: vi.fn(async () => [staleRun]) });
    const notify = vi.fn(async () => {});
    getAgentBatch.mockResolvedValueOnce({ status: 'in_progress' });

    await pollPendingRuns({ repo, notify });

    expect(repo.pushSweepLog).toHaveBeenCalledWith(expect.objectContaining({ dept: 'mkt', ok: false }));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('🚨'));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('failed twice'));
  });
});
