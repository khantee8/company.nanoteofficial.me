import { describe, it, expect } from 'vitest';
import { ceoArtifacts, ceoTags, ceoBoardArtifacts, ceoKpiArtifact, type CompanySnapshot } from './ceo';

const snapshot: CompanySnapshot = {
  statuses: [
    { dept: 'cyb', state: 'done', lastRun: '2026-06-03T10:00:00Z' },
    { dept: 'fin', state: 'done', lastRun: '2026-06-03T11:00:00Z' },
    { dept: 'ops', state: 'error', lastRun: '2026-06-03T14:00:00Z' },
    { dept: 'mkt', state: 'idle', lastRun: null },
    { dept: 'rnd', state: 'done', lastRun: '2026-06-02T12:00:00Z' },
    { dept: 'ceo', state: 'running', lastRun: '2026-06-03T15:00:00Z' },
  ],
  digest: [
    { dept: 'ops', date: '2026-06-03', summary: '', highlight: '', flags: ['patch', 'rebuild'] },
    { dept: 'cyb', date: '2026-06-03', summary: '', highlight: '', flags: ['cve'] },
    { dept: 'fin', date: '2026-06-02', summary: '', highlight: '', flags: [] },
  ],
};

const markdown = '## Summary\nGood day across the board.\n\n## Decisions\n- Ship the v1.4 banner\n- Patch the KEV CVE\n';
const emptyFindings = { decisions: [], risks: [], priorities: [] };

describe('ceoArtifacts', () => {
  it('builds a department health scorecard from statuses', () => {
    const card = ceoArtifacts(snapshot, markdown, emptyFindings).find((a) => a.kind === 'scorecard');
    if (card && card.kind === 'scorecard') {
      const byLabel = Object.fromEntries(card.tiles.map((t) => [t.label, t.state]));
      expect(byLabel).toMatchObject({ CYB: 'ok', FIN: 'ok', OPS: 'down', MKT: 'warn', RND: 'ok', CEO: 'warn' });
    } else {
      throw new Error('no scorecard');
    }
  });

  it('builds an open-flags-by-dept bar chart (descending, nonzero only)', () => {
    const bars = ceoArtifacts(snapshot, markdown, emptyFindings).find((a) => a.kind === 'bars');
    if (bars && bars.kind === 'bars') {
      expect(bars.series.map((s) => [s.label, s.value])).toEqual([['OPS', 2], ['CYB', 1]]);
    } else {
      throw new Error('no bars');
    }
  });

  it('builds a 7-day activity heatmap from digest dates', () => {
    const heat = ceoArtifacts(snapshot, markdown, emptyFindings).find((a) => a.kind === 'heatmap');
    if (heat && heat.kind === 'heatmap') {
      expect(heat.cells).toEqual([{ label: '06-02', level: 1 }, { label: '06-03', level: 2 }]);
    } else {
      throw new Error('no heatmap');
    }
  });

  it('parses a decisions checklist from the markdown (fallback when findings empty)', () => {
    const list = ceoArtifacts(snapshot, markdown, emptyFindings).find((a) => a.kind === 'checklist');
    if (list && list.kind === 'checklist') {
      expect(list.items).toEqual([
        { text: 'Ship the v1.4 banner', done: false },
        { text: 'Patch the KEV CVE', done: false },
      ]);
    } else {
      throw new Error('no checklist');
    }
  });

  it('survives an empty snapshot', () => {
    expect(() => ceoArtifacts({ statuses: [], digest: [] }, '', emptyFindings)).not.toThrow();
  });
});

describe('ceoTags', () => {
  it('tags the flagged departments', () => {
    expect(ceoTags(snapshot)).toEqual(['ops', 'cyb']);
  });
});

describe('ceoBoardArtifacts', () => {
  it('builds matrix boards from findings, api provenance', () => {
    const arts = ceoBoardArtifacts({
      swot: { strengths: ['s'], weaknesses: [], opportunities: [], threats: [] },
      forces: { rivalry: ['r'], newEntrants: [], substitutes: [], buyerPower: [], supplierPower: [] },
    });
    expect(arts).toHaveLength(2); // swot + forces (no canvas provided)
    expect(arts[0]).toMatchObject({ kind: 'matrix', layout: 'swot', provenance: 'api' });
    expect(arts[0]).toMatchObject({ cells: expect.arrayContaining([{ label: 'Strengths', items: ['s'] }]) });
  });
});

describe('ceoKpiArtifact', () => {
  it('builds a deterministic scorecard', () => {
    const a = ceoKpiArtifact({ runsOk7d: 6, runsTotal7d: 7, kbPublished: 12, costMtdUsd: 0.42 });
    expect(a).toMatchObject({ kind: 'scorecard', title: 'company KPIs' });
    expect((a as { tiles: unknown[] }).tiles).toHaveLength(3);
  });
});
