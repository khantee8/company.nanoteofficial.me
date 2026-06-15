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
