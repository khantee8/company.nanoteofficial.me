import { describe, it, expect, vi, beforeEach } from 'vitest';
import { themeForToday, financeArtifacts } from './finance';

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

  it('sets incomplete=true when a completed run yields zero cited funds (research failure / rate limit)', async () => {
    // stop_reason is clean, but no fund survived citation validation — e.g. the
    // web_search tool was rate-limited mid-run, so the model wrote uncited funds.
    completeRaw.mockResolvedValue({
      text: 'รายงาน...```json findings\n{"theme":"thai-tax-funds","funds":[]}\n```',
      stopReason: 'end_turn',
      usage: { input: 10, output: 2000 },
    });
    const { run } = await import('./finance');
    const result = await run(ctx);
    expect(result.incomplete).toBe(true);
  });

  it('does NOT flag a healthy run with cited funds as incomplete', async () => {
    completeRaw.mockResolvedValue({
      text: 'รายงาน...```json findings\n' + JSON.stringify({
        theme: 'thai-tax-funds',
        funds: [{ name: 'A', amc: 'X', ter: 0.5, aum: 1000, masterFund: 'M', return1y: 8, hedged: true, taxType: 'ssf', citation: { url: 'https://a', title: 'A', date: '2026-06-01' } }],
      }) + '\n```',
      stopReason: 'end_turn',
      usage: { input: 10, output: 3000 },
    });
    const { run } = await import('./finance');
    const result = await run(ctx);
    expect(result.incomplete).toBe(false);
  });
});

describe('financeArtifacts', () => {
  const FX = { theme: 'thai-tax-funds', funds: [
    { name: 'A', amc: 'X', ter: 0.5, aum: 1000, masterFund: 'M', return1y: 8, hedged: true,  taxType: 'ssf'  as const, citation: { url: 'https://a', title: 'A', date: '2026-06-01' } },
    { name: 'B', amc: 'Y', ter: 0.9, aum: 500,  masterFund: 'N', return1y: 5, hedged: false, taxType: 'rmf'  as const, citation: { url: 'https://b', title: 'B', date: '2026-06-01' } },
  ]};
  it('builds an AUM bars chart', () => {
    const a = financeArtifacts(FX);
    expect(a.some((x) => x.kind === 'bars' && /AUM/i.test(x.title))).toBe(true);
  });
  it('builds a tax-type donut for tax-fund themes', () => {
    const a = financeArtifacts(FX);
    expect(a.some((x) => x.kind === 'donut')).toBe(true);
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
