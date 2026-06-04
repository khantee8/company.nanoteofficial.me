import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArtifactRenderer } from './ArtifactRenderer';
import { withProvenance, type Artifact } from '@/lib/agents/artifacts';

const samples: Artifact[] = [
  { kind: 'divergingBars', title: 'moves', series: [{ label: 'BTC', value: 2.1 }, { label: 'ETH', value: -1.3 }], unit: '%' },
  { kind: 'bars', title: 'momentum', series: [{ label: 'agents', value: 42 }] },
  { kind: 'donut', title: 'breadth', series: [{ label: 'up', value: 6 }, { label: 'down', value: 2 }] },
  { kind: 'line', title: 'trend', points: [{ t: 'Mon', value: 3 }, { t: 'Tue', value: 5 }] },
  { kind: 'sparkline', title: 'spark', points: [{ t: 'a', value: 1 }, { t: 'b', value: 4 }] },
  { kind: 'table', title: 'prices', columns: ['asset', 'price'], rows: [['BTC', 71240], ['ETH', 3820]] },
  { kind: 'scorecard', title: 'health', tiles: [{ label: 'FIN', state: 'ok' }, { label: 'OPS', state: 'down' }] },
  { kind: 'heatmap', title: '7d', cells: [{ label: 'd1', level: 2 }, { label: 'd2', level: 0 }] },
  { kind: 'tags', title: 'trends', tags: ['agents', 'rag'] },
  { kind: 'checklist', title: 'decisions', items: [{ text: 'ship', done: true }, { text: 'patch', done: false }] },
];

describe('ArtifactRenderer', () => {
  it('renders every artifact kind to non-empty markup', () => {
    for (const a of samples) {
      const html = renderToStaticMarkup(<ArtifactRenderer artifact={a} />);
      expect(html.length).toBeGreaterThan(0);
      expect(html).not.toContain('NaN');
    }
  });

  it('renders empty data as an empty-state without NaN geometry', () => {
    const empties: Artifact[] = [
      { kind: 'bars', title: 't', series: [] },
      { kind: 'line', title: 't', points: [] },
      { kind: 'donut', title: 't', series: [] },
      { kind: 'table', title: 't', columns: ['a'], rows: [] },
      { kind: 'scorecard', title: 't', tiles: [] },
      { kind: 'heatmap', title: 't', cells: [] },
      { kind: 'tags', title: 't', tags: [] },
      { kind: 'checklist', title: 't', items: [] },
    ];
    for (const a of empties) {
      const html = renderToStaticMarkup(<ArtifactRenderer artifact={a} />);
      expect(html).toContain('no data');
      expect(html).not.toContain('NaN');
    }
  });

  it('renders compact variants without throwing', () => {
    for (const a of samples) {
      expect(() => renderToStaticMarkup(<ArtifactRenderer artifact={a} compact />)).not.toThrow();
    }
  });

  it('renders an api provenance badge', () => {
    const a = withProvenance({ kind: 'bars', title: 't', series: [{ label: 'x', value: 1 }] }, 'api');
    const html = renderToStaticMarkup(<ArtifactRenderer artifact={a} />);
    expect(html).toContain('api');
  });

  it('renders a web · cited badge', () => {
    const a = withProvenance({ kind: 'table', title: 't', columns: ['a'], rows: [['x']] }, 'web', [{ url: 'https://e.com', title: 'S', date: '2026-06-01' }]);
    const html = renderToStaticMarkup(<ArtifactRenderer artifact={a} />);
    expect(html).toContain('web · cited');
  });
});
