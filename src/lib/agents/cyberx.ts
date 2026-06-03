import { complete } from '@/lib/claude';
import { PERSONAS } from './personas';
import { formatContext } from './runner';
import { fetchKev, fetchSecurityNews, formatThreatIntel, type KevEntry } from '@/lib/sources/threatintel';
import { normalizeTags, type Artifact } from './artifacts';
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

  return [
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
}

export function cyberxTags(kev: KevEntry[]): string[] {
  return normalizeTags(kev.flatMap((k) => [k.cveId, k.vendorProject]));
}

export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const [kev, news] = await Promise.all([fetchKev(), fetchSecurityNews()]);
  const lines = formatThreatIntel(kev, news);
  const context = formatContext(ctx);
  const markdown = await complete({
    system: PERSONAS.cyb,
    prompt: `${context ? context + '\n\n---\n\n' : ''}Today's threat feed:\n${lines.join('\n')}\n\nWrite a brief (120-180 word) threat-intelligence note: what's newly exploited, relevance to a small web/cloud company, and a one-line risk posture. Include a Sources list.`,
    maxTokens: 600,
  });
  return {
    markdown,
    summary: briefSummary(kev),
    feedMsg: `threat: ${news[0]?.title ?? kev[0]?.cveId ?? 'n/a'}`,
    artifacts: cyberxArtifacts(kev),
    tags: cyberxTags(kev),
    meta: { kev, news },
  };
}
