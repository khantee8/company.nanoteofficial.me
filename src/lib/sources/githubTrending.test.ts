import { describe, it, expect } from 'vitest';
import { selectTrending, type TrendingResponse } from './githubTrending';

describe('selectTrending', () => {
  it('maps repos and defaults a missing language to "other"', () => {
    const raw: TrendingResponse = {
      items: [
        { full_name: 'acme/agent', html_url: 'https://github.com/acme/agent', stargazers_count: 1200, language: 'Python' },
        { full_name: 'acme/tool', stargazers_count: 90, language: null },
        { stargazers_count: 5 }, // dropped: no full_name
      ],
    };
    const out = selectTrending(raw);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ name: 'acme/agent', url: 'https://github.com/acme/agent', stars: 1200, language: 'Python' });
    expect(out[1]).toEqual({ name: 'acme/tool', url: 'https://github.com/acme/tool', stars: 90, language: 'other' });
  });

  it('respects the limit', () => {
    const raw: TrendingResponse = {
      items: Array.from({ length: 12 }, (_, i) => ({ full_name: `a/r${i}`, stargazers_count: i })),
    };
    expect(selectTrending(raw, 5)).toHaveLength(5);
  });

  it('handles an empty response', () => {
    expect(selectTrending({})).toEqual([]);
  });
});
