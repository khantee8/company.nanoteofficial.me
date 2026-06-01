import { complete } from '@/lib/claude';
import { PERSONAS } from './personas';
import { formatContext } from './runner';
import type { AgentRunResult, AgentContext } from './types';

export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const context = formatContext(ctx);
  const markdown = await complete({
    system: PERSONAS.ceo,
    prompt: `${context ? context + '\n\n---\n\n' : ''}Write a short standup: "## Summary" (3-4 sentences synthesizing today's company activity and how it connects to recent days) and "## Decisions" (2-3 bullets, concrete and actionable for tomorrow, referencing specific department outputs).`,
    maxTokens: 900,
  });
  return { markdown, summary: 'company standup + decisions', feedMsg: 'standup complete 📋' };
}
