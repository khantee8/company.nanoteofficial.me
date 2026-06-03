import { describe, it, expect } from 'vitest';
import { financeArtifacts, financeTags } from './finance';
import type { CoinGeckoResponse } from '@/lib/sources/coingecko';

const raw: CoinGeckoResponse = {
  bitcoin: { usd: 71240, usd_24h_change: 2.1 },
  ethereum: { usd: 3820, usd_24h_change: -1.3 },
  solana: { usd: 182, usd_24h_change: 4.5 },
};

describe('financeArtifacts', () => {
  it('builds diverging 24h bars with values = % change', () => {
    const bars = financeArtifacts(raw).find((a) => a.kind === 'divergingBars');
    expect(bars).toBeTruthy();
    if (bars && bars.kind === 'divergingBars') {
      expect(bars.series.map((s) => s.label)).toEqual(['BTC', 'ETH', 'SOL']);
      expect(bars.series.map((s) => s.value)).toEqual([2.1, -1.3, 4.5]);
      expect(bars.unit).toBe('%');
    }
  });

  it('builds a breadth donut with up/down counts', () => {
    const donut = financeArtifacts(raw).find((a) => a.kind === 'donut');
    if (donut && donut.kind === 'donut') {
      expect(donut.series.map((s) => [s.label, s.value])).toEqual([['up', 2], ['down', 1]]);
    } else {
      throw new Error('no donut');
    }
  });

  it('builds a price table keyed by symbol', () => {
    const table = financeArtifacts(raw).find((a) => a.kind === 'table');
    if (table && table.kind === 'table') {
      expect(table.columns).toEqual(['asset', 'price', '24h %']);
      expect(table.rows[0][0]).toBe('BTC');
      expect(table.rows).toHaveLength(3);
    } else {
      throw new Error('no table');
    }
  });

  it('survives an empty response', () => {
    expect(() => financeArtifacts({})).not.toThrow();
  });
});

describe('financeTags', () => {
  it('returns lowercased tickers', () => {
    expect(financeTags(raw)).toEqual(['btc', 'eth', 'sol']);
  });
});
