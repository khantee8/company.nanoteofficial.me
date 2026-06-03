import { complete } from '@/lib/claude';
import { PERSONAS } from './personas';
import { formatContext } from './runner';
import { fetchPrices, formatPrices, SYMBOL, type CoinGeckoResponse } from '@/lib/sources/coingecko';
import { normalizeTags, type Artifact } from './artifacts';
import type { AgentRunResult, AgentContext } from './types';

export function briefSummary(lines: string[]): string {
  const up = lines.filter((l) => l.includes('▲')).length;
  const down = lines.filter((l) => l.includes('▼')).length;
  return `${lines.length} assets tracked · net ${up} up / ${down} down`;
}

const sym = (id: string) => SYMBOL[id] ?? id.toUpperCase();
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Charts built deterministically from the CoinGecko snapshot. */
export function financeArtifacts(raw: CoinGeckoResponse): Artifact[] {
  const entries = Object.entries(raw);
  const up = entries.filter(([, v]) => v.usd_24h_change > 0).length;
  const down = entries.filter(([, v]) => v.usd_24h_change < 0).length;
  return [
    {
      kind: 'divergingBars', title: '24h moves', unit: '%',
      series: entries.map(([id, v]) => ({ label: sym(id), value: round2(v.usd_24h_change) })),
    },
    {
      kind: 'donut', title: 'market breadth',
      series: [
        { label: 'up', value: up, color: '#3ddc97' },
        { label: 'down', value: down, color: '#ff6b86' },
      ],
    },
    {
      kind: 'table', title: 'prices', columns: ['asset', 'price', '24h %'],
      rows: entries.map(([id, v]) => [sym(id), `$${v.usd.toLocaleString('en-US')}`, round2(v.usd_24h_change)]),
    },
  ];
}

export function financeTags(raw: CoinGeckoResponse): string[] {
  return normalizeTags(Object.keys(raw).map(sym));
}

export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const prices = await fetchPrices();
  const lines = formatPrices(prices);
  const context = formatContext(ctx);
  const markdown = await complete({
    system: PERSONAS.fin,
    prompt: `${context ? context + '\n\n---\n\n' : ''}Today's market snapshot:\n${lines.join('\n')}\n\nWrite a brief (120-180 words) informational finance note: what moved, any notable divergence, and a one-line outlook. End with a disclaimer that this is not financial advice.`,
    maxTokens: 900,
  });
  return {
    markdown, summary: briefSummary(lines), feedMsg: `market: ${lines[0] ?? 'n/a'}`,
    artifacts: financeArtifacts(prices), tags: financeTags(prices), meta: { lines },
  };
}
