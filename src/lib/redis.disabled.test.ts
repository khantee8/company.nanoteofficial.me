import { describe, it, expect } from 'vitest';
import { makeRedisRepo, type RedisClientLike } from './redis';

function memoryClient(): RedisClientLike {
  const store = new Map<string, unknown>();
  return {
    async set(k, v) { store.set(k, v); return 'OK'; },
    async get<T>(k: string) { return (store.get(k) as T) ?? null; },
    async del(...keys: string[]) { keys.forEach((k) => store.delete(k)); return keys.length; },
    async mget<T>(keys: string[]) { return keys.map((k) => (store.get(k) as T) ?? null); },
    async lpush() { return 1; },
    async lrem() { return 0; },
    async ltrim() { return 'OK'; },
    async lrange<T>() { return [] as T[]; },
  };
}

describe('agent disabled flag', () => {
  it('defaults to enabled (not disabled)', async () => {
    const repo = makeRedisRepo(memoryClient());
    expect(await repo.isAgentDisabled('fin')).toBe(false);
    expect(await repo.getDisabledDepts()).toEqual([]);
  });

  it('sets, reads, and clears a disabled flag', async () => {
    const repo = makeRedisRepo(memoryClient());
    await repo.setAgentDisabled('fin', true);
    expect(await repo.isAgentDisabled('fin')).toBe(true);
    expect(await repo.getDisabledDepts()).toEqual(['fin']);
    await repo.setAgentDisabled('fin', false);
    expect(await repo.isAgentDisabled('fin')).toBe(false);
    expect(await repo.getDisabledDepts()).toEqual([]);
  });
});
