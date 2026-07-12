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

  // v1.12.1 relax: when the SEC/MCP source is down, web research rarely yields all
  // three numbers — a cited fund with SOME numbers is still a usable finding
  // (2026-07-10: the all-three rule zeroed the whole run and nothing published).
  it('keeps a cited fund when some numeric fields are missing (normalized to null)', () => {
    const md = '```json findings\n' + JSON.stringify({ theme: 'x', funds: [
      { name: 'C', amc: 'Z', ter: null, aum: 1, masterFund: 'M', return1y: 1, hedged: false, taxType: 'none', citation: cite },
    ] }) + '\n```';
    const funds = parseFinanceFindings(md)?.funds;
    expect(funds).toHaveLength(1);
    expect(funds?.[0].ter).toBeNull();
    expect(funds?.[0].aum).toBe(1);
  });

  it('keeps a cited fund with only one finite number', () => {
    const md = '```json findings\n' + JSON.stringify({ theme: 'x', funds: [
      { name: 'D', amc: 'Z', ter: 0.59, masterFund: 'M', hedged: false, taxType: 'rmf', citation: cite },
    ] }) + '\n```';
    const funds = parseFinanceFindings(md)?.funds;
    expect(funds).toHaveLength(1);
    expect(funds?.[0].ter).toBe(0.59);
    expect(funds?.[0].aum).toBeNull();
    expect(funds?.[0].return1y).toBeNull();
  });

  it('drops a cited fund with zero finite numbers', () => {
    const md = '```json findings\n' + JSON.stringify({ theme: 'x', funds: [
      { name: 'E', amc: 'Z', ter: 'N/A', aum: null, masterFund: 'M', hedged: false, taxType: 'none', citation: cite },
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
