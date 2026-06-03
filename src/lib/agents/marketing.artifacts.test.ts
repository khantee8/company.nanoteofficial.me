import { describe, it, expect } from 'vitest';
import { marketingArtifacts, marketingTags, type MarketingData } from './marketing';

const data: MarketingData = {
  hn: [{ title: 'Agents that ship', url: 'https://x/1', points: 120, comments: 30 }],
  devto: [{ title: 'Build a RAG app', url: 'https://d/1', reactions: 80, comments: 10, tags: ['ai', 'rag'] }],
  reach: [{ day: '06-01', visits: 100 }, { day: '06-02', visits: 140 }],
};

describe('marketingArtifacts', () => {
  it('ranks topic momentum by combined engagement (demand)', () => {
    const bars = marketingArtifacts(data).find((a) => a.kind === 'bars');
    if (bars && bars.kind === 'bars') {
      expect(bars.series.map((s) => [s.label, s.value])).toEqual([
        ['Agents that ship', 150],
        ['Build a RAG app', 90],
      ]);
    } else {
      throw new Error('no bars');
    }
  });

  it('includes a reach line when analytics is available', () => {
    const line = marketingArtifacts(data).find((a) => a.kind === 'line');
    expect(line && line.kind === 'line' && line.points).toEqual([
      { t: '06-01', value: 100 }, { t: '06-02', value: 140 },
    ]);
  });

  it('omits the reach line when analytics is empty (graceful)', () => {
    const arts = marketingArtifacts({ ...data, reach: [] });
    expect(arts.some((a) => a.kind === 'line')).toBe(false);
  });

  it('builds a content-plan table keyed off the top topic', () => {
    const table = marketingArtifacts(data).find((a) => a.kind === 'table');
    if (table && table.kind === 'table') {
      expect(table.columns).toEqual(['channel', 'format', 'topic']);
      expect(table.rows).toEqual([
        ['X', 'post', 'Agents that ship'],
        ['LinkedIn', 'post', 'Agents that ship'],
        ['Blog', 'idea', 'Agents that ship'],
      ]);
    } else {
      throw new Error('no table');
    }
  });

  it('survives empty inputs', () => {
    expect(() => marketingArtifacts({ hn: [], devto: [], reach: [] })).not.toThrow();
  });
});

describe('marketingTags', () => {
  it('aggregates Dev.to topic tags plus channels', () => {
    expect(marketingTags(data)).toEqual(['ai', 'rag', 'x', 'linkedin', 'blog']);
  });
});
