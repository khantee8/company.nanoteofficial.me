import { complete } from '@/lib/claude';
import { PERSONAS } from './personas';
import { formatContext } from './runner';
import { fetchKev, fetchSecurityNews, formatThreatIntel, type KevEntry } from '@/lib/sources/threatintel';
import type { AgentRunResult, AgentContext } from './types';

export function briefSummary(kev: KevEntry[]): string {
  const top = kev[0]?.cveId ?? 'n/a';
  return `${kev.length} newly-exploited CVEs · top: ${top}`;
}

export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const [kev, news] = await Promise.all([fetchKev(), fetchSecurityNews()]);
  const lines = formatThreatIntel(kev, news);
  const context = formatContext(ctx);
  const markdown = await complete({
    system: PERSONAS.cyb,
    prompt: `${context ? context + '\n\n---\n\n' : ''}Today's threat feed:\n${lines.join('\n')}\n\nWrite a brief (120-180 word) threat-intelligence note: what's newly exploited, relevance to a small web/cloud company, and a one-line risk posture. Include a Sources list.`,
    model: 'claude-haiku-4-5-20251001',
    maxTokens: 600,
  });
  return {
    markdown,
    summary: briefSummary(kev),
    feedMsg: `threat: ${news[0]?.title ?? kev[0]?.cveId ?? 'n/a'}`,
    meta: { kev, news },
  };
}
