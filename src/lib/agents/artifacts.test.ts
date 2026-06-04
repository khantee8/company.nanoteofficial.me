import { describe, it, expect } from 'vitest';
import { CATEGORY_BY_DEPT, normalizeTags, withProvenance, type Artifact } from './artifacts';
import { DEPARTMENTS } from '@/lib/data/departments';

describe('CATEGORY_BY_DEPT', () => {
  it('maps every department to a stable category', () => {
    for (const d of DEPARTMENTS) {
      expect(CATEGORY_BY_DEPT[d.id]).toBeTruthy();
    }
    expect(CATEGORY_BY_DEPT.fin).toBe('market-brief');
    expect(CATEGORY_BY_DEPT.cyb).toBe('threat-intel');
    expect(CATEGORY_BY_DEPT.ceo).toBe('exec-brief');
  });
});

describe('normalizeTags', () => {
  it('lowercases, trims, dedupes, and caps', () => {
    expect(normalizeTags([' BTC ', 'btc', 'ETH', '', 'Sol'])).toEqual(['btc', 'eth', 'sol']);
    expect(normalizeTags(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
  });
});

describe('withProvenance', () => {
  it('tags an artifact api by default with no sources', () => {
    const a: Artifact = { kind: 'bars', title: 't', series: [{ label: 'x', value: 1 }] };
    const out = withProvenance(a, 'api');
    expect(out.provenance).toBe('api');
    expect(out.sources).toEqual([]);
  });

  it('attaches web provenance with sources', () => {
    const a: Artifact = { kind: 'table', title: 't', columns: ['a'], rows: [['x']] };
    const out = withProvenance(a, 'web', [{ url: 'https://e.com', title: 'Fact Sheet', date: '2026-06-01' }]);
    expect(out.provenance).toBe('web');
    expect(out.sources?.[0].url).toBe('https://e.com');
    expect(a).not.toHaveProperty('provenance');
  });
});
