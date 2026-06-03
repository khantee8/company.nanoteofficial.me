import { complete } from '@/lib/claude';
import { PERSONAS } from './personas';
import { formatContext } from './runner';
import { fetchTrending, type TrendingRepo } from '@/lib/sources/githubTrending';
import { normalizeTags, type Artifact } from './artifacts';
import type { AgentRunResult, AgentContext } from './types';

const short = (s: string, n = 28) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Research Radar — charts built deterministically from trending AI repos. */
export function rndArtifacts(repos: TrendingRepo[]): Artifact[] {
  if (repos.length === 0) return [];

  const arts: Artifact[] = [
    {
      kind: 'bars',
      title: 'trending repos (stars / 14d)',
      series: repos.slice(0, 6).map((r) => ({ label: short(r.name), value: r.stars })),
    },
  ];

  const byLang = new Map<string, number>();
  for (const r of repos) byLang.set(r.language, (byLang.get(r.language) ?? 0) + 1);
  arts.push({
    kind: 'donut',
    title: 'language mix',
    series: [...byLang.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })),
  });

  arts.push({
    kind: 'table',
    title: 'research radar',
    columns: ['repo', 'stars', 'lang'],
    rows: repos.slice(0, 8).map((r) => [r.name, r.stars, r.language]),
  });

  return arts;
}

export function rndTags(repos: TrendingRepo[]): string[] {
  return normalizeTags([...repos.map((r) => r.language), 'ai', 'agents', 'devtools']);
}

export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const repos = await fetchTrending().catch(() => []);
  const radar = repos
    .slice(0, 8)
    .map((r) => `${r.name} (${r.stars}★ ${r.language})`)
    .join('\n');

  const context = formatContext(ctx);
  const markdown = await complete({
    system: PERSONAS.rnd,
    prompt: `${context ? context + '\n\n---\n\n' : ''}${
      radar ? `Newly-trending AI/agent repos (last 14 days):\n${radar}\n\n` : ''
    }Research one current, concrete trend in AI agents or developer tooling from the last few weeks${
      radar ? ' — anchor it in the trending repos above where they fit' : ''
    }. Write a 150-220 word brief: what changed, why it matters, one implication for a small AI-product studio. Include a short "## Sources" list with the links you used.`,
    maxTokens: 1200,
    webSearch: true,
    maxSearches: 4,
  });

  return {
    markdown,
    summary: 'published a sourced trend brief',
    feedMsg: 'research brief ready 🔬',
    artifacts: rndArtifacts(repos),
    tags: rndTags(repos),
    meta: { repos },
  };
}
