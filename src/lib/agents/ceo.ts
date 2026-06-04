import { complete } from '@/lib/claude';
import { PERSONAS } from './personas';
import { formatContext } from './runner';
import { DEPARTMENTS, type DeptId } from '@/lib/data/departments';
import { normalizeTags, withProvenance, type Artifact } from './artifacts';
import { extractFindingsBlock } from './findings';
import type { AgentRunResult, AgentContext, AgentState, AgentStatus, DigestEntry } from './types';

export interface CompanySnapshot {
  statuses: AgentStatus[];
  digest: DigestEntry[];
}

export interface CeoFindings { decisions: string[]; risks: string[]; priorities: string[] }

const STATE_TO_TILE: Record<AgentState, 'ok' | 'warn' | 'down'> = {
  done: 'ok', error: 'down', idle: 'warn', running: 'warn',
};

const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

export function parseCeoFindings(markdown: string): CeoFindings | null {
  const raw = extractFindingsBlock<Partial<CeoFindings>>(markdown);
  if (!raw) return null;
  return { decisions: strArray(raw.decisions), risks: strArray(raw.risks), priorities: strArray(raw.priorities) };
}

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
export function ceoArtifacts(snapshot: CompanySnapshot, markdown: string, findings: CeoFindings): Artifact[] {
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

  const planText = [...findings.decisions, ...findings.priorities];
  const checklistItems = planText.length > 0
    ? planText.map((text) => ({ text, done: false }))
    : parseDecisions(markdown);

  const arts: Artifact[] = [
    { kind: 'scorecard', title: 'department health', tiles },
    { kind: 'bars', title: 'open flags by dept', series: flagSeries },
    { kind: 'heatmap', title: '7-day activity', cells },
    { kind: 'checklist', title: "today's decisions", items: checklistItems },
  ];
  return arts.map((a) => withProvenance(a, 'api'));
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
    prompt: `${context ? context + '\n\n---\n\n' : ''}สังเคราะห์บทสรุปผู้บริหารจากผลงานของทุกแผนก: "## Summary" (3-4 ประโยค เชื่อมโยงกิจกรรมล่าสุดของบริษัท) และ "## Decisions" (2-3 ข้อ ลงมือได้จริง อ้างถึงผลงานของแผนกที่เจาะจง) แล้วแนบบล็อก \`\`\`json findings (decisions/risks/priorities) ตามสคีมาในบทบาทของคุณ`,
    maxTokens: 1200,
  });
  const snapshot = ctx.companySnapshot ?? { statuses: [], digest: [] };
  const findings = parseCeoFindings(markdown) ?? { decisions: [], risks: [], priorities: [] };
  return {
    markdown,
    summary: 'company synthesis + decisions',
    feedMsg: 'standup complete 📋',
    artifacts: ceoArtifacts(snapshot, markdown, findings),
    tags: ceoTags(snapshot),
    theme: 'weekly-synthesis',
    provenance: 'api',
    related: ctx.companySnapshot?.relatedEntryIds ?? [],
    meta: { risks: findings.risks, priorities: findings.priorities },
  };
}
