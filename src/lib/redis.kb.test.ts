import { describe, it, expect } from 'vitest';
import { normalizeKbEntry, deriveSlug } from './redis';

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
