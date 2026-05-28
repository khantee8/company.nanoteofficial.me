import { describe, it, expect } from 'vitest';
import { formatPrices, type CoinGeckoResponse } from './coingecko';

describe('coingecko formatPrices', () => {
  it('formats prices with 24h change and direction arrows', () => {
    const raw: CoinGeckoResponse = {
      bitcoin: { usd: 68000, usd_24h_change: 2.51 },
      ethereum: { usd: 3500, usd_24h_change: -1.2 },
    };
    const lines = formatPrices(raw);
    expect(lines).toContain('BTC $68,000.00 ▲ +2.51%');
    expect(lines).toContain('ETH $3,500.00 ▼ -1.20%');
  });

  it('handles missing change as flat', () => {
    const raw: CoinGeckoResponse = { bitcoin: { usd: 1, usd_24h_change: 0 } };
    expect(formatPrices(raw)).toContain('BTC $1.00 ▬ 0.00%');
  });
});
