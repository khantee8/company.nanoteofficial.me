import { describe, it, expect } from 'vitest';
import { makeRedisRepo, type RedisClientLike } from './redis';
import type { KbEntry } from './agents/types';

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

const entry = (over: Partial<KbEntry> & { dept: KbEntry['dept']; ts: string }): KbEntry => ({
  id: over.id ?? `${over.dept}:${over.ts}`, slug: '', date: over.ts.slice(0, 10),
  category: 'market-brief', tags: [], status: 'published', summary: '', highlight: '',
  flags: [], artifacts: [], sources: [], provenance: 'api', related: [], markdown: '', ...over,
});

describe('knowledge graph', () => {
  it('getKbBySlug finds a published entry and resolves series + tag neighbours', async () => {
    const repo = makeRedisRepo(memClient());
    await repo.pushKb(entry({ id: 'fin:1', slug: 'fin-sp500-2026-06-01', dept: 'fin', ts: '2026-06-01T10:00:00Z', theme: 'sp500', tags: ['us', 'index'] }));
    await repo.pushKb(entry({ id: 'fin:2', slug: 'fin-sp500-2026-06-04', dept: 'fin', ts: '2026-06-04T10:00:00Z', theme: 'sp500', tags: ['us', 'index'] }));
    await repo.pushKb(entry({ id: 'rnd:1', slug: 'rnd-2026-06-03', dept: 'rnd', ts: '2026-06-03T10:00:00Z', tags: ['index'] }));

    const res = await repo.getKbBySlug('fin-sp500-2026-06-04');
    expect(res?.entry.id).toBe('fin:2');
    const ids = res!.related.map((r) => r.id).sort();
    expect(ids).toContain('fin:1');
    expect(ids).toContain('rnd:1');
  });

  it('resolves explicit related ids', async () => {
    const repo = makeRedisRepo(memClient());
    await repo.pushKb(entry({ id: 'ceo:1', slug: 'ceo-weekly-2026-06-07', dept: 'ceo', ts: '2026-06-07T15:00:00Z', related: ['fin:2'] }));
    await repo.pushKb(entry({ id: 'fin:2', slug: 'fin-sp500-2026-06-04', dept: 'fin', ts: '2026-06-04T10:00:00Z' }));
    const res = await repo.getKbBySlug('ceo-weekly-2026-06-07');
    expect(res?.related.map((r) => r.id)).toContain('fin:2');
  });

  it('returns null for a draft slug (published-only)', async () => {
    const repo = makeRedisRepo(memClient());
    await repo.pushKb(entry({ id: 'fin:9', slug: 'fin-x-2026-06-04', dept: 'fin', ts: '2026-06-04T10:00:00Z', status: 'draft' }));
    expect(await repo.getKbBySlug('fin-x-2026-06-04')).toBeNull();
  });
});
