import { complete } from '@/lib/claude';
import { PERSONAS } from './personas';
import { fetchDeployments, formatDeployments } from '@/lib/sources/vercelApi';
import { fetchActivity, formatActivity } from '@/lib/sources/githubApi';
import type { AgentRunResult } from './types';

export async function run(): Promise<AgentRunResult> {
  const [deploys, activity] = await Promise.all([
    fetchDeployments().catch(() => []),
    fetchActivity().catch(() => []),
  ]);
  const deployLines = formatDeployments(deploys);
  const activityLines = formatActivity(activity);
  const allOk = deploys.length > 0 && deploys.every((d) => d.ok);

  const markdown = await complete({
    system: PERSONAS.ops,
    prompt: `CI/CD snapshot.\n\nDeployments:\n${deployLines.join('\n') || 'none'}\n\nRepo activity:\n${activityLines.join('\n') || 'none'}\n\nWrite a terse ops status (80-140 words): overall health, anything failing or stale, and the single most useful next action. Use a status emoji header.`,
    maxTokens: 600,
  });
  return {
    markdown,
    summary: allOk ? 'all deployments healthy' : 'deploy attention needed',
    feedMsg: allOk ? 'all systems green 🚀' : 'deploy issue flagged ⚠',
    meta: { deploys, activity },
  };
}
