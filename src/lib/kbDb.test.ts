import { describe, it, expect } from 'vitest';
import { rowToKbEntry, entryToParams, buildKbWhere, KB_COLUMNS } from './kbDb';
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
