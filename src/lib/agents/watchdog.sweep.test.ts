// src/lib/agents/watchdog.sweep.test.ts — direct coverage for runSweep (v1.12
// update: the rerun is now an async batch submit via `submitRunSafe`, not a
// synchronous `runAgent` call — mock `./asyncRun` instead). Covers
// mark-before-submit ordering, the pre-submit announce, and the submit-throw
// path (submission itself failed). The success/failure OUTCOME notify (🔧
// recovered / 🚨 failed twice) is now owned by asyncRun's collection-time
// sweep-origin handling — see asyncRun.test.ts for that coverage.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSweep } from './watchdog';
import { submitRunSafe } from './asyncRun';
import type { RedisRepo } from '@/lib/redis';
import type { AgentStatus } from './types';
import type { DeptId } from '@/lib/data/departments';

vi.mock('./runner', () => ({
  todayDate: () => new Date().toISOString().slice(0, 10),
}));
vi.mock('./asyncRun', () => ({
  submitRunSafe: vi.fn(),
}));

const mockSubmitRunSafe = submitRunSafe as unknown as ReturnType<typeof vi.fn>;

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
  mockSubmitRunSafe.mockReset();
});

describe('runSweep', () => {
  it('marks retried, then announces, BEFORE submitting the batch for the failed dept (no retry loop; no silent 300s kill)', async () => {
    const repo = fakeRepo();
    const callOrder: string[] = [];
    const notify = vi.fn(async () => { callOrder.push('notify'); });
    (repo.markRetried as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      callOrder.push('markRetried');
    });
    mockSubmitRunSafe.mockImplementation(async () => {
      callOrder.push('submitRunSafe');
      return { queued: true };
    });

    await runSweep({ repo, notify });

    // pre-submit announce sits between markRetried and submitRunSafe; no
    // trailing notify from runSweep itself on the success path — the
    // recovered/queued outcome notify is now owned by collection.
    expect(callOrder).toEqual(['markRetried', 'notify', 'submitRunSafe']);
    expect(notify).toHaveBeenNthCalledWith(1, expect.stringContaining('attempting self-heal rerun of FIN'));
  });

  it('submit-throw path: submitRunSafe rejects (submission itself failed) → ok:false, sweep log ok:false, alerts with 🚨 + "failed twice"', async () => {
    const repo = fakeRepo();
    const notify = vi.fn(async () => {});
    mockSubmitRunSafe.mockRejectedValue(new Error('boom'));

    const result = await runSweep({ repo, notify });

    expect(result).toEqual({ retried: 'fin', ok: false });
    expect(repo.pushSweepLog).toHaveBeenCalledWith(
      expect.objectContaining({ dept: 'fin', ok: false, detail: expect.stringContaining('boom') }),
    );
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('🚨'));
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('failed twice'));
  });

  it('submit-success path: submitRunSafe resolves → runSweep reports ok:true without its own recovered notify (collection owns that)', async () => {
    const repo = fakeRepo();
    const notify = vi.fn(async () => {});
    mockSubmitRunSafe.mockResolvedValue({ queued: true });

    const result = await runSweep({ repo, notify });

    expect(result).toEqual({ retried: 'fin', ok: true });
    expect(repo.pushSweepLog).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalledWith(expect.stringContaining('recovered'));
    expect(mockSubmitRunSafe).toHaveBeenCalledWith(
      'fin',
      { repo, notify },
      expect.objectContaining({ origin: 'sweep', selfPollMs: 120_000 }),
    );
  });

  it('no-op path: all depts healthy → retried:null, no markRetried/pushSweepLog/submitRunSafe', async () => {
    const repo = fakeRepo({
      getStatus: vi.fn(async (dept: DeptId): Promise<AgentStatus> => ({ dept, state: 'done', lastRun: null })),
    });
    const notify = vi.fn(async () => {});

    const result = await runSweep({ repo, notify });

    expect(result).toEqual({ retried: null });
    expect(repo.markRetried).not.toHaveBeenCalled();
    expect(repo.pushSweepLog).not.toHaveBeenCalled();
    expect(mockSubmitRunSafe).not.toHaveBeenCalled();
  });
});
