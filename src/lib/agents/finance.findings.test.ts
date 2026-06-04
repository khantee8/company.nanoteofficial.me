import { describe, it, expect } from 'vitest';
import { parseFinanceFindings } from './finance';

const cite = { url: 'https://e.com', title: 'Fact Sheet', date: '2026-06-01' };

describe('parseFinanceFindings', () => {
  it('keeps funds with a valid citation', () => {
    const md = '```json findings\n' + JSON.stringify({ theme: 'us-index-sp500', funds: [
      { name: 'A', amc: 'X', ter: 0.3, aum: 1000, masterFund: 'M', return1y: 18, hedged: false, taxType: 'none', citation: cite },
    ] }) + '\n```';
    const f = parseFinanceFindings(md);
    expect(f?.theme).toBe('us-index-sp500');
    expect(f?.funds).toHaveLength(1);
  });

  it('drops a fund missing its citation', () => {
    const md = '```json findings\n' + JSON.stringify({ theme: 'x', funds: [
      { name: 'B', amc: 'Y', ter: 1, aum: 1, masterFund: 'M', return1y: 1, hedged: false, taxType: 'none' },
    ] }) + '\n```';
    expect(parseFinanceFindings(md)?.funds).toHaveLength(0);
  });

  it('drops a fund with a non-finite numeric field', () => {
    const md = '```json findings\n' + JSON.stringify({ theme: 'x', funds: [
      { name: 'C', amc: 'Z', ter: null, aum: 1, masterFund: 'M', return1y: 1, hedged: false, taxType: 'none', citation: { url: 'https://e.com', title: 't', date: '2026-06-01' } },
    ] }) + '\n```';
    expect(parseFinanceFindings(md)?.funds).toHaveLength(0);
  });

  it('returns empty funds when the funds field is not an array', () => {
    const md = '```json findings\n' + JSON.stringify({ theme: 'x', funds: 'oops' }) + '\n```';
    expect(parseFinanceFindings(md)).toEqual({ theme: 'x', funds: [] });
  });

  it('returns null when no findings block', () => {
    expect(parseFinanceFindings('no block here')).toBeNull();
  });
});
