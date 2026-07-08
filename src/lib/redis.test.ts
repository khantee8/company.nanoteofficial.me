import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRedisRepo, type RedisClientLike } from './redis';
import type { AgentStatus, AgentOutput, FeedEvent } from './agents/types';

function fakeClient() {
  const store = new Map<string, unknown>();
  const list = new Map<string, unknown[]>();
  return {
    store, list,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    set: vi.fn(async (k: string, v: unknown, _options?: unknown) => { store.set(k, v); }),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    del: vi.fn(async (...keys: string[]) => { keys.forEach((k) => store.delete(k)); return keys.length; }),
    mget: vi.fn(async (keys: string[]) => keys.map((k) => store.get(k) ?? null)),
    lpush: vi.fn(async (k: string, v: unknown) => { const a = list.get(k) ?? []; a.unshift(v); list.set(k, a); return a.length; }),
    lrem: vi.fn(async (k: string, _count: number, v: unknown) => { const a = list.get(k) ?? []; list.set(k, a.filter((x) => x !== v)); return 0; }),
    ltrim: vi.fn(async (k: string, start: number, stop: number) => { const a = list.get(k) ?? []; list.set(k, a.slice(start, stop + 1)); }),
    lrange: vi.fn(async (k: string, start: number, stop: number) => { const a = list.get(k) ?? []; return a.slice(start, stop === -1 ? undefined : stop + 1); }),
  } as unknown as RedisClientLike & {
    store: Map<string, unknown>;
    list: Map<string, unknown[]>;
    set: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    del: ReturnType<typeof vi.fn>;
    mget: ReturnType<typeof vi.fn>;
    lpush: ReturnType<typeof vi.fn>;
    lrem: ReturnType<typeof vi.fn>;
    ltrim: ReturnType<typeof vi.fn>;
    lrange: ReturnType<typeof vi.fn>;
  };
}

describe('redis repo', () => {
  let client: ReturnType<typeof fakeClient>;
  let repo: ReturnType<typeof makeRedisRepo>;
  beforeEach(() => { client = fakeClient(); repo = makeRedisRepo(client); });

  it('stores and reads agent status', async () => {
    const s: AgentStatus = { dept: 'fin', state: 'done', lastRun: '2026-05-28T11:00:00Z', summary: 'ok' };
    await repo.setStatus(s);
    expect(client.set).toHaveBeenCalledWith('agent:fin:status', s);
    expect(await repo.getStatus('fin')).toEqual(s);
  });

  it('returns a default idle status when none stored', async () => {
    expect(await repo.getStatus('ceo')).toEqual({ dept: 'ceo', state: 'idle', lastRun: null });
  });

  it('normalizes a stale running status to error (hard-killed run)', async () => {
    const lastRun = new Date(Date.now() - 16 * 60_000).toISOString();
    await repo.setStatus({ dept: 'fin', state: 'running', lastRun });
    const s = await repo.getStatus('fin');
    expect(s.state).toBe('error');
    expect(s.lastRun).toBe(lastRun);
    expect(s.error).toMatch(/interrupted/);
  });

  it('keeps a fresh running status as running', async () => {
    const lastRun = new Date(Date.now() - 2 * 60_000).toISOString();
    await repo.setStatus({ dept: 'fin', state: 'running', lastRun });
    expect((await repo.getStatus('fin')).state).toBe('running');
  });

  it('treats running with no lastRun as stale', async () => {
    await repo.setStatus({ dept: 'fin', state: 'running', lastRun: null });
    expect((await repo.getStatus('fin')).state).toBe('error');
  });

  it('stores and reads an output', async () => {
    const o: AgentOutput = { dept: 'mkt', markdown: '# hi', summary: 's', ts: '2026-05-28T13:00:00Z', category: 'content-plan', tags: [], artifacts: [] };
    await repo.setOutput(o);
    expect(await repo.getOutput('mkt')).toEqual(o);
  });

  it('pushes feed events and caps the list at 50', async () => {
    for (let i = 0; i < 55; i++) {
      const e: FeedEvent = { dept: 'ops', msg: `m${i}`, ts: '2026-05-28T00:00:00Z' };
      await repo.pushEvent(e);
    }
    expect(client.ltrim).toHaveBeenLastCalledWith('feed:events', 0, 49);
    const recent = await repo.getFeed(10);
    expect(recent.length).toBe(10);
    expect(recent[0].msg).toBe('m54');
  });

  it('marks and reads the per-day retry flag', async () => {
    expect(await repo.wasRetriedToday('fin', '2026-07-05')).toBe(false);
    await repo.markRetried('fin', '2026-07-05');
    expect(await repo.wasRetriedToday('fin', '2026-07-05')).toBe(true);
    expect(await repo.wasRetriedToday('fin', '2026-07-06')).toBe(false); // next day resets
  });

  it('sweep log is capped LIFO', async () => {
    await repo.pushSweepLog({ dept: 'fin', ok: false, detail: 'timeout', ts: 1 });
    await repo.pushSweepLog({ dept: 'rnd', ok: true, detail: 'recovered', ts: 2 });
    const log = await repo.getSweepLog();
    expect(log[0]).toMatchObject({ dept: 'rnd', ok: true });
  });

  it('pending runs: save, list, delete', async () => {
    const run = { id: 'fin:2026-07-07T10:00:00Z', dept: 'fin', submittedAt: 1, batchId: 'b1', customId: 'c1',
      continuations: 0, origin: 'cron', opts: { system: 's', prompt: 'p' }, meta: {}, partialTexts: [], usageAcc: { input: 0, output: 0 },
      resumeContent: [], useMcp: false };
    await repo.savePendingRun(run as never);
    expect((await repo.getPendingRuns()).map((r) => r.id)).toEqual([run.id]);
    await repo.deletePendingRun(run.id);
    expect(await repo.getPendingRuns()).toEqual([]);
  });
});
