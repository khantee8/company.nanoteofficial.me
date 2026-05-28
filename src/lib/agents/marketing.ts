import { complete } from '@/lib/claude';
import { PERSONAS, PROJECTS_BLURB } from './personas';
import type { AgentRunResult } from './types';

export async function run(): Promise<AgentRunResult> {
  const markdown = await complete({
    system: PERSONAS.mkt,
    prompt: `${PROJECTS_BLURB}\n\nDraft today's marketing output as markdown with three sections: "## X post" (<=280 chars), "## LinkedIn post" (2-3 short paragraphs), "## Blog idea" (title + one-line angle). Make it specific to the projects above, not generic.`,
    maxTokens: 900,
  });
  return { markdown, summary: 'drafted X + LinkedIn + blog idea', feedMsg: 'drafted social content ✓' };
}
