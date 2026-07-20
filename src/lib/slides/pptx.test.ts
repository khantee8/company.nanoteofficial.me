import { describe, it, expect } from 'vitest';
import { deckToPptx, countPptxSlides } from './pptx';
import type { Deck } from './deck';

const deck: Deck = { theme: 'midnight', slides: [
  { layout: 'title', title: 'T', subtitle: 's' },
  { layout: 'data', heading: 'Churn', stat: '8%', caption: 'up' },
  { layout: 'bulletsVisual', heading: 'Plan', bullets: ['a', 'b'] },
] };

describe('deckToPptx', () => {
  it('produces a slide per deck slide', () => {
    expect(countPptxSlides(deck)).toBe(3);
  });
  it('returns a non-empty buffer', async () => {
    const buf = await deckToPptx(deck);
    expect(buf.length).toBeGreaterThan(0);
  });
});
