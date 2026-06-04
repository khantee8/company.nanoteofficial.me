import { describe, it, expect } from 'vitest';
import { makeRedisRepo, type RedisClientLike } from './redis';
import type { FocusSession } from './telegram';

function memClient(): RedisClientLike {
  const kv = new Map<string, unknown>();
  const lists = new Map<string, unknown[]>();
  return {
    async set(k, v) { kv.set(k, v); return 'OK'; },
    async get(k) { return (kv.get(k) ?? null) as never; },
    async del(...ks) { ks.forEach((k) => kv.delete(k)); return ks.length; },
    async mget(ks) { return ks.map((k) => (kv.get(k) ?? null)) as never; },
    async lpush(k, v) { const l = lists.get(k) ?? []; l.unshift(v); lists.set(k, l); return l.length; },
    async lrem(k, _c, v) { const l = lists.get(k) ?? []; lists.set(k, l.filter((x) => x !== v)); return 1; },
    async ltrim() { return 'OK'; },
    async lrange(k, s, e) { const l = (lists.get(k) ?? []) as never[]; return l.slice(s, e === -1 ? undefined : e + 1); },
  };
}

describe('focus session storage', () => {
  it('round-trips and clears a focus session', async () => {
    const repo = makeRedisRepo(memClient());
    const s: FocusSession = { dept: 'fin', turns: [{ role: 'user', text: 'hi' }], until: Date.now() + 1000 };
    expect(await repo.getFocus(7)).toBeNull();
    await repo.setFocus(7, s);
    expect((await repo.getFocus(7))?.dept).toBe('fin');
    await repo.clearFocus(7);
    expect(await repo.getFocus(7)).toBeNull();
  });
});
