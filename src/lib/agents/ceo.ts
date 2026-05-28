import { complete } from '@/lib/claude';
import { PERSONAS } from './personas';
import { getRepo } from '@/lib/redis';
import type { AgentRunResult } from './types';
import type { DeptId } from '@/lib/data/departments';

const TEAM: DeptId[] = ['mkt', 'rnd', 'ops', 'fin'];

export async function run(): Promise<AgentRunResult> {
  const repo = getRepo();
  const outputs = await Promise.all(TEAM.map((d) => repo.getOutput(d)));
  const digest = TEAM.map((d, i) => `### ${d.toUpperCase()}\n${outputs[i]?.summary ?? 'no output today'}`).join('\n\n');

  const markdown = await complete({
    system: PERSONAS.ceo,
    prompt: `Your team's outputs today:\n\n${digest}\n\nWrite a short standup: "## Summary" (3-4 sentences) and "## Decisions" (2-3 bullets, concrete and actionable for tomorrow).`,
    maxTokens: 700,
  });
  return { markdown, summary: 'company standup + decisions', feedMsg: 'standup complete 📋' };
}
