import { describe, it, expect, vi, beforeEach } from 'vitest';
import { themeForToday } from './finance';

const completeRaw = vi.fn();
vi.mock('@/lib/claude', () => ({
  completeRaw: (...args: unknown[]) => completeRaw(...args),
}));

const ctx = {
  ownHistory: [],
  companyDigest: [],
  todayPeers: [],
};

describe('run — truncation flag', () => {
  beforeEach(() => {
    completeRaw.mockReset();
  });

  it('sets incomplete=true when the model stops on max_tokens', async () => {
    completeRaw.mockResolvedValue({
      text: '...```json findings\n{"theme":"x","funds":[]}\n```',
      stopReason: 'max_tokens',
      usage: { input: 10, output: 8000 },
    });
    const { run } = await import('./finance');
    const result = await run(ctx);
    expect(result.incomplete).toBe(true);
  });
});

describe('themeForToday', () => {
  it('returns us-index-sp500 on Monday (UTC day 1)', () => {
    // 2026-06-01 is a Monday
    const d = new Date('2026-06-01T12:00:00Z');
    expect(themeForToday(d).theme).toBe('us-index-sp500');
  });

  it('returns global-tech-semiconductor on Wednesday (UTC day 3)', () => {
    const d = new Date('2026-06-03T12:00:00Z');
    expect(themeForToday(d).theme).toBe('global-tech-semiconductor');
  });

  it('returns thai-tax-funds on Friday (UTC day 5)', () => {
    const d = new Date('2026-06-05T12:00:00Z');
    expect(themeForToday(d).theme).toBe('thai-tax-funds');
  });

  it('falls back to us-index-sp500 on unmapped days (Sunday = 0)', () => {
    const d = new Date('2026-06-07T12:00:00Z');
    expect(themeForToday(d).theme).toBe('us-index-sp500');
  });
});
