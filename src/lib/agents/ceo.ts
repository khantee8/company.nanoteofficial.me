import { complete } from '@/lib/claude';
import { PERSONAS } from './personas';
import { formatContext } from './runner';
import { DEPARTMENTS, type DeptId } from '@/lib/data/departments';
import { normalizeTags, type Artifact } from './artifacts';
import type { AgentRunResult, AgentContext, AgentState, AgentStatus, DigestEntry } from './types';

export interface CompanySnapshot {
  statuses: AgentStatus[];
  digest: DigestEntry[];
}

const STATE_TO_TILE: Record<AgentState, 'ok' | 'warn' | 'down'> = {
  done: 'ok', error: 'down', idle: 'warn', running: 'warn',
};

function parseDecisions(md: string): { text: string; done: boolean }[] {
  const m = md.match(/## Decisions\s*\n([\s\S]*?)(?=\n## |\n---|\s*$)/i);
  if (!m) return [];
  return m[1]
    .split('\n')
    .map((l) => l.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((text) => ({ text, done: false }));
}

function flagsByDept(digest: DigestEntry[]): Map<DeptId, number> {
  const m = new Map<DeptId, number>();
  for (const e of digest) m.set(e.dept, (m.get(e.dept) ?? 0) + e.flags.length);
  return m;
}

/** The Executive Cockpit — aggregates the company's own state. No new source. */
export function ceoArtifacts(snapshot: CompanySnapshot, markdown: string): Artifact[] {
  const tiles = DEPARTMENTS.map((d) => {
    const st = snapshot.statuses.find((s) => s.dept === d.id);
    return { label: d.id.toUpperCase(), state: STATE_TO_TILE[st?.state ?? 'idle'] };
  });

  const flagSeries = [...flagsByDept(snapshot.digest).entries()]
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([d, n]) => ({ label: d.toUpperCase(), value: n, color: '#ff5470' }));

  const byDate = new Map<string, number>();
  for (const e of snapshot.digest) byDate.set(e.date, (byDate.get(e.date) ?? 0) + 1);
  const cells = [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-7)
    .map(([d, n]) => ({ label: d.slice(5), level: n }));

  return [
    { kind: 'scorecard', title: 'department health', tiles },
    { kind: 'bars', title: 'open flags by dept', series: flagSeries },
    { kind: 'heatmap', title: '7-day activity', cells },
    { kind: 'checklist', title: "today's decisions", items: parseDecisions(markdown) },
  ];
}

export function ceoTags(snapshot: CompanySnapshot): string[] {
  return normalizeTags(
    [...flagsByDept(snapshot.digest).entries()].filter(([, n]) => n > 0).map(([d]) => d),
  );
}

export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const context = formatContext(ctx);
  const markdown = await complete({
    system: PERSONAS.ceo,
    prompt: `${context ? context + '\n\n---\n\n' : ''}Write a short standup: "## Summary" (3-4 sentences synthesizing today's company activity and how it connects to recent days) and "## Decisions" (2-3 bullets, concrete and actionable for tomorrow, referencing specific department outputs).`,
    maxTokens: 900,
  });
  const snapshot = ctx.companySnapshot ?? { statuses: [], digest: [] };
  return {
    markdown,
    summary: 'company standup + decisions',
    feedMsg: 'standup complete 📋',
    artifacts: ceoArtifacts(snapshot, markdown),
    tags: ceoTags(snapshot),
  };
}
