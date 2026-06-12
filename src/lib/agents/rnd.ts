import { completeRaw } from '@/lib/claude';
import { PERSONAS } from './personas';
import { formatContext } from './runner';
import { fetchTrending, type TrendingRepo } from '@/lib/sources/githubTrending';
import { normalizeTags, withProvenance, type Artifact, type Citation } from './artifacts';
import { extractFindingsBlock, hasCitation } from './findings';
import type { AgentRunResult, AgentContext } from './types';

const short = (s: string, n = 28) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

// ─── Theme rotation ──────────────────────────────────────────────────────────

const THEME_BY_DOW: Record<number, { theme: string; label: string }> = {
  2: { theme: 'agents',    label: 'AI agents' },
  4: { theme: 'llm-infra', label: 'LLM infrastructure' },
};

export function themeForToday(d = new Date()): { theme: string; label: string } {
  return THEME_BY_DOW[d.getUTCDay()] ?? THEME_BY_DOW[2];
}

// ─── Findings types + parser ──────────────────────────────────────────────────

export interface RndFinding {
  name: string;
  kind: 'repo' | 'paper' | 'release';
  why: string;
  lang?: string;
  citation: Citation;
}

export interface RndFindings {
  theme: string;
  items: RndFinding[];
}

export function parseRndFindings(markdown: string): RndFindings | null {
  const raw = extractFindingsBlock<Partial<RndFindings>>(markdown);
  if (!raw) return null;
  if (!Array.isArray(raw.items)) return { theme: String(raw.theme ?? ''), items: [] };
  const items = raw.items.filter(
    (x): x is RndFinding =>
      !!x &&
      typeof x.name === 'string' &&
      typeof x.kind === 'string' &&
      ['repo', 'paper', 'release'].includes(x.kind) &&
      hasCitation(x as { citation?: Partial<Citation> }),
  );
  return { theme: String(raw.theme ?? ''), items };
}

// ─── Artifact builders ────────────────────────────────────────────────────────

/** Research Radar — charts built deterministically from trending AI repos.
 *  All artifacts are tagged provenance: 'api'. */
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

  return arts.map((a) => withProvenance(a, 'api'));
}

/** A web-cited research radar table from validated findings. */
export function rndResearchArtifacts(f: RndFindings): Artifact[] {
  if (f.items.length === 0) return [];
  const sources = f.items.map((x) => x.citation);
  return [
    withProvenance(
      {
        kind: 'table',
        title: 'research radar (cited)',
        columns: ['item', 'type', 'lang', 'why'],
        rows: f.items.map((x) => [x.name, x.kind, x.lang ?? '—', x.why]),
      },
      'web',
      sources,
    ),
  ];
}

export function rndTags(repos: TrendingRepo[]): string[] {
  return normalizeTags([...repos.map((r) => r.language), 'ai', 'agents', 'devtools']);
}

// ─── Agent run ────────────────────────────────────────────────────────────────

export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const { theme, label } = themeForToday();
  const repos = await fetchTrending().catch(() => []);
  const radar = repos
    .slice(0, 8)
    .map((r) => `${r.name} (${r.stars}★ ${r.language})`)
    .join('\n');

  const context = formatContext(ctx);
  const { text: markdown, stopReason } = await completeRaw({
    system: PERSONAS.rnd,
    prompt: `${context ? context + '\n\n---\n\n' : ''}โฟกัสประจำรอบวันนี้: **${label}** (theme: ${theme}).\n${
      radar ? `Repo ที่กำลังมาแรง (14 วัน):\n${radar}\n\n` : ''
    }ค้นหา repo/paper/release จริงในโฟกัสนี้ สรุปว่าอะไรน่ารับมาใช้และเพราะอะไร อ้างอิงแหล่ง+วันที่ แล้วแนบบล็อก \`\`\`json findings ตามสคีมาในบทบาทของคุณ`,
    webSearch: true,
    maxSearches: 5,
    maxTokens: 4000,
  });

  const findings = parseRndFindings(markdown) ?? { theme, items: [] };
  const artifacts = [...rndArtifacts(repos), ...rndResearchArtifacts(findings)];
  const sources = findings.items.map((x) => x.citation);

  return {
    markdown,
    summary: `${findings.items.length} รายการในโฟกัส ${label}`,
    feedMsg: `research: ${label} — ${findings.items.length} items 🔬`,
    artifacts,
    tags: normalizeTags([theme, ...rndTags(repos)]),
    theme,
    provenance: findings.items.length > 0 ? 'web' : 'api',
    sources,
    incomplete: stopReason === 'max_tokens',
    meta: { theme, repos, items: findings.items.length, stopReason },
  };
}
