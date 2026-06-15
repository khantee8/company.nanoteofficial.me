import type { DeptId } from '@/lib/data/departments';
import type { UsageEntry } from './types';
import type { Severity } from './health';
import { costOf } from '@/lib/cost';

export interface DeptUsage { dept: DeptId; tokens: number; costUsd: number }

export interface UsageAggregate {
  perDept: DeptUsage[];
  mtdUsd: number;
  mtdTokens: number;
  last7dBurnUsdPerDay: number;
  projectedMonthEndUsd: number;
  daysLeftInMonth: number;
  budgetUsd: number | null;
  pctUsed: number | null;
}

const DAY_MS = 86_400_000;

function startOfMonthUtc(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}
function daysInMonthUtc(now: number): number {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
}

export function aggregateUsage(
  entries: UsageEntry[],
  opts: { now: number; budgetUsd: number | null },
): UsageAggregate {
  const { now } = opts;
  const budgetUsd = opts.budgetUsd && opts.budgetUsd > 0 ? opts.budgetUsd : null;
  const monthStart = startOfMonthUtc(now);
  const sevenDayStart = now - 7 * DAY_MS;

  const perDeptMap = new Map<DeptId, DeptUsage>();
  let mtdUsd = 0;
  let mtdTokens = 0;
  let last7dUsd = 0;

  for (const e of entries) {
    const cost = costOf(e.model, { input: e.input, output: e.output });
    const tokens = e.input + e.output;
    if (e.ts >= monthStart) {
      mtdUsd += cost;
      mtdTokens += tokens;
      const cur = perDeptMap.get(e.dept) ?? { dept: e.dept, tokens: 0, costUsd: 0 };
      cur.tokens += tokens;
      cur.costUsd += cost;
      perDeptMap.set(e.dept, cur);
    }
    if (e.ts >= sevenDayStart) last7dUsd += cost;
  }

  const perDept = [...perDeptMap.values()].sort((a, b) => b.costUsd - a.costUsd);
  const last7dBurnUsdPerDay = last7dUsd / 7;
  const daysLeftInMonth = daysInMonthUtc(now) - new Date(now).getUTCDate();
  const projectedMonthEndUsd = mtdUsd + last7dBurnUsdPerDay * daysLeftInMonth;
  const pctUsed = budgetUsd ? (mtdUsd / budgetUsd) * 100 : null;

  return { perDept, mtdUsd, mtdTokens, last7dBurnUsdPerDay, projectedMonthEndUsd, daysLeftInMonth, budgetUsd, pctUsed };
}

export function assessBudget(agg: UsageAggregate): { severity: Severity; detail: string } | null {
  if (agg.budgetUsd == null || agg.pctUsed == null) return null;
  const pct = Math.round(agg.pctUsed);
  const spend = `$${agg.mtdUsd.toFixed(2)} / $${agg.budgetUsd.toFixed(2)}`;
  if (agg.pctUsed >= 100) return { severity: 'critical', detail: `budget exceeded: ${spend} (${pct}%)` };
  if (agg.projectedMonthEndUsd > agg.budgetUsd) {
    return { severity: 'critical', detail: `projected overrun: ~$${agg.projectedMonthEndUsd.toFixed(2)} vs $${agg.budgetUsd.toFixed(2)} budget` };
  }
  if (agg.pctUsed >= 80) return { severity: 'warning', detail: `budget ${pct}% used: ${spend}` };
  return { severity: 'ok', detail: `budget ${pct}% used: ${spend}` };
}
