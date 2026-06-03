import { describe, it, expect } from 'vitest';
import { selectDevto, type DevtoArticle } from './devto';

describe('selectDevto', () => {
  it('maps articles and normalizes tag_list (array or csv string)', () => {
    const raw: DevtoArticle[] = [
      { title: 'Build a RAG app', url: 'https://d/1', public_reactions_count: 80, comments_count: 10, tag_list: ['ai', 'rag'] },
      { title: 'CSV tags', url: 'https://d/2', public_reactions_count: 5, comments_count: 1, tag_list: 'webdev, ai' },
      { url: 'https://d/3' }, // dropped: no title
    ];
    const out = selectDevto(raw);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ title: 'Build a RAG app', url: 'https://d/1', reactions: 80, comments: 10, tags: ['ai', 'rag'] });
    expect(out[1].tags).toEqual(['webdev', 'ai']);
  });

  it('handles an empty list', () => {
    expect(selectDevto([])).toEqual([]);
  });
});
