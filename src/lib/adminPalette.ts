import type { DeptId } from '@/lib/data/departments';

export interface PaletteIndexItem { id: string; label: string; kind: 'agent' | 'kb' }

export function buildPaletteIndex(
  depts: { id: DeptId; name: string }[],
  kb: { id: string; slug: string; summary: string }[],
): PaletteIndexItem[] {
  return [
    ...depts.map((d) => ({ id: `agent:${d.id}`, label: `Agent · ${d.name}`, kind: 'agent' as const })),
    ...kb.map((e) => ({ id: `kb:${e.id}`, label: `Brief · ${e.summary}`, kind: 'kb' as const })),
  ];
}

export function filterPalette(items: PaletteIndexItem[], query: string): PaletteIndexItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((i) => i.label.toLowerCase().includes(q));
}
