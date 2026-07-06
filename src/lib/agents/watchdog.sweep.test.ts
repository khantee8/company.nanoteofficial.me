// src/lib/agents/watchdog.sweep.test.ts — direct coverage for runSweep (v1.11
// follow-up): mark-before-rerun ordering, failure/success/no-op paths. Split
// from watchdog.test.ts so the hoisted vi.mock('./runner'/'./index') here
// can't affect the pure decideRetry/SAFE_OVERRIDES tests in that file.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSweep } from './watchdog';
import { runAgent } from './runner';
import type { RedisRepo } from '@/lib/redis';
import type { AgentStatus } from './types';
import type { DeptId } from '@/lib/data/departments';

vi.mock('./runner', () => ({ runAgent: vi.fn() }));
vi.mock('./index', () => ({
  AGENTS: { ceo: vi.fn(), cyb: vi.fn(), fin: vi.fn(), mkt: vi.fn(), rnd: vi.fn(), ops: vi.fn() },
}));

const mockRunAgent = runAgent as unknown as ReturnType<typeof vi.fn>;

function fakeRepo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    getStatus: vi.fn(async (dept: DeptId): Promise<AgentStatus> =>
      ({ dept, state: dept === 'fin' ? 'error' : 'done', lastRun: '2026-07-05T10:00:00Z' })),
    getDisabledDepts: vi.fn(async () => []),
    wasRetriedToday: vi.fn(async () => false),
    markRetried: vi.fn(async () => {}),
    pushSweepLog: vi.fn(async () => {}),
    ...overrides,
  } as unknown as RedisRepo;
}

beforeEach(() => {
  mockRunAgent.mockReset();
});

describe('runSweep', () => {
  it('marks retried BEFORE rerunning the failed dept (no retry loop on crash)', async () => {
    const repo = fakeRepo();
    const notify = vi.fn(async () => {});
    const callOrder: string[] = [];
    (repo.markRetried as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('markRetried');
    });
    mockRunAgent.mockImplementation(async () => {
      callOrder.push('runAgent');
      return { summary: 's' };
    });

    await runSweep({ repo, notify });

    expect(callOrder).toEqual(['markRetried', 'runAgent']);
  });

  it('failure path: runAgent rejects → ok:false, sweep log ok:false, alerts with 🚨 + "failed twice"', async () => {
    const repo = fakeRepo();
    const notify = vi.fn(async () => {});
    mockRunAgent.mockRejectedValue(new Error('boom'));

    const result = await runSweep({ repo, notify });

    expect(result).toEqual({ retried: 'fin', ok: false });
    expect(repo.pushSweepLog).toHaveBeenCalledWith(
      expect.objectContaining({ dept: 'fin', ok: false, detail: expect.stringContaining('boom') }),
    );
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('🚨'));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('failed twice'));
  });

  it('success path: runAgent resolves → ok:true, sweep log ok:true, notifies with 🔧 + "recovered"', async () => {
    const repo = fakeRepo();
    const notify = vi.fn(async () => {});
    mockRunAgent.mockResolvedValue({ summary: 's' });

    const result = await runSweep({ repo, notify });

    expect(result).toEqual({ retried: 'fin', ok: true });
    expect(repo.pushSweepLog).toHaveBeenCalledWith(
      expect.objectContaining({ dept: 'fin', ok: true, detail: 's' }),
    );
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('🔧'));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('recovered'));
  });

  it('no-op path: all depts healthy → retried:null, no markRetried/pushSweepLog/runAgent', async () => {
    const repo = fakeRepo({
      getStatus: vi.fn(async (dept: DeptId): Promise<AgentStatus> => ({ dept, state: 'done', lastRun: null })),
    });
    const notify = vi.fn(async () => {});

    const result = await runSweep({ repo, notify });

    expect(result).toEqual({ retried: null });
    expect(repo.markRetried).not.toHaveBeenCalled();
    expect(repo.pushSweepLog).not.toHaveBeenCalled();
    expect(mockRunAgent).not.toHaveBeenCalled();
  });
});
