import { complete } from '@/lib/claude';
import { PERSONAS } from './personas';
import { formatContext } from './runner';
import { fetchPrices, formatPrices } from '@/lib/sources/coingecko';
import type { AgentRunResult, AgentContext } from './types';

export function briefSummary(lines: string[]): string {
  const up = lines.filter((l) => l.includes('▲')).length;
  const down = lines.filter((l) => l.includes('▼')).length;
  return `${lines.length} assets tracked · net ${up} up / ${down} down`;
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
  return { markdown, summary: briefSummary(lines), feedMsg: `market: ${lines[0] ?? 'n/a'}`, meta: { lines } };
}
