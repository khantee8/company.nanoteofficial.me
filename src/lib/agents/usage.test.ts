import { describe, it, expect } from 'vitest';
import { aggregateUsage, assessBudget } from './usage';
import type { UsageEntry } from './types';

// 2026-06-15T12:00:00Z — mid-June, UTC.
const NOW = Date.UTC(2026, 5, 15, 12, 0, 0);
const DAY = 86_400_000;

const sonnet = (ts: number, output: number): UsageEntry =>
  ({ dept: 'fin', model: 'claude-sonnet-4-6', input: 0, output, ts });

describe('aggregateUsage', () => {
  it('sums only the current calendar month (UTC) into MTD', () => {
    const entries: UsageEntry[] = [
      sonnet(Date.UTC(2026, 5, 2), 1_000_000),  // June — counted
      sonnet(Date.UTC(2026, 4, 30), 1_000_000), // May  — excluded from MTD
    ];
    const agg = aggregateUsage(entries, { now: NOW, budgetUsd: null });
    expect(agg.mtdTokens).toBe(1_000_000);
    expect(agg.mtdUsd).toBeCloseTo(15, 6); // 1M out @ $15/Mtok
  });

  // v1.12.2 — batch runs bill at 50%; the ledger must not overstate them.
  it('prices batch-flagged entries at half rate', () => {
    const entries: UsageEntry[] = [
      { ...sonnet(Date.UTC(2026, 5, 2), 1_000_000), batch: true },
    ];
    const agg = aggregateUsage(entries, { now: NOW, budgetUsd: null });
    expect(agg.mtdUsd).toBeCloseTo(7.5, 6); // 1M out @ $15/Mtok × 50%
  });

  it('computes a 7-day burn-per-day average', () => {
    const entries = [sonnet(NOW - 2 * DAY, 1_000_000)]; // $15 in last 7d
    const agg = aggregateUsage(entries, { now: NOW, budgetUsd: null });
    expect(agg.last7dBurnUsdPerDay).toBeCloseTo(15 / 7, 6);
  });

  it('projects month-end from burn × days left', () => {
    const entries = [sonnet(NOW - 1 * DAY, 700_000)];
    const agg = aggregateUsage(entries, { now: NOW, budgetUsd: 30 });
    expect(agg.daysLeftInMonth).toBe(15); // June has 30 days; day 15 → 15 left
    expect(agg.projectedMonthEndUsd).toBeCloseTo(agg.mtdUsd + agg.last7dBurnUsdPerDay * 15, 6);
  });

  it('treats budget<=0 / null as display-only (pctUsed null)', () => {
    const agg0 = aggregateUsage([sonnet(NOW, 1_000_000)], { now: NOW, budgetUsd: 0 });
    expect(agg0.budgetUsd).toBeNull();
    expect(agg0.pctUsed).toBeNull();
  });

  it('groups per-dept cost, sorted desc', () => {
    const entries: UsageEntry[] = [
      { dept: 'cyb', model: 'claude-haiku-4-5-20251001', input: 0, output: 1_000_000, ts: NOW }, // $5
      { dept: 'fin', model: 'claude-sonnet-4-6', input: 0, output: 1_000_000, ts: NOW },          // $15
    ];
    const agg = aggregateUsage(entries, { now: NOW, budgetUsd: null });
    expect(agg.perDept.map((d) => d.dept)).toEqual(['fin', 'cyb']);
  });

  it('handles an empty ledger', () => {
    const agg = aggregateUsage([], { now: NOW, budgetUsd: 30 });
    expect(agg.mtdUsd).toBe(0);
    expect(agg.pctUsed).toBe(0);
  });

  it('does not let last month bleed into the month-start burn/projection', () => {
    const jun3 = Date.UTC(2026, 5, 3, 12, 0, 0);
    const entries = [
      sonnet(Date.UTC(2026, 4, 28), 4_000_000), // May 28: $60 — huge, prior month
      sonnet(Date.UTC(2026, 5, 2), 33_000),      // June 2: ~$0.50, this month
    ];
    const agg = aggregateUsage(entries, { now: jun3, budgetUsd: 30 });
    expect(agg.mtdUsd).toBeCloseTo(0.495, 3);             // June only, May excluded
    expect(agg.last7dBurnUsdPerDay).toBeCloseTo(0.495 / 3, 6); // window clamped to month start, ÷ days elapsed
    expect(agg.projectedMonthEndUsd).toBeLessThan(30);    // NOT inflated by May's spend
    expect(assessBudget(agg)!.severity).not.toBe('critical');
  });
});

describe('assessBudget', () => {
  const mk = (over: Partial<ReturnType<typeof aggregateUsage>>) =>
    ({ perDept: [], mtdUsd: 0, mtdTokens: 0, last7dBurnUsdPerDay: 0, projectedMonthEndUsd: 0,
       daysLeftInMonth: 15, budgetUsd: 30, pctUsed: 0, ...over });

  it('returns null when display-only', () => {
    expect(assessBudget(mk({ budgetUsd: null, pctUsed: null }))).toBeNull();
  });
  it('ok below 80%', () => {
    expect(assessBudget(mk({ mtdUsd: 23.7, pctUsed: 79 }))!.severity).toBe('ok');
  });
  it('warning at >=80%', () => {
    expect(assessBudget(mk({ mtdUsd: 24, pctUsed: 80 }))!.severity).toBe('warning');
  });
  it('critical at >=100%', () => {
    expect(assessBudget(mk({ mtdUsd: 31, pctUsed: 103 }))!.severity).toBe('critical');
  });
  it('critical on projected overrun even below 100% MTD', () => {
    expect(assessBudget(mk({ mtdUsd: 15, pctUsed: 50, projectedMonthEndUsd: 45 }))!.severity).toBe('critical');
  });
});
