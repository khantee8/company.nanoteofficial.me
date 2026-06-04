import { describe, it, expect } from 'vitest';
import { rndArtifacts, rndTags } from './rnd';
import type { TrendingRepo } from '@/lib/sources/githubTrending';

const repos: TrendingRepo[] = [
  { name: 'acme/agent', url: 'https://github.com/acme/agent', stars: 1200, language: 'Python' },
  { name: 'acme/tool', url: 'https://github.com/acme/tool', stars: 800, language: 'TypeScript' },
  { name: 'acme/rs', url: 'https://github.com/acme/rs', stars: 300, language: 'Python' },
];

describe('rndArtifacts', () => {
  it('ranks trending repos by stars', () => {
    const bars = rndArtifacts(repos).find((a) => a.kind === 'bars');
    if (bars && bars.kind === 'bars') {
      expect(bars.series.map((s) => s.value)).toEqual([1200, 800, 300]);
    } else {
      throw new Error('no bars');
    }
  });

  it('builds a language-mix donut sorted by count', () => {
    const donut = rndArtifacts(repos).find((a) => a.kind === 'donut');
    if (donut && donut.kind === 'donut') {
      expect(donut.series).toEqual([
        { label: 'Python', value: 2 },
        { label: 'TypeScript', value: 1 },
      ]);
    } else {
      throw new Error('no donut');
    }
  });

  it('builds a radar table of repo/stars/lang', () => {
    const table = rndArtifacts(repos).find((a) => a.kind === 'table');
    if (table && table.kind === 'table') {
      expect(table.columns).toEqual(['repo', 'stars', 'lang']);
      expect(table.rows[0]).toEqual(['acme/agent', 1200, 'Python']);
    } else {
      throw new Error('no table');
    }
  });

  it('emits nothing when there are no repos (graceful)', () => {
    expect(rndArtifacts([])).toEqual([]);
  });

  it('tags trending charts as api provenance', () => {
    const a = rndArtifacts(repos);
    expect(a.every((x) => x.provenance === 'api')).toBe(true);
  });
});

describe('rndTags', () => {
  it('aggregates languages plus stable niche tags, lowercased & deduped', () => {
    expect(rndTags(repos)).toEqual(['python', 'typescript', 'ai', 'agents', 'devtools']);
  });
});
