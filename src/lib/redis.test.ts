import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeRedisRepo } from './redis';
import type { AgentStatus, AgentOutput, FeedEvent } from './agents/types';

function fakeClient() {
  const store = new Map<string, unknown>();
  const list = new Map<string, unknown[]>();
  return {
    store, list,
    set: vi.fn(async (k: string, v: unknown) => { store.set(k, v); }),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    lpush: vi.fn(async (k: string, v: unknown) => { const a = list.get(k) ?? []; a.unshift(v); list.set(k, a); return a.length; }),
    ltrim: vi.fn(async (k: string, start: number, stop: number) => { const a = list.get(k) ?? []; list.set(k, a.slice(start, stop + 1)); }),
    lrange: vi.fn(async (k: string, start: number, stop: number) => { const a = list.get(k) ?? []; return a.slice(start, stop === -1 ? undefined : stop + 1); }),
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

  it('stores and reads an output', async () => {
    const o: AgentOutput = { dept: 'mkt', markdown: '# hi', summary: 's', ts: '2026-05-28T13:00:00Z' };
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
});
