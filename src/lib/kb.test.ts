import { describe, it, expect } from 'vitest';
import { makeRedisRepo, type RedisClientLike } from './redis';
import { getKnowledge } from './kb';
import type { KbEntry } from './agents/types';

/** In-memory Redis with the key/list/hash ops the KB storage uses. */
export function memoryClient(): RedisClientLike {
  const store = new Map<string, unknown>();
  const lists = new Map<string, unknown[]>();
  return {
    async set(key, value) { store.set(key, value); return 'OK'; },
    async get<T>(key: string) { return (store.get(key) as T) ?? null; },
    async del(...keys: string[]) { keys.forEach((k) => store.delete(k)); return keys.length; },
    async mget<T>(keys: string[]) { return keys.map((k) => (store.get(k) as T) ?? null); },
    async lpush(key, value) { const l = lists.get(key) ?? []; l.unshift(value); lists.set(key, l); return l.length; },
    async lrem(key, _count, value) { const l = lists.get(key) ?? []; lists.set(key, l.filter((v) => v !== value)); return 0; },
    async ltrim(key, start, stop) { const l = lists.get(key) ?? []; lists.set(key, l.slice(start, stop === -1 ? undefined : stop + 1)); return 'OK'; },
    async lrange<T>(key: string, start: number, stop: number) {
      const l = (lists.get(key) ?? []) as T[];
      return l.slice(start, stop === -1 ? undefined : stop + 1);
    },
  };
}

const entry = (dept: KbEntry['dept'], date: string, over: Partial<KbEntry> = {}): KbEntry => ({
  id: `${dept}:${date}`, slug: '', dept, date, ts: `${date}T00:00:00Z`,
  category: dept === 'fin' ? 'market-brief' : 'exec-brief', tags: [], status: 'published',
  artifacts: [], sources: [], provenance: 'api', related: [],
  summary: `${dept} ${date}`, highlight: `${dept} hi`, flags: [], markdown: `# ${dept}`,
  ...over,
});

describe('KB storage', () => {
  it('archives addressable entries and lists them newest-first', async () => {
    const repo = makeRedisRepo(memoryClient());
    await repo.pushKb(entry('ceo', '2026-06-01'));
    await repo.pushKb(entry('fin', '2026-06-02'));

    const all = await repo.listKb();
    expect(all).toHaveLength(2);
    expect(all[0].dept).toBe('fin'); // most recent push first
    expect(await repo.getKbEntry('fin:2026-06-02')).toMatchObject({ dept: 'fin' });
  });

  it('updates a single entry (publish/archive/pin/tags) without touching others', async () => {
    const repo = makeRedisRepo(memoryClient());
    await repo.pushKb(entry('fin', '2026-06-02', { status: 'draft' }));
    await repo.pushKb(entry('ceo', '2026-06-01'));

    const updated = await repo.updateKbEntry('fin:2026-06-02', { status: 'published', pinned: true, tags: ['btc'] });
    expect(updated).toMatchObject({ status: 'published', pinned: true, tags: ['btc'] });
    expect(await repo.getKbEntry('ceo:2026-06-01')).toMatchObject({ status: 'published', pinned: undefined });
  });

  it('deletes an entry and removes it from the index', async () => {
    const repo = makeRedisRepo(memoryClient());
    await repo.pushKb(entry('fin', '2026-06-02'));
    await repo.pushKb(entry('ceo', '2026-06-01'));
    await repo.deleteKbEntry('fin:2026-06-02');

    expect(await repo.getKbEntry('fin:2026-06-02')).toBeNull();
    const all = await repo.listKb();
    expect(all.map((e) => e.dept)).toEqual(['ceo']);
  });

  it('filters by status, dept, category, q, and date range', async () => {
    const repo = makeRedisRepo(memoryClient());
    await repo.pushKb(entry('fin', '2026-06-01', { tags: ['btc'], markdown: 'bitcoin rose' }));
    await repo.pushKb(entry('ceo', '2026-06-02', { status: 'draft' }));
    await repo.pushKb(entry('fin', '2026-06-03', { tags: ['eth'] }));

    expect(await repo.listKb({ status: 'published' })).toHaveLength(2);
    expect(await repo.listKb({ dept: 'fin' })).toHaveLength(2);
    expect(await repo.listKb({ category: 'exec-brief' })).toHaveLength(1);
    expect(await repo.listKb({ q: 'bitcoin' })).toHaveLength(1);
    expect(await repo.listKb({ from: '2026-06-02', to: '2026-06-03' }).then((r) => r.length)).toBe(2);
    expect(await repo.listKb({ limit: 1 })).toHaveLength(1);
  });

  it('falls back to and normalizes the pre-v1.3 flat list', async () => {
    const client = memoryClient();
    const repo = makeRedisRepo(client);
    // Seed a legacy entry that lacks id/category/tags/status/artifacts.
    await client.lpush('kb:entries', { dept: 'fin', date: '2026-05-30', ts: '2026-05-30T00:00:00Z', summary: 's', highlight: 'h', flags: [], markdown: '# old' });

    const all = await repo.listKb();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 'fin:2026-05-30T00:00:00Z', category: 'market-brief', status: 'published', tags: [], artifacts: [] });
  });
});

describe('getKnowledge (public)', () => {
  it('returns published only, honoring filters', async () => {
    const repo = makeRedisRepo(memoryClient());
    await repo.pushKb(entry('fin', '2026-06-01'));
    await repo.pushKb(entry('ceo', '2026-06-02', { status: 'draft' }));
    await repo.pushKb(entry('fin', '2026-06-03', { status: 'archived' }));

    const all = await getKnowledge(repo);
    expect(all).toHaveLength(1);
    expect(all[0].dept).toBe('fin');
    expect(await getKnowledge(repo, { dept: 'ceo' })).toHaveLength(0); // its only entry is a draft
  });
});
