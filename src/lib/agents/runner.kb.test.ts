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
  it('persists slug/theme/provenance/sources on the kb entry, auto-published via the quality gate', async () => {
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
    // v1.11 — fin is a frontend dept; a cited, complete run clears the quality
    // gate and auto-publishes rather than landing as a draft.
    expect(e.status).toBe('published');
  });

  it('defaults provenance to api and theme undefined when result omits them', async () => {
    const repo = makeRedisRepo(memClient());
    const captured: KbEntry[] = [];
    const orig = repo.pushKb.bind(repo);
    repo.pushKb = async (e) => { captured.push(e); return orig(e); };
    // v1.11 — ops is a backend dept and no longer writes to the KB at all;
    // use mkt (frontend) to exercise the enrichment defaults instead.
    await runAgent(
      { dept: 'mkt', run: async () => ({ markdown: '# r\n## Highlight\nx\n## Flags\nNone.', summary: 's', feedMsg: 'f', artifacts: [], tags: [] }) },
      { repo, notify: async () => {} },
    );
    expect(captured[0].provenance).toBe('api');
    expect(captured[0].slug).toMatch(/^mkt-/);
    expect(captured[0].theme).toBeUndefined();
    expect(captured[0].sources).toEqual([]);
    expect(captured[0].related).toEqual([]);
  });

  it('splits a dual-generated report into markdown (TH) + markdownEn (EN)', async () => {
    const repo = makeRedisRepo(memClient());
    const captured: KbEntry[] = [];
    const orig = repo.pushKb.bind(repo);
    repo.pushKb = async (e) => { captured.push(e); return orig(e); };
    await runAgent(
      { dept: 'rnd', run: async () => ({
          markdown: 'รายงานไทย\n\n<!-- ===EN=== -->\n\nEnglish report\n\n## Highlight\nx\n## Flags\nNone.',
          summary: 's', feedMsg: 'f', artifacts: [], tags: [],
        }) },
      { repo, notify: async () => {} },
    );
    const e = captured[0];
    expect(e.markdown).toContain('รายงานไทย');
    expect(e.markdown).not.toContain('English report');
    expect(e.markdownEn).toContain('English report');
    expect(e.markdownEn).not.toContain('รายงานไทย');
    // Both documents keep the shared footer so highlight/flags parse on either.
    expect(e.markdown).toContain('## Highlight');
    expect(e.markdownEn).toContain('## Highlight');
  });

  it('backfills markdownEn from markdown for a single-language entry on read', async () => {
    const repo = makeRedisRepo(memClient());
    await repo.pushKb({
      id: 'x:1', slug: 'x-1', dept: 'fin', date: '2026-01-01', ts: '2026-01-01T00:00:00Z',
      category: 'market-brief', tags: [], status: 'published', summary: 's', highlight: '',
      flags: [], artifacts: [], sources: [], provenance: 'api', related: [],
      markdown: 'ไทยล้วน',
      // markdownEn intentionally omitted (pre-v1.4.1 shape)
    } as KbEntry);
    const got = await repo.getKbEntry('x:1');
    expect(got?.markdownEn).toBe('ไทยล้วน');
  });
});
