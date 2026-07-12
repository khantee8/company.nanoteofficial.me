import { describe, it, expect } from 'vitest';
import { financeArtifacts, type FinanceFindings } from './finance';

const f: FinanceFindings = { theme: 'us-index-sp500', funds: [
  { name: 'A', amc: 'X', ter: 0.3, aum: 1000, masterFund: 'iShares', return1y: 18.2, hedged: false, taxType: 'none', citation: { url: 'https://e.com', title: 't', date: '2026-06-01' } },
  { name: 'B', amc: 'Y', ter: 0.6, aum: 500, masterFund: 'Vanguard', return1y: 15.1, hedged: true, taxType: 'ssf', citation: { url: 'https://e2.com', title: 't2', date: '2026-06-02' } },
]};

describe('financeArtifacts', () => {
  it('builds web·cited charts from findings', () => {
    const a = financeArtifacts(f);
    // TER bars, 1Y diverging bars, comparison table, AUM bars (v1.4.5), tax donut (v1.4.5)
    expect(a).toHaveLength(5);
    expect(a.every((x) => x.provenance === 'web')).toBe(true);
    expect(a[0].sources?.[0].url).toBe('https://e.com');
    expect(a.some((x) => x.kind === 'bars' && /AUM/i.test(x.title))).toBe(true);
    expect(a.some((x) => x.kind === 'donut')).toBe(true);
  });
  it('maps every fund into the chart series and table rows', () => {
    const a = financeArtifacts(f);
    const bars = a[0];
    if (bars.kind !== 'bars') throw new Error('expected TER bars first');
    expect(bars.series).toHaveLength(2);
    const table = a.find((x) => x.kind === 'table');
    if (!table || table.kind !== 'table') throw new Error('no table');
    expect(table.rows).toHaveLength(2);
  });
  it('returns no artifacts when no funds (graceful empty)', () => {
    expect(financeArtifacts({ theme: 't', funds: [] })).toEqual([]);
  });

  // v1.12.1: funds may carry partial numbers (SEC/MCP down → web-only research).
  describe('partial-number funds', () => {
    const partial: FinanceFindings = { theme: 'thai-tax-funds', funds: [
      { name: 'C', amc: 'X', ter: null, aum: null, masterFund: 'ThaiESG bond', return1y: 9.82, hedged: false, taxType: 'thaiesg', citation: { url: 'https://e.com', title: 't', date: '2026-07-10' } },
      { name: 'D', amc: 'Y', ter: 0.59, aum: null, masterFund: 'S&P500', return1y: null, hedged: false, taxType: 'rmf', citation: { url: 'https://e2.com', title: 't2', date: '2026-07-10' } },
    ]};

    it('each numeric chart only includes funds with that number', () => {
      const a = financeArtifacts(partial);
      const ter = a.find((x) => x.kind === 'bars' && /TER/i.test(x.title));
      if (!ter || ter.kind !== 'bars') throw new Error('no TER chart');
      expect(ter.series).toEqual([{ label: 'D', value: 0.59 }]);
      const ret = a.find((x) => x.kind === 'divergingBars');
      if (!ret || ret.kind !== 'divergingBars') throw new Error('no 1Y chart');
      expect(ret.series).toEqual([{ label: 'C', value: 9.82 }]);
    });

    it('omits a chart entirely when no fund has that number', () => {
      const a = financeArtifacts(partial);
      expect(a.some((x) => x.kind === 'bars' && /AUM/i.test(x.title))).toBe(false);
    });

    it('table keeps every fund, with — for missing values', () => {
      const a = financeArtifacts(partial);
      const table = a.find((x) => x.kind === 'table');
      if (!table || table.kind !== 'table') throw new Error('no table');
      expect(table.rows).toHaveLength(2);
      expect(table.rows[0]).toContain('—');
      expect(table.rows[1]).toContain(0.59);
    });
  });
});
