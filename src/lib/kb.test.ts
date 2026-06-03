import { describe, it, expect } from 'vitest';
import { makeRedisRepo, type RedisClientLike } from './redis';
import { getKnowledge } from './kb';
import type { KbEntry } from './agents/types';

function memoryClient(): RedisClientLike {
  const store = new Map<string, unknown>();
  const lists = new Map<string, unknown[]>();
  return {
    async set(key, value) { store.set(key, value); return 'OK'; },
    async get<T>(key: string) { return (store.get(key) as T) ?? null; },
    async lpush(key, value) { const l = lists.get(key) ?? []; l.unshift(value); lists.set(key, l); return l.length; },
    async ltrim() { return 'OK'; },
    async lrange<T>(key: string, start: number, stop: number) {
      const l = (lists.get(key) ?? []) as T[];
      return l.slice(start, stop === -1 ? undefined : stop + 1);
    },
  };
}

const entry = (dept: KbEntry['dept'], date: string): KbEntry => ({
  id: `${dept}:${date}`, dept, date, ts: `${date}T00:00:00Z`,
  category: 'exec-brief', tags: [], status: 'published', artifacts: [],
  summary: `${dept} ${date}`, highlight: `${dept} hi`, flags: [], markdown: `# ${dept}`,
});

describe('knowledge base', () => {
  it('archives entries and lists them newest-first', async () => {
    const repo = makeRedisRepo(memoryClient());
    await repo.pushKb(entry('ceo', '2026-06-01'));
    await repo.pushKb(entry('fin', '2026-06-02'));

    const all = await getKnowledge(repo);
    expect(all).toHaveLength(2);
    expect(all[0].dept).toBe('fin'); // most recent push first
  });

  it('filters by department and respects limit', async () => {
    const repo = makeRedisRepo(memoryClient());
    await repo.pushKb(entry('ceo', '2026-06-01'));
    await repo.pushKb(entry('ceo', '2026-06-02'));
    await repo.pushKb(entry('fin', '2026-06-02'));

    expect(await getKnowledge(repo, { dept: 'ceo' })).toHaveLength(2);
    expect(await getKnowledge(repo, { dept: 'fin' })).toHaveLength(1);
    expect(await getKnowledge(repo, { limit: 1 })).toHaveLength(1);
  });
});
