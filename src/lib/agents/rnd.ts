import { complete } from '@/lib/claude';
import { PERSONAS } from './personas';
import { formatContext } from './runner';
import type { AgentRunResult, AgentContext } from './types';

export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const context = formatContext(ctx);
  const markdown = await complete({
    system: PERSONAS.rnd,
    prompt: `${context ? context + '\n\n---\n\n' : ''}Research one current, concrete trend in AI agents or developer tooling from the last few weeks. Write a 150-220 word brief: what changed, why it matters, one implication for a small AI-product studio. Include a short "## Sources" list with the links you used.`,
    maxTokens: 1200,
    webSearch: true,
    maxSearches: 4,
  });
  return { markdown, summary: 'published a sourced trend brief', feedMsg: 'research brief ready 🔬' };
}
