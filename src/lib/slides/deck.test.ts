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
});
