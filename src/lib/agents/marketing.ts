import { complete } from '@/lib/claude';
import { PERSONAS, PROJECTS_BLURB } from './personas';
import { formatContext } from './runner';
import type { AgentRunResult, AgentContext } from './types';

export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const context = formatContext(ctx);
  const markdown = await complete({
    system: PERSONAS.mkt,
    prompt: `${context ? context + '\n\n---\n\n' : ''}${PROJECTS_BLURB}\n\nDraft today's marketing output as markdown with three sections: "## X post" (<=280 chars), "## LinkedIn post" (2-3 short paragraphs), "## Blog idea" (title + one-line angle). Make it specific to the projects above and reference today's company activity where available — not generic.`,
    maxTokens: 900,
  });
  return { markdown, summary: 'drafted X + LinkedIn + blog idea', feedMsg: 'drafted social content ✓' };
}
