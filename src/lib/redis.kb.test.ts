import { describe, it, expect } from 'vitest';
import { normalizeKbEntry, deriveSlug, makeRedisRepo, type RedisClientLike } from './redis';
import { makeMemoryKbStore } from './kbDb';

describe('deriveSlug', () => {
  it('builds dept-theme-date slug', () => {
    expect(deriveSlug({ dept: 'fin', theme: 'US Index / S&P500', date: '2026-06-04' }))
      .toBe('fin-us-index-s-p500-2026-06-04');
  });
  it('falls back to category when no theme', () => {
    expect(deriveSlug({ dept: 'cyb', date: '2026-06-04', category: 'threat-intel' }))
      .toBe('cyb-threat-intel-2026-06-04');
  });
  it('falls back to category when theme slugifies to empty', () => {
    expect(deriveSlug({ dept: 'fin', theme: '---', date: '2026-06-04', category: 'market-brief' }))
      .toBe('fin-market-brief-2026-06-04');
  });
});

describe('normalizeKbEntry v2 backfill', () => {
  it('backfills new fields on a pre-v1.4 entry', () => {
    const e = normalizeKbEntry({ dept: 'fin', ts: '2026-05-01T10:00:00Z' });
    expect(e.provenance).toBe('api');
    expect(e.related).toEqual([]);
    expect(e.sources).toEqual([]);
    expect(e.slug).toBe('fin-market-brief-2026-05-01');
    expect(e.status).toBe('published');
  });
});

describe('normalizeKbEntry — bilingual backfill', () => {
  it('backfills highlightEn/flagsEn from the single-language fields', () => {
    const e = normalizeKbEntry({
      dept: 'fin', ts: '2026-06-10T00:00:00Z',
      highlight: 'สรุปไทย', flags: ['ก', 'ข'],
    });
    expect(e.highlightEn).toBe('สรุปไทย');
    expect(e.flagsEn).toEqual(['ก', 'ข']);
  });

  it('keeps explicit English fields when present', () => {
    const e = normalizeKbEntry({
      dept: 'fin', ts: '2026-06-10T00:00:00Z',
      highlight: 'ไทย', highlightEn: 'EN', flags: ['ก'], flagsEn: ['en'],
    });
    expect(e.highlightEn).toBe('EN');
    expect(e.flagsEn).toEqual(['en']);
  });
});

const noopClient = {
  async set() { return 'OK'; }, async get() { return null; }, async del() { return 0; },
  async mget(ks: string[]) { return ks.map(() => null); },
  async lpush() { return 1; }, async lrem() { return 0; },
  async ltrim() { return 'OK'; }, async lrange() { return []; },
} as unknown as RedisClientLike;

describe('repo KB delegation', () => {
  it('pushKb/listKb/updateKbEntry go through the injected KbStore', async () => {
    const kb = makeMemoryKbStore();
    const repo = makeRedisRepo(noopClient, kb);
    await repo.pushKb({
      id: 'fin:t', slug: 'fin-market-brief-2026-07-14', dept: 'fin', date: '2026-07-14',
      ts: '2026-07-14T11:00:00.000Z', category: 'market-brief', tags: [], status: 'draft',
      summary: 's', highlight: 'h', flags: [], artifacts: [], sources: [],
      provenance: 'api', related: [], markdown: 'm',
    });
    expect(await kb.getKbEntry('fin:t')).not.toBeNull();
    expect((await repo.listKb({ status: 'draft' }))).toHaveLength(1);
    expect((await repo.updateKbEntry('fin:t', { status: 'published' }))?.status).toBe('published');
  });
});
