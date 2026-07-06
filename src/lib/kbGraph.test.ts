import { describe, it, expect } from 'vitest';
import { buildKbGraph } from './kbGraph';
import type { KbEntry } from '@/lib/agents/types';

const entry = (id: string, over: Partial<KbEntry> = {}): KbEntry => ({
  id, slug: `s-${id}`, dept: 'fin', date: '2026-07-01', ts: '2026-07-01T00:00:00Z',
  category: 'market-brief', tags: [], status: 'published', summary: `sum ${id}`,
  highlight: '', flags: [], artifacts: [], sources: [], provenance: 'api',
  related: [], markdown: '', ...over,
});

describe('buildKbGraph', () => {
  it('maps entries to nodes (title = summary)', () => {
    const g = buildKbGraph([entry('a')]);
    expect(g.nodes).toEqual([expect.objectContaining({ id: 'a', slug: 's-a', title: 'sum a' })]);
    expect(g.edges).toEqual([]);
  });

  it('builds_on edges from related ids (only when the target exists)', () => {
    const g = buildKbGraph([entry('a', { related: ['b', 'ghost'] }), entry('b')]);
    expect(g.edges).toEqual([{ from: 'a', to: 'b', type: 'builds_on', weight: 1 }]);
  });

  it('same_theme edge once per pair, from < to by id', () => {
    const g = buildKbGraph([entry('b', { theme: 't' }), entry('a', { theme: 't' })]);
    expect(g.edges).toEqual([{ from: 'a', to: 'b', type: 'same_theme', weight: 1 }]);
  });

  it('shares_tag weight = shared-tag count', () => {
    const g = buildKbGraph([entry('a', { tags: ['x', 'y'] }), entry('b', { tags: ['x', 'y', 'z'] })]);
    expect(g.edges).toEqual([{ from: 'a', to: 'b', type: 'shares_tag', weight: 2 }]);
  });

  it('builds_on suppresses weaker derived edges for the same pair', () => {
    const g = buildKbGraph([entry('a', { related: ['b'], theme: 't', tags: ['x'] }),
                            entry('b', { theme: 't', tags: ['x'] })]);
    expect(g.edges).toEqual([{ from: 'a', to: 'b', type: 'builds_on', weight: 1 }]);
  });

  it('empty KB → empty graph', () => {
    expect(buildKbGraph([])).toEqual({ nodes: [], edges: [] });
  });

  it('duplicate related ids → exactly ONE builds_on edge', () => {
    const g = buildKbGraph([entry('a', { related: ['b', 'b'] }), entry('b')]);
    expect(g.edges).toEqual([{ from: 'a', to: 'b', type: 'builds_on', weight: 1 }]);
  });

  it('same theme AND shared tags (no related link) → only a same_theme edge', () => {
    const g = buildKbGraph([entry('a', { theme: 't', tags: ['x'] }), entry('b', { theme: 't', tags: ['x'] })]);
    expect(g.edges).toEqual([{ from: 'a', to: 'b', type: 'same_theme', weight: 1 }]);
  });
});
