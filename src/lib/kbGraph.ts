// src/lib/kbGraph.ts — derived knowledge graph over PUBLISHED KB entries.
// Pure + computed on read: no stored edges, always consistent with the KB.
// ponytail: O(n²) pair scan — the KB is tens of entries; index if it hits thousands.
import type { KbEntry, KbCategory } from '@/lib/agents/types';
import type { DeptId } from '@/lib/data/departments';

export interface KbNode {
  id: string; slug: string; dept: DeptId;
  /** = entry summary (KB entries have no separate title field). */
  title: string;
  category: KbCategory; theme?: string; tags: string[]; date: string;
}
export interface KbEdge { from: string; to: string; type: 'builds_on' | 'same_theme' | 'shares_tag'; weight: number }
export interface KbGraph { nodes: KbNode[]; edges: KbEdge[] }

export function buildKbGraph(entries: KbEntry[]): KbGraph {
  const nodes: KbNode[] = entries.map((e) => ({
    id: e.id, slug: e.slug, dept: e.dept, title: e.summary,
    category: e.category, theme: e.theme, tags: e.tags, date: e.date,
  }));
  const ids = new Set(entries.map((e) => e.id));
  const edges: KbEdge[] = [];
  const linked = new Set<string>(); // unordered pair keys already carrying builds_on
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  for (const e of entries) {
    for (const to of new Set(e.related)) {
      if (!ids.has(to) || to === e.id) continue;
      edges.push({ from: e.id, to, type: 'builds_on', weight: 1 });
      linked.add(pairKey(e.id, to));
    }
  }
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const [a, b] = [entries[i], entries[j]];
      const [from, to] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
      if (linked.has(pairKey(a.id, b.id))) continue;
      if (a.theme && a.theme === b.theme) {
        edges.push({ from, to, type: 'same_theme', weight: 1 });
        continue; // strongest derived relation wins; avoid double edges per pair
      }
      const shared = a.tags.filter((t) => b.tags.includes(t)).length;
      if (shared > 0) edges.push({ from, to, type: 'shares_tag', weight: shared });
    }
  }
  return { nodes, edges };
}
