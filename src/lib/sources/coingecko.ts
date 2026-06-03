const IDS = ['bitcoin', 'ethereum', 'solana'] as const;
export const SYMBOL: Record<string, string> = { bitcoin: 'BTC', ethereum: 'ETH', solana: 'SOL' };

export type CoinGeckoResponse = Record<string, { usd: number; usd_24h_change: number }>;

const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function formatPrices(raw: CoinGeckoResponse): string[] {
  return Object.entries(raw).map(([id, { usd, usd_24h_change: chg }]) => {
    const arrow = chg > 0 ? '▲' : chg < 0 ? '▼' : '▬';
    const sign = chg > 0 ? '+' : '';
    const pct = chg === 0 ? '0.00%' : `${sign}${chg.toFixed(2)}%`;
    return `${SYMBOL[id] ?? id.toUpperCase()} ${money(usd)} ${arrow} ${pct}`;
  });
}

export async function fetchPrices(): Promise<CoinGeckoResponse> {
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${IDS.join(',')}&vs_currencies=usd&include_24hr_change=true`;
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  return (await res.json()) as CoinGeckoResponse;
}
