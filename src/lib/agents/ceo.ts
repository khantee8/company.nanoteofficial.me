import { completeRaw, applyOverrides, type CompleteOpts } from '@/lib/claude';
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

// Board schemas — fixed key sets; every cell validated to string[] (strArray),
// so a drifting model can blank a cell but never break the render.
const SWOT_KEYS = ['strengths', 'weaknesses', 'opportunities', 'threats'] as const;
const CANVAS_KEYS = ['keyPartners', 'keyActivities', 'keyResources', 'valuePropositions',
  'customerRelationships', 'channels', 'customerSegments', 'costStructure', 'revenueStreams'] as const;
const FORCES_KEYS = ['rivalry', 'newEntrants', 'substitutes', 'buyerPower', 'supplierPower'] as const;

export interface CeoBoards {
  swot?: Record<(typeof SWOT_KEYS)[number], string[]>;
  canvas?: Record<(typeof CANVAS_KEYS)[number], string[]>;
  forces?: Record<(typeof FORCES_KEYS)[number], string[]>;
}
export interface CeoFindings { decisions: string[]; risks: string[]; priorities: string[]; boards?: CeoBoards }

const STATE_TO_TILE: Record<AgentState, 'ok' | 'warn' | 'down'> = {
  done: 'ok', error: 'down', idle: 'warn', running: 'warn',
};

const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

function board<K extends string>(raw: unknown, keys: readonly K[]): Record<K, string[]> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  return Object.fromEntries(keys.map((k) => [k, strArray(r[k])])) as Record<K, string[]>;
}

export function parseCeoFindings(markdown: string): CeoFindings | null {
  const raw = extractFindingsBlock<Partial<CeoFindings>>(markdown);
  if (!raw) return null;
  const b = raw.boards as Record<string, unknown> | undefined;
  const boards: CeoBoards | undefined = b && typeof b === 'object'
    ? { swot: board(b.swot, SWOT_KEYS), canvas: board(b.canvas, CANVAS_KEYS), forces: board(b.forces, FORCES_KEYS) }
    : undefined;
  return { decisions: strArray(raw.decisions), risks: strArray(raw.risks),
           priorities: strArray(raw.priorities), boards };
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

const CELL_LABELS: Record<string, string> = {
  strengths: 'Strengths', weaknesses: 'Weaknesses', opportunities: 'Opportunities', threats: 'Threats',
  keyPartners: 'Key Partners', keyActivities: 'Key Activities', keyResources: 'Key Resources',
  valuePropositions: 'Value Propositions', customerRelationships: 'Customer Relationships',
  channels: 'Channels', customerSegments: 'Customer Segments', costStructure: 'Cost Structure',
  revenueStreams: 'Revenue Streams',
  rivalry: 'Competitive Rivalry', newEntrants: 'New Entrants', substitutes: 'Substitutes',
  buyerPower: 'Buyer Power', supplierPower: 'Supplier Power',
};

function matrixOf(title: string, layout: 'swot' | 'canvas' | 'forces',
                  cells: Record<string, string[]> | undefined): Artifact | null {
  if (!cells || Object.values(cells).every((v) => v.length === 0)) return null;
  return withProvenance({ kind: 'matrix', title, layout,
    cells: Object.entries(cells).map(([k, items]) => ({ label: CELL_LABELS[k] ?? k, items })) }, 'api');
}

/** v1.11 CEOX strategy boards — built deterministically from VALIDATED findings. */
export function ceoBoardArtifacts(boards: CeoBoards): Artifact[] {
  return [
    matrixOf('SWOT analysis', 'swot', boards.swot),
    matrixOf('business model canvas', 'canvas', boards.canvas),
    matrixOf('five forces', 'forces', boards.forces),
  ].filter((a): a is Artifact => a !== null);
}

export interface CeoKpis { runsOk7d: number; runsTotal7d: number; kbPublished: number; costMtdUsd: number }

/** v1.11 KPI scorecard — fully deterministic, no LLM input. */
export function ceoKpiArtifact(k: CeoKpis): Artifact {
  return withProvenance({ kind: 'scorecard', title: 'company KPIs', tiles: [
    { label: `runs 7d ${k.runsOk7d}/${k.runsTotal7d}`, state: k.runsOk7d === k.runsTotal7d ? 'ok' : k.runsOk7d > 0 ? 'warn' : 'down' },
    { label: `KB published ${k.kbPublished}`, state: k.kbPublished > 0 ? 'ok' : 'warn' },
    { label: `cost MTD $${k.costMtdUsd.toFixed(2)}`, state: 'ok' },
  ] }, 'api');
}

export async function run(ctx: AgentContext): Promise<AgentRunResult> {
  const context = formatContext(ctx);
  const { text: markdown, stopReason, usage, model } = await completeRaw(applyOverrides<CompleteOpts>({
    system: PERSONAS.ceo,
    prompt: `${context ? context + '\n\n---\n\n' : ''}สังเคราะห์บทสรุปผู้บริหารจากผลงานของทุกแผนก: "## Summary" (3-4 ประโยค เชื่อมโยงกิจกรรมล่าสุดของบริษัท) และ "## Decisions" (2-3 ข้อ ลงมือได้จริง อ้างถึงผลงานของแผนกที่เจาะจง) เปิดรายงานด้วยบล็อก \`\`\`json findings (decisions/risks/priorities/boards ตามสคีมาในบทบาทของคุณ — boards ประกอบด้วย swot, canvas, forces)`,
    maxTokens: 8000,
  }, ctx));
  const snapshot = ctx.companySnapshot ?? { statuses: [], digest: [] };
  const findings = parseCeoFindings(markdown) ?? { decisions: [], risks: [], priorities: [] };
  return {
    markdown,
    summary: 'company synthesis + decisions',
    feedMsg: 'standup complete 📋',
    artifacts: [
      ...ceoArtifacts(snapshot, markdown, findings),
      ...ceoBoardArtifacts(findings.boards ?? {}),
      ...(ctx.companySnapshot?.kpis ? [ceoKpiArtifact(ctx.companySnapshot.kpis)] : []),
    ],
    tags: ceoTags(snapshot),
    theme: 'weekly-synthesis',
    provenance: 'api',
    related: ctx.companySnapshot?.relatedEntryIds ?? [],
    incomplete: stopReason === 'max_tokens',
    usage, model,
    meta: { risks: findings.risks, priorities: findings.priorities, stopReason },
  };
}
