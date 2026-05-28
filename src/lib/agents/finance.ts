import { complete } from '@/lib/claude';
import { PERSONAS } from './personas';
import { fetchPrices, formatPrices } from '@/lib/sources/coingecko';
import type { AgentRunResult } from './types';

export function briefSummary(lines: string[]): string {
  const up = lines.filter((l) => l.includes('▲')).length;
  const down = lines.filter((l) => l.includes('▼')).length;
  return `${lines.length} assets tracked · net ${up} up / ${down} down`;
}

export async function run(): Promise<AgentRunResult> {
  const prices = await fetchPrices();
  const lines = formatPrices(prices);
  const markdown = await complete({
    system: PERSONAS.fin,
    prompt: `Today's market snapshot:\n${lines.join('\n')}\n\nWrite a brief (120-180 words) informational finance note: what moved, any notable divergence, and a one-line outlook. End with a disclaimer that this is not financial advice.`,
    maxTokens: 700,
  });
  return { markdown, summary: briefSummary(lines), feedMsg: `market: ${lines[0] ?? 'n/a'}`, meta: { lines } };
}
