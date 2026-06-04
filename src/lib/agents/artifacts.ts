// Structured, chartable data emitted by agents. Built DETERMINISTICALLY from
// each agent's source data — the LLM never produces an artifact, so a chart can
// never be malformed or hallucinated. Rendered by `src/components/charts/` and
// archived into the knowledge base (`KbEntry.artifacts`).
import type { DeptId } from '@/lib/data/departments';

export type KbCategory =
  | 'market-brief' | 'threat-intel' | 'research'
  | 'content-plan' | 'ops-status'  | 'exec-brief';

/** Stable, one-to-one category per department (used by the KB + runner). */
export const CATEGORY_BY_DEPT: Record<DeptId, KbCategory> = {
  fin: 'market-brief',
  cyb: 'threat-intel',
  rnd: 'research',
  mkt: 'content-plan',
  ops: 'ops-status',
  ceo: 'exec-brief',
};

export type Provenance = 'api' | 'web';
export interface Citation { url: string; title: string; /** ISO 8601, YYYY-MM-DD */ date: string }

interface ArtifactMeta { provenance?: Provenance; sources?: Citation[] }

export type Artifact = ArtifactMeta & (
  | { kind: 'bars' | 'divergingBars' | 'donut'; title: string;
      series: { label: string; value: number; color?: string }[]; unit?: string }
  | { kind: 'line' | 'sparkline'; title: string;
      points: { t: string; value: number }[]; unit?: string }
  | { kind: 'table'; title: string;
      columns: string[]; rows: (string | number)[][] }
  | { kind: 'scorecard'; title: string;
      tiles: { label: string; state: 'ok' | 'warn' | 'down' }[] }
  | { kind: 'heatmap'; title: string; cells: { label: string; level: number }[] }
  | { kind: 'tags'; title: string; tags: string[] }
  | { kind: 'checklist'; title: string; items: { text: string; done: boolean }[] }
);

/** Stamp an artifact with its data provenance. `api` = built from a real API
 *  (deterministic, can't be hallucinated). `web` = researched, MUST carry sources. */
export function withProvenance(a: Artifact, provenance: 'api', sources?: Citation[]): Artifact;
export function withProvenance(a: Artifact, provenance: 'web', sources: Citation[]): Artifact;
export function withProvenance(a: Artifact, provenance: Provenance, sources: Citation[] = []): Artifact {
  return { ...a, provenance, sources };
}

/** Deterministic, deduplicated, lowercased, capped tag list. */
export function normalizeTags(raw: string[], cap = 12): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const v = t.trim().toLowerCase();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
      if (out.length >= cap) break;
    }
  }
  return out;
}
