import { completeRaw, WEB_REPORT_MAX_TOKENS } from '@/lib/claude';
import { PERSONAS, PROJECTS_BLURB } from './personas';
import { formatContext } from './runner';
import { fetchHN, type HNItem } from '@/lib/sources/hackernews';
import { fetchDevto, type DevtoItem } from '@/lib/sources/devto';
import { fetchReach, type ReachPoint } from '@/lib/sources/analytics';
import { normalizeTags, withProvenance, type Artifact, type Citation } from './artifacts';
import { extractFindingsBlock, hasCitation } from './findings';
import type { AgentRunResult, AgentContext } from './types';

export interface MarketingData {
  hn: HNItem[];
  devto: DevtoItem[];
  reach: ReachPoint[];
}

export interface MarketingSignal {
  topic: string;
  source: 'hackernews' | 'devto' | 'web';
  score?: number;
  citation: Citation;
}

export interface MarketingPlanItem {
  channel: 'blog' | 'x' | 'linkedin';
  idea: string;
  tiedTo?: string;
}

export interface MarketingFindings {
  theme: string;
  signals: MarketingSignal[];
  plan: MarketingPlanItem[];
}

const SOURCES = ['hackernews', 'devto', 'web'];
const CHANNELS = ['blog', 'x', 'linkedin'];

export function parseMarketingFindings(markdown: string): MarketingFindings | null {
  const raw = extractFindingsBlock<Partial<MarketingFindings>>(markdown);
  if (!raw) return null;
  const signals = Array.isArray(raw.signals) ? raw.signals.filter(
    (s): s is MarketingSignal =>
      !!s && typeof s.topic === 'string' &&
      typeof s.source === 'string' && SOURCES.includes(s.source) &&
      (s.score === undefined || (typeof s.score === 'number' && Number.isFinite(s.score))) &&
      hasCitation(s as { citation?: Partial<Citation> }),
  ) : [];
  const plan = Array.isArray(raw.plan) ? raw.plan.filter(
    (p): p is MarketingPlanItem =>
      !!p && typeof p.channel === 'string' && CHANNELS.includes(p.channel) && typeof p.idea === 'string',
  ) : [];
  return { theme: String(raw.theme ?? 'dev-demand'), signals, plan };
}

/** Web·cited demand-signals table from researched findings. */
export function marketingSignalArtifacts(f: MarketingFindings): Artifact[] {
  if (f.signals.length === 0) return [];
  const sources = f.signals.map((s) => s.citation);
  return [
    withProvenance({
      kind: 'table', title: 'demand signals (researched)',
      columns: ['topic', 'source', 'score'],
      rows: f.signals.map((s) => [s.topic, s.source, s.score ?? '—']),
    }, 'web', sources),
  ];
}

/** Content-plan checklist (internal recommendation — api provenance). */
export function marketingPlanArtifacts(f: MarketingFindings): Artifact[] {
  if (f.plan.length === 0) return [];
  return [
    withProvenance({
      kind: 'checklist', title: 'content plan',
      items: f.plan.map((p) => ({ text: `${p.channel}: ${p.idea}${p.tiedTo ? ` → ${p.tiedTo}` : ''}`, done: false })),
    }, 'api'),
  ];
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

  return arts.map((a) => withProvenance(a, 'api'));
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
  const { text: markdown, stopReason, usage, model } = await completeRaw({
    system: PERSONAS.mkt,
    prompt: `${context ? context + '\n\n---\n\n' : ''}${PROJECTS_BLURB}\n\nกำลังเทรนด์จริงในวงการตอนนี้ (engagement จริง):\n${trending.join('\n') || 'n/a'}\n\nวิเคราะห์สัญญาณดีมานด์จริง ค้นเว็บเพิ่มเติมพร้อมอ้างอิงแหล่ง แล้วเสนอแผนคอนเทนต์ที่ผูกกับเทรนด์ ระบุ "## X post" / "## LinkedIn post" / "## Blog idea" และเปิดรายงานด้วยบล็อก \`\`\`json findings ตามสคีมาในบทบาทของคุณ`,
    webSearch: true,
    maxSearches: 4,
    maxTokens: WEB_REPORT_MAX_TOKENS,
  });
  const findings = parseMarketingFindings(markdown) ?? { theme: 'dev-demand', signals: [], plan: [] };
  const artifacts = [...marketingArtifacts(data), ...marketingSignalArtifacts(findings), ...marketingPlanArtifacts(findings)];
  const sources = findings.signals.map((s) => s.citation);
  return {
    markdown,
    summary: `${findings.signals.length} สัญญาณ · ${findings.plan.length} แผนคอนเทนต์`,
    feedMsg: 'drafted social content ✓',
    artifacts,
    tags: normalizeTags(['dev-demand', ...marketingTags(data)]),
    theme: 'dev-demand',
    provenance: findings.signals.length > 0 ? 'web' : 'api',
    sources,
    incomplete: stopReason === 'max_tokens',
    usage, model,
    meta: { hn, devto, reach, signals: findings.signals.length, plan: findings.plan.length, stopReason },
  };
}
