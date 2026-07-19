import { describe, it, expect } from 'vitest';
import { lintDeck } from './slopLint';
import type { Deck, Slide } from './deck';

const brief = 'Churn rose to 8% in Q2. CAC is 420 dollars. Acme launched Pro tier.';

describe('lintDeck', () => {
  it('flags banned filler phrases', () => {
    const deck: Deck = { theme: 'midnight', slides: [{ layout: 'title', title: "In today's fast-paced world" }] };
    expect(lintDeck(deck, brief).some((i) => i.rule === 'filler')).toBe(true);
  });
  it('flags a bullet wall (>5 bullets)', () => {
    const deck: Deck = { theme: 'grid', slides: [{ layout: 'bulletsVisual', heading: 'X', bullets: ['a','b','c','d','e','f'] }] };
    expect(lintDeck(deck, brief).some((i) => i.rule === 'bullet-wall')).toBe(true);
  });
  it('flags layout monotony (>2 same in a row)', () => {
    const s: Slide = { layout: 'bulletsVisual', heading: 'h', bullets: ['x churn 8%'] };
    const deck: Deck = { theme: 'grid', slides: [s, s, s] };
    expect(lintDeck(deck, brief).some((i) => i.rule === 'monotony')).toBe(true);
  });
  it('flags evidence-free content slides', () => {
    const deck: Deck = { theme: 'grid', slides: [{ layout: 'bulletsVisual', heading: 'Synergy', bullets: ['We will grow fast'] }] };
    expect(lintDeck(deck, brief).some((i) => i.rule === 'no-evidence')).toBe(true);
  });
  it('passes a clean, specific deck', () => {
    const deck: Deck = { theme: 'midnight', slides: [
      { layout: 'title', title: 'Acme Q3 Growth' },
      { layout: 'data', heading: 'Churn', stat: '8%', caption: 'up from 6% in Q1' },
      { layout: 'bulletsVisual', heading: 'Plan', bullets: ['Cut CAC below 420', 'Ship Pro tier retention'] },
    ] };
    expect(lintDeck(deck, brief)).toEqual([]);
  });
});
