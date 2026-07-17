import { describe, it, expect, vi } from 'vitest';
import { rowToKbEntry, entryToParams, buildKbWhere, KB_COLUMNS, makeMemoryKbStore } from './kbDb';
import type { KbEntry } from './agents/types';

export const ENTRY: KbEntry = {
  id: 'fin:2026-07-14T11:00:00.000Z', slug: 'fin-thai-tax-funds-2026-07-14',
  dept: 'fin', date: '2026-07-14', ts: '2026-07-14T11:00:00.000Z',
  category: 'market-brief', theme: 'thai-tax-funds', tags: ['scbam'],
  status: 'published', pinned: false, summary: 'ส', highlight: 'ห', highlightEn: 'h',
  flags: ['f1'], flagsEn: ['f1e'], artifacts: [], sources: [{ url: 'https://e.com', title: 't', date: '2026-07-14' }],
  provenance: 'web', related: ['cyb:2026-07-14T10:00:00.000Z'],
  markdown: 'ไทย', markdownEn: 'en', incomplete: false,
};

describe('row mapping', () => {
  it('round-trips an entry through params → row → entry', () => {
    const params = entryToParams(ENTRY);
    expect(params[0]).toBe(ENTRY.id);
    // simulate a DB row (snake_case, Date objects, jsonb already parsed)
    const row = {
      id: ENTRY.id, slug: ENTRY.slug, dept: 'fin', date: new Date('2026-07-14'),
      ts: new Date(ENTRY.ts), category: 'market-brief', theme: 'thai-tax-funds',
      status: 'published', pinned: false, incomplete: false, provenance: 'web',
      summary: 'ส', highlight: 'ห', highlight_en: 'h', flags: ['f1'], flags_en: ['f1e'],
      tags: ['scbam'], artifacts: [], sources: ENTRY.sources, related: ENTRY.related,
      markdown: 'ไทย', markdown_en: 'en',
    };
    expect(rowToKbEntry(row)).toEqual(ENTRY);
  });
});

describe('buildKbWhere', () => {
  it('builds parameterized clauses for dept/status/category/date range', () => {
    const { clauses, params } = buildKbWhere({ status: 'published', dept: 'fin', from: '2026-07-01', to: '2026-07-31' });
    expect(clauses).toEqual(['status = $1', 'dept = $2', 'date >= $3', 'date <= $4']);
    expect(params).toEqual(['published', 'fin', '2026-07-01', '2026-07-31']);
  });
  it('q produces a combined FTS-or-trigram clause with ONE param used twice', () => {
    const { clauses, params } = buildKbWhere({ q: 'ThaiESG' });
    expect(clauses).toHaveLength(1);
    expect(clauses[0]).toContain('websearch_to_tsquery');
    expect(clauses[0]).toContain('ILIKE');
    expect(params).toEqual(['ThaiESG', '%ThaiESG%']);
  });
  it('empty query builds nothing', () => {
    expect(buildKbWhere({})).toEqual({ clauses: [], params: [] });
  });
  it('KB_COLUMNS lists snake_case columns, no search vector', () => {
    expect(KB_COLUMNS).toContain('highlight_en');
    expect(KB_COLUMNS).not.toContain('search');
  });
});

describe('makeMemoryKbStore', () => {
  it('push → list newest-first with status filter; update patches; delete removes', async () => {
    const s = makeMemoryKbStore();
    await s.pushKb(ENTRY);
    await s.pushKb({ ...ENTRY, id: 'cyb:x', slug: 'cyb-threat-intel-2026-07-15', dept: 'cyb', date: '2026-07-15', ts: '2026-07-15T10:00:00.000Z', status: 'draft' });
    expect((await s.listKb({})).map((e) => e.id)).toEqual(['cyb:x', ENTRY.id]);
    expect(await s.listKb({ status: 'published' })).toHaveLength(1);
    expect((await s.getKbBySlug(ENTRY.slug))?.id).toBe(ENTRY.id);
    const patched = await s.updateKbEntry('cyb:x', { status: 'published' });
    expect(patched?.status).toBe('published');
    await s.deleteKbEntry('cyb:x');
    expect(await s.getKbEntry('cyb:x')).toBeNull();
  });
  it('listKb q matches substring across summary/highlight/markdown', async () => {
    const s = makeMemoryKbStore([ENTRY]);
    expect(await s.listKb({ q: 'ไทย' })).toHaveLength(1);
    expect(await s.listKb({ q: 'nope' })).toHaveLength(0);
  });
  it('listKb with no limit returns everything up to the 2000 safety cap (not truncated at 100)', async () => {
    const seed: KbEntry[] = [];
    for (let i = 0; i < 120; i++) {
      seed.push({
        ...ENTRY,
        id: `fin:${i}`,
        ts: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
      });
    }
    const s = makeMemoryKbStore(seed);
    expect(await s.listKb({})).toHaveLength(120);
  });

  it('getKbBySlug with duplicate slugs returns newest by ts', async () => {
    // Seed with entries out of insertion order to expose if it's just lucky
    const older = { ...ENTRY, id: 'fin:older', ts: '2026-07-14T09:00:00.000Z' };
    const newer = { ...ENTRY, id: 'fin:newer', ts: '2026-07-14T11:00:00.000Z' };
    const s = makeMemoryKbStore([newer, older]); // newer first, but older has a higher ts value... wait that's wrong
    // Actually: newer has ts=11:00, older has ts=09:00, so newer > older. Seed as [older, newer] to test sorting.
    const s2 = makeMemoryKbStore([older, newer]);
    const result = await s2.getKbBySlug(ENTRY.slug);
    expect(result?.id).toBe('fin:newer');
  });
});

