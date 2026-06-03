import { complete } from '@/lib/claude';
import { PERSONAS } from './personas';
import { formatContext } from './runner';
import { fetchDeployments, formatDeployments, type DeployState } from '@/lib/sources/vercelApi';
import { fetchActivity, formatActivity, type RepoActivity } from '@/lib/sources/githubApi';
import { normalizeTags, type Artifact } from './artifacts';
import type { AgentRunResult, AgentContext } from './types';

const shortProject = (p: string) => p.replace('.nanoteofficial.me', '').replace('nanoteofficial.me', 'portfolio');

/** Ops charts built deterministically from CI/CD state — no LLM involvement. */
export function opsArtifacts(deploys: DeployState[], activity: RepoActivity[]): Artifact[] {
  const arts: Artifact[] = [];

  if (deploys.length > 0) {
    arts.push({
      kind: 'scorecard',
      title: 'deployment health',
      tiles: deploys.map((d) => ({
        label: shortProject(d.project),
        state: d.ok ? 'ok' : /build|queue|init/i.test(d.state) ? 'warn' : 'down',
      })),
    });
  }

  if (activity.length > 0) {
    arts.push({
      kind: 'table',
      title: 'repo activity',
      columns: ['repo', 'last commit', 'ci'],
      rows: activity.map((a) => [a.repo.split('/')[1] ?? a.repo, a.lastCommit ?? '—', a.lastCi ?? 'n/a']),
    });
  }

  return arts;
}

export function opsTags(deploys: DeployState[], activity: RepoActivity[]): string[] {
  const ci = activity.map((a) => a.lastCi).filter((c): c is string => !!c);
  return normalizeTags(['ci-cd', 'vercel', 'deploy', ...ci]);
}

export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const [deploys, activity] = await Promise.all([
    fetchDeployments().catch(() => []),
    fetchActivity().catch(() => []),
  ]);
  const deployLines = formatDeployments(deploys);
  const activityLines = formatActivity(activity);
  const allOk = deploys.length > 0 && deploys.every((d) => d.ok);
  const context = formatContext(ctx);

  const markdown = await complete({
    system: PERSONAS.ops,
    prompt: `${context ? context + '\n\n---\n\n' : ''}CI/CD snapshot.\n\nDeployments:\n${deployLines.join('\n') || 'none'}\n\nRepo activity:\n${activityLines.join('\n') || 'none'}\n\nWrite a terse ops status (80-140 words): overall health, anything failing or stale, and the single most useful next action. Use a status emoji header.`,
    maxTokens: 800,
  });
  return {
    markdown,
    summary: allOk ? 'all deployments healthy' : 'deploy attention needed',
    feedMsg: allOk ? 'all systems green 🚀' : 'deploy issue flagged ⚠',
    artifacts: opsArtifacts(deploys, activity),
    tags: opsTags(deploys, activity),
    meta: { deploys, activity },
  };
}
