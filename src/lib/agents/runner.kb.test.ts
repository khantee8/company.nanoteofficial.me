import { describe, it, expect } from 'vitest';
import { makeRedisRepo, type RedisClientLike } from '@/lib/redis';
import { runAgent } from './runner';
import type { KbEntry } from './types';

function memClient(): RedisClientLike {
  const kv = new Map<string, unknown>(); const lists = new Map<string, unknown[]>();
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

describe('runAgent enriched KB write', () => {
  it('persists slug/theme/provenance/sources on the kb entry as a draft', async () => {
    const repo = makeRedisRepo(memClient());
    const captured: KbEntry[] = [];
    const orig = repo.pushKb.bind(repo);
    repo.pushKb = async (e) => { captured.push(e); return orig(e); };

    await runAgent(
      { dept: 'fin', run: async () => ({
          markdown: '# r\n## Highlight\nx\n## Flags\nNone.',
          summary: 's', feedMsg: 'f',
          theme: 'us-index-sp500', provenance: 'web' as const,
          sources: [{ url: 'https://e.com', title: 't', date: '2026-06-04' }],
          artifacts: [], tags: ['us'],
        }) },
      { repo, notify: async () => {} },
    );

    const e = captured[0];
    expect(e.theme).toBe('us-index-sp500');
    expect(e.provenance).toBe('web');
    expect(e.slug).toMatch(/^fin-us-index-sp500-/);
    expect(e.sources[0].url).toBe('https://e.com');
    expect(e.status).toBe('draft');
  });

  it('defaults provenance to api and theme undefined when result omits them', async () => {
    const repo = makeRedisRepo(memClient());
    const captured: KbEntry[] = [];
    const orig = repo.pushKb.bind(repo);
    repo.pushKb = async (e) => { captured.push(e); return orig(e); };
    await runAgent(
      { dept: 'ops', run: async () => ({ markdown: '# r\n## Highlight\nx\n## Flags\nNone.', summary: 's', feedMsg: 'f', artifacts: [], tags: [] }) },
      { repo, notify: async () => {} },
    );
    expect(captured[0].provenance).toBe('api');
    expect(captured[0].slug).toMatch(/^ops-/);
    expect(captured[0].theme).toBeUndefined();
    expect(captured[0].sources).toEqual([]);
    expect(captured[0].related).toEqual([]);
  });
});
