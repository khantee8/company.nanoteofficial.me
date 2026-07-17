import { describe, it, expect } from 'vitest';
import { makeRedisRepo, type RedisClientLike } from '@/lib/redis';
import { makeMemoryKbStore } from '@/lib/kbDb';
import { buildContext } from './runner';
import type { KbEntry } from './types';

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

const mk = (over: Partial<KbEntry> & { dept: KbEntry['dept']; ts: string }): KbEntry => ({
  id: `${over.dept}:${over.ts}`, slug: '', date: over.ts.slice(0, 10),
  category: 'market-brief', tags: [], status: 'draft', summary: '', highlight: '', flags: [],
  artifacts: [], sources: [], provenance: 'api', related: [], markdown: '', ...over,
});

describe('buildContext for ceo', () => {
  it('computes relatedEntryIds = newest entry per non-ceo dept', async () => {
    const repo = makeRedisRepo(memClient(), makeMemoryKbStore());
    await repo.pushKb(mk({ id: 'fin:1', dept: 'fin', ts: '2026-06-04T10:00:00Z' }));
    await repo.pushKb(mk({ id: 'cyb:1', dept: 'cyb', ts: '2026-06-04T11:00:00Z' }));
    await repo.pushKb(mk({ id: 'ceo:1', dept: 'ceo', ts: '2026-06-04T15:00:00Z' }));
    const ctx = await buildContext('ceo', repo);
    const ids = ctx.companySnapshot?.relatedEntryIds ?? [];
    expect(ids).toContain('fin:1');
    expect(ids).toContain('cyb:1');
    expect(ids).not.toContain('ceo:1'); // excludes own dept
  });

  it('keeps only the newest entry per dept', async () => {
    const repo = makeRedisRepo(memClient(), makeMemoryKbStore());
    await repo.pushKb(mk({ id: 'fin:1', dept: 'fin', ts: '2026-06-03T10:00:00Z' }));
    await repo.pushKb(mk({ id: 'fin:2', dept: 'fin', ts: '2026-06-04T10:00:00Z' })); // newer
    const ctx = await buildContext('ceo', repo);
    const ids = ctx.companySnapshot?.relatedEntryIds ?? [];
    expect(ids).toContain('fin:2');
    expect(ids).not.toContain('fin:1');
  });
});
