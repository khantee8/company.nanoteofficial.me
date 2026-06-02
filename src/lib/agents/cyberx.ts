import { complete } from '@/lib/claude';
import { PERSONAS } from './personas';
import { formatContext } from './runner';
import type { AgentRunResult, AgentContext } from './types';

export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const context = formatContext(ctx);
  const markdown = await complete({
    system: PERSONAS.cyb,
    prompt: `${context ? context + '\n\n---\n\n' : ''}Write a short daily threat brief: "## Threat Summary" (2-3 newly-exploited or notable CVEs from CISA KEV or major security news, with relevance to a small web/cloud company) and "## Risk Posture" (one sentence) and "## Sources" (2-3 links).`,
    maxTokens: 900,
  });
  return { markdown, summary: 'daily threat brief', feedMsg: 'threat brief complete 🛡️' };
}
