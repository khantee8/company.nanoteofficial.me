import { completeRaw, applyOverrides, WEB_REPORT_MAX_TOKENS, type CompleteOpts, type CompleteResult } from '@/lib/claude';
import { PERSONAS } from './personas';
import { formatContext } from './runner';
import { fetchKev, fetchSecurityNews, formatThreatIntel, type KevEntry, type NewsItem } from '@/lib/sources/threatintel';
import { extractFindingsBlock, hasCitation } from './findings';
import { normalizeTags, withProvenance, type Artifact, type Citation } from './artifacts';
import type { AgentRunResult, AgentContext } from './types';

export function briefSummary(kev: KevEntry[]): string {
  const top = kev[0]?.cveId ?? 'n/a';
  return `${kev.length} newly-exploited CVEs · top: ${top}`;
}

// The KEV feed carries no CVSS, so severity is a COARSE, deterministic bucket
// from a keyword scan of the vuln name/description — never a fabricated score.
const HIGH_SEVERITY = /(remote code execution|\brce\b|privilege|authentication bypass|auth bypass|arbitrary code|ransomware|wormable|unauthenticated)/i;
const isHigh = (k: KevEntry) => HIGH_SEVERITY.test(`${k.vulnerabilityName} ${k.shortDescription}`);

/** Charts built deterministically from the CISA KEV feed. */
export function cyberxArtifacts(kev: KevEntry[]): Artifact[] {
  const high = kev.filter(isHigh).length;
  const medium = kev.length - high;

  // New-exploited-per-day: count by dateAdded, ascending, last 7 days present.
  const byDate = new Map<string, number>();
  for (const k of kev) byDate.set(k.dateAdded, (byDate.get(k.dateAdded) ?? 0) + 1);
  const points = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-7)
    .map(([d, n]) => ({ t: d.slice(5), value: n }));

  const charts: Artifact[] = [
    {
      kind: 'donut', title: 'severity',
      series: [
        { label: 'high', value: high, color: '#ff5470' },
        { label: 'medium', value: medium, color: '#ffaa00' },
      ],
    },
    { kind: 'line', title: 'new exploited / day', points },
    {
      kind: 'table', title: 'newly exploited CVEs', columns: ['CVE', 'product', 'added'],
      rows: kev.map((k) => [k.cveId, `${k.vendorProject} ${k.product}`, k.dateAdded]),
    },
  ];
  return charts.map((a) => withProvenance(a, 'api'));
}

export function cyberxTags(kev: KevEntry[]): string[] {
  return normalizeTags(kev.flatMap((k) => [k.cveId, k.vendorProject]));
}

export interface CyberxFinding {
  cve: string; severity: 'critical' | 'high' | 'medium' | 'low'; kev: boolean;
  summary: string; mitigation: string; citation: Citation;
}
export interface CyberxFindings { items: CyberxFinding[] }

export function parseCyberxFindings(markdown: string): CyberxFindings | null {
  const raw = extractFindingsBlock<Partial<CyberxFindings>>(markdown);
  if (!raw) return null;
  if (!Array.isArray(raw.items)) return { items: [] };
  const items = raw.items.filter(
    (x): x is CyberxFinding =>
      !!x &&
      typeof x.cve === 'string' &&
      typeof x.severity === 'string' &&
      ['critical', 'high', 'medium', 'low'].includes(x.severity) &&
      hasCitation(x as { citation?: Partial<Citation> }),
  );
  return { items };
}

/** A web·cited advisory table from researched findings. */
export function cyberxAdvisoryArtifacts(f: CyberxFindings): Artifact[] {
  if (f.items.length === 0) return [];
  const sources = f.items.map((x) => x.citation);
  return [
    withProvenance({
      kind: 'table', title: 'advisories (researched)',
      columns: ['CVE', 'severity', 'KEV', 'mitigation'],
      rows: f.items.map((x) => [x.cve, x.severity, x.kev ? 'yes' : 'no', x.mitigation]),
    }, 'web', sources),
  ];
}

export interface CyberxMeta { kev: KevEntry[]; news: NewsItem[] }

/** Everything before the completeRaw call: fetch the KEV feed + security news,
 *  format context, build the prompt, and apply operator overrides. */
export async function prepare(ctx: AgentContext): Promise<{ opts: CompleteOpts; meta: CyberxMeta }> {
  const [kev, news] = await Promise.all([fetchKev(), fetchSecurityNews()]);
  const lines = formatThreatIntel(kev, news);
  const context = formatContext(ctx);
  const opts = applyOverrides({
    system: PERSONAS.cyb,
    prompt: `${context ? context + '\n\n---\n\n' : ''}Today's threat feed:\n${lines.join('\n')}\n\nวิเคราะห์ภัยคุกคามจริงในรอบ 24-48 ชม.ที่เกี่ยวกับสแตกของบริษัท ค้นเว็บหา advisory/รายละเอียดเพิ่มเติม อ้างอิงแหล่ง+วันที่ เปิดรายงานด้วยบล็อก \`\`\`json findings ตามสคีมาในบทบาทของคุณ`,
    webSearch: true,
    maxSearches: 5,
    maxTokens: WEB_REPORT_MAX_TOKENS,
  }, ctx);
  return { opts, meta: { kev, news } };
}

/** Everything after the completeRaw call: parse findings, build artifacts,
 *  compute incomplete, and assemble the run result. Pure/synchronous. */
export function finalize(_ctx: AgentContext, meta: CyberxMeta, out: CompleteResult): AgentRunResult {
  const { kev, news } = meta;
  const { text: markdown, stopReason, usage, model } = out;
  const findings = parseCyberxFindings(markdown) ?? { items: [] };
  const artifacts = [...cyberxArtifacts(kev), ...cyberxAdvisoryArtifacts(findings)];
  const sources = findings.items.map((x) => x.citation);
  return {
    markdown,
    summary: briefSummary(kev),
    feedMsg: `threat: ${news[0]?.title ?? kev[0]?.cveId ?? 'n/a'}`,
    artifacts,
    tags: cyberxTags(kev),
    provenance: findings.items.length > 0 ? 'web' : 'api',
    sources,
    incomplete: stopReason === 'max_tokens',
    usage, model,
    meta: { kev, news, advisories: findings.items.length, stopReason },
  };
}

export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const { opts, meta } = await prepare(ctx);
  const out = await completeRaw(opts);
  return finalize(ctx, meta, out);
}
