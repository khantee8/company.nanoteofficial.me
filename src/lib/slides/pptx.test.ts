import { describe, it, expect } from 'vitest';
import { deckToPptx, countPptxSlides } from './pptx';
import type { Deck } from './deck';

const deck: Deck = { theme: 'midnight', slides: [
  { layout: 'title', title: 'T', subtitle: 's' },
  { layout: 'data', heading: 'Churn', stat: '8%', caption: 'up' },
  { layout: 'bulletsVisual', heading: 'Plan', bullets: ['a', 'b'] },
] };

const deckWithFidelity: Deck = { theme: 'editorial', slides: [
  { layout: 'title', title: 'Title', subtitle: 'Sub' },
  { layout: 'comparison', heading: 'Compare', left: { title: 'Left Panel', points: ['x1', 'x2'] }, right: { title: 'Right Panel', points: ['y1', 'y2'] } },
  { layout: 'bulletsVisual', heading: 'Summary', bullets: ['item1', 'item2'], note: 'Bottom note text' },
] };

describe('deckToPptx', () => {
  it('produces a slide per deck slide', () => {
    expect(countPptxSlides(deck)).toBe(3);
  });
  it('returns a non-empty buffer', async () => {
    const buf = await deckToPptx(deck);
    expect(buf.length).toBeGreaterThan(0);
  });
  it('renders comparison panel titles and bulletsVisual notes without throwing', async () => {
    expect(countPptxSlides(deckWithFidelity)).toBe(3);
    const buf = await deckToPptx(deckWithFidelity);
    expect(buf.length).toBeGreaterThan(0);
  });
});
