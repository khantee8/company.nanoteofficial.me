import { describe, it, expect } from 'vitest';
import { validateDeck } from './deck';

const good = { theme: 'midnight', slides: [
  { layout: 'title', title: 'Q3 Plan', subtitle: 'three bets' },
  { layout: 'bulletsVisual', heading: 'Why now', bullets: ['Churn up 4pts', 'CAC flat'] },
] };

describe('validateDeck', () => {
  it('accepts a valid deck', () => {
    const r = validateDeck(good);
    expect(r.ok).toBe(true);
  });
  it('rejects unknown theme', () => {
    expect(validateDeck({ ...good, theme: 'neon' }).ok).toBe(false);
  });
  it('rejects unknown slide layout', () => {
    expect(validateDeck({ theme: 'grid', slides: [{ layout: 'wat' }] }).ok).toBe(false);
  });
  it('rejects non-array slides', () => {
    expect(validateDeck({ theme: 'grid', slides: {} }).ok).toBe(false);
  });

  it('rejects bulletsVisual missing bullets', () => {
    const r = validateDeck({ theme: 'grid', slides: [
      { layout: 'bulletsVisual', heading: 'X' },
    ] });
    expect(r.ok).toBe(false);
  });

  it('rejects agenda with items as a non-array', () => {
    const r = validateDeck({ theme: 'grid', slides: [
      { layout: 'agenda', heading: 'X', items: 'not-array' },
    ] });
    expect(r.ok).toBe(false);
  });

  it('rejects comparison missing right.points', () => {
    const r = validateDeck({ theme: 'grid', slides: [
      { layout: 'comparison', heading: 'X', left: { title: 'A', points: ['a'] }, right: { title: 'B' } },
    ] });
    expect(r.ok).toBe(false);
  });

  it('rejects data missing stat', () => {
    const r = validateDeck({ theme: 'grid', slides: [
      { layout: 'data', heading: 'X' },
    ] });
    expect(r.ok).toBe(false);
  });

  it('accepts a slide with an optional field absent', () => {
    const r = validateDeck({ theme: 'grid', slides: [
      { layout: 'title', title: 'No subtitle here' },
    ] });
    expect(r.ok).toBe(true);
  });

  it('accepts a valid deck using all 8 layouts', () => {
    const r = validateDeck({ theme: 'editorial', slides: [
      { layout: 'title', title: 'Q3 Plan', subtitle: 'three bets' },
      { layout: 'agenda', heading: 'Agenda', items: ['One', 'Two'] },
      { layout: 'section', title: 'Section A', kicker: 'Part 1' },
      { layout: 'bulletsVisual', heading: 'Why now', bullets: ['Churn up 4pts', 'CAC flat'], note: 'internal' },
      { layout: 'quote', quote: 'Ship it.', attribution: 'CEOX' },
      { layout: 'data', heading: 'Growth', stat: '42%', caption: 'YoY' },
      { layout: 'comparison', heading: 'Build vs buy', left: { title: 'Build', points: ['Control'] }, right: { title: 'Buy', points: ['Speed'] } },
      { layout: 'closing', title: 'Thanks', cta: 'Questions?' },
    ] });
    expect(r.ok).toBe(true);
  });
});