describe('makeKbDbStore SQL', () => {
  it('pushKb issues an upsert with 22 params; listKb orders ts DESC with limit', async () => {
    const calls: { text: string; params?: unknown[] }[] = [];
    const fakeSql = Object.assign(
      async (text: string, params?: unknown[]) => { calls.push({ text, params }); return []; },
      { query: async (text: string, params?: unknown[]) => { calls.push({ text, params }); return []; } },
    );
    vi.doMock('@neondatabase/serverless', () => ({ neon: () => fakeSql }));
    process.env.DATABASE_URL = 'postgres://x';
    const { makeKbDbStore } = await import('./kbDb');
    const store = makeKbDbStore();
    await store.pushKb(ENTRY);
    await store.listKb({ status: 'published', limit: 5 });
    expect(calls[0].text).toContain('INSERT INTO kb_entry');
    expect(calls[0].text).toContain('ON CONFLICT (id) DO UPDATE');
    expect(calls[0].params).toHaveLength(22);
    expect(calls[1].text).toContain('ORDER BY ts DESC');
    expect(calls[1].text).toContain('LIMIT');
    vi.doUnmock('@neondatabase/serverless');
    delete process.env.DATABASE_URL;
  });

  it('upsert SET clause includes category and theme', async () => {
    const calls: { text: string; params?: unknown[] }[] = [];
    const fakeSql = Object.assign(
      async (text: string, params?: unknown[]) => { calls.push({ text, params }); return []; },
      { query: async (text: string, params?: unknown[]) => { calls.push({ text, params }); return []; } },
    );
    vi.doMock('@neondatabase/serverless', () => ({ neon: () => fakeSql }));
    process.env.DATABASE_URL = 'postgres://x';
    const { makeKbDbStore } = await import('./kbDb');
    const store = makeKbDbStore();
    await store.pushKb(ENTRY);
    expect(calls[0].text).toContain('category=EXCLUDED.category');
    expect(calls[0].text).toContain('theme=EXCLUDED.theme');
    vi.doUnmock('@neondatabase/serverless');
    delete process.env.DATABASE_URL;
  });

  it('listKb returns [] (and warns) when DATABASE_URL is unset', async () => {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    vi.resetModules();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { makeKbDbStore } = await import('./kbDb');
    const store = makeKbDbStore();
    const result = await store.listKb({});
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0][0]).toContain('[kbDb] read failed');
    warnSpy.mockRestore();
  });

  it('listKb with no limit uses a 2000 safety cap, not the old 100 default', async () => {
    const calls: { text: string; params?: unknown[] }[] = [];
    const fakeSql = Object.assign(
      async (text: string, params?: unknown[]) => { calls.push({ text, params }); return []; },
      { query: async (text: string, params?: unknown[]) => { calls.push({ text, params }); return []; } },
    );
    vi.doMock('@neondatabase/serverless', () => ({ neon: () => fakeSql }));
    process.env.DATABASE_URL = 'postgres://x';
    const { makeKbDbStore } = await import('./kbDb');
    const store = makeKbDbStore();
    await store.listKb({ status: 'published' });
    expect(calls[0].text).toContain('LIMIT 2000');
    vi.doUnmock('@neondatabase/serverless');
    delete process.env.DATABASE_URL;
  });
});
