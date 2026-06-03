import { describe, it, expect } from 'vitest';
import { CATEGORY_BY_DEPT, normalizeTags } from './artifacts';
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
