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
