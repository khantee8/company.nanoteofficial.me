import { complete } from '@/lib/claude';
import { PERSONAS, PROJECTS_BLURB } from './personas';
import { formatContext } from './runner';
import { fetchHN, type HNItem } from '@/lib/sources/hackernews';
import { fetchDevto, type DevtoItem } from '@/lib/sources/devto';
import { fetchReach, type ReachPoint } from '@/lib/sources/analytics';
import { normalizeTags, type Artifact } from './artifacts';
import type { AgentRunResult, AgentContext } from './types';

export interface MarketingData {
  hn: HNItem[];
  devto: DevtoItem[];
  reach: ReachPoint[];
}

const short = (s: string, n = 42) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Charts built deterministically from trend signals (demand) + owned reach. */
export function marketingArtifacts({ hn, devto, reach }: MarketingData): Artifact[] {
  const items = [
    ...hn.map((h) => ({ label: short(h.title), value: h.points + h.comments })),
    ...devto.map((d) => ({ label: short(d.title), value: d.reactions + d.comments })),
  ]
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);

  const arts: Artifact[] = [{ kind: 'bars', title: 'topic momentum (demand)', series: items }];

  if (reach.length > 0) {
    arts.push({ kind: 'line', title: 'site reach / 7d', points: reach.map((r) => ({ t: r.day, value: r.visits })) });
  }

  const topTopic = items[0]?.label ?? 'n/a';
  arts.push({
    kind: 'table', title: 'content plan', columns: ['channel', 'format', 'topic'],
    rows: [['X', 'post', topTopic], ['LinkedIn', 'post', topTopic], ['Blog', 'idea', topTopic]],
  });

  return arts;
}

export function marketingTags({ devto }: Pick<MarketingData, 'devto'>): string[] {
  return normalizeTags([...devto.flatMap((d) => d.tags), 'x', 'linkedin', 'blog']);
}

export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const [hn, devto, reach] = await Promise.all([
    fetchHN().catch(() => []),
    fetchDevto().catch(() => []),
    fetchReach().catch(() => []),
  ]);
  const data: MarketingData = { hn, devto, reach };

  const trending = [
    ...hn.map((h) => `${h.title} (${h.points}▲ ${h.comments}💬)`),
    ...devto.map((d) => `${d.title} (${d.reactions}♥ ${d.comments}💬)`),
  ].slice(0, 6);

  const context = formatContext(ctx);
  const markdown = await complete({
    system: PERSONAS.mkt,
    prompt: `${context ? context + '\n\n---\n\n' : ''}${PROJECTS_BLURB}\n\nTrending in our niche right now (real engagement):\n${trending.join('\n') || 'n/a'}\n\nDraft today's marketing output as markdown with three sections: "## X post" (<=280 chars), "## LinkedIn post" (2-3 short paragraphs), "## Blog idea" (title + one-line angle). Make it specific to the projects above, ride the trending topics where they fit, and reference today's company activity where available — not generic.`,
    maxTokens: 900,
  });

  return {
    markdown,
    summary: 'drafted X + LinkedIn + blog idea',
    feedMsg: 'drafted social content ✓',
    artifacts: marketingArtifacts(data),
    tags: marketingTags(data),
    meta: { hn, devto, reach },
  };
}
