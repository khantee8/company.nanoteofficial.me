import { describe, it, expect } from 'vitest';
import { costOf, isKnownModel, PRICING } from './cost';

describe('costOf', () => {
  it('prices a known model from input/output tokens', () => {
    const c = costOf('claude-haiku-4-5-20251001', { input: 1_000_000, output: 1_000_000 });
    expect(c).toBeCloseTo(PRICING['claude-haiku-4-5-20251001'].input + PRICING['claude-haiku-4-5-20251001'].output, 6);
  });

  it('prices Sonnet higher than Haiku for the same tokens', () => {
    const usage = { input: 500_000, output: 500_000 };
    expect(costOf('claude-sonnet-4-6', usage)).toBeGreaterThan(costOf('claude-haiku-4-5-20251001', usage));
  });

  it('falls back to a non-zero rate for an unknown model', () => {
    expect(costOf('mystery-model', { input: 1_000_000, output: 0 })).toBeGreaterThan(0);
    expect(isKnownModel('mystery-model')).toBe(false);
    expect(isKnownModel('claude-haiku-4-5-20251001')).toBe(true);
  });

  it('returns 0 for zero usage', () => {
    expect(costOf('claude-haiku-4-5-20251001', { input: 0, output: 0 })).toBe(0);
  });
});
