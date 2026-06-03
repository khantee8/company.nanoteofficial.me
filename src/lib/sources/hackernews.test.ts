import { describe, it, expect } from 'vitest';
import { selectHN, type HNResponse } from './hackernews';

describe('selectHN', () => {
  it('maps hits to title/url/points/comments and respects the limit', () => {
    const raw: HNResponse = {
      hits: [
        { title: 'Agents that ship', url: 'https://x/1', points: 120, num_comments: 30 },
        { title: 'No URL story', points: 40, num_comments: 5, objectID: '999' },
        { points: 10 }, // dropped: no title
      ],
    };
    const out = selectHN(raw, 2);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ title: 'Agents that ship', url: 'https://x/1', points: 120, comments: 30 });
    expect(out[1].url).toBe('https://news.ycombinator.com/item?id=999');
  });

  it('handles an empty/missing response', () => {
    expect(selectHN({})).toEqual([]);
  });
});
