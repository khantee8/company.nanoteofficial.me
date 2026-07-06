// src/lib/agents/watchdog.ts — OperX self-heal (v1.11). Deterministic code
// heals; the OperX LLM run only narrates the sweep log. One retry per dept
// per day, flag written BEFORE the rerun so a crash can't loop.
import { DEPARTMENTS, isFrontendDept, type DeptId } from '@/lib/data/departments';
import type { AgentStatus, RunOverrides } from './types';
import type { RedisRepo } from '@/lib/redis';
import { runAgent } from './runner';
import { AGENTS } from './index';

/** Conservative retry settings — a thin report beats a dead one. The dept's
 *  next scheduled run uses its normal settings. */
export const SAFE_OVERRIDES: RunOverrides = { maxSearches: 1, model: 'claude-haiku-4-5-20251001' };

/** Pure: pick AT MOST ONE dept to heal (registry order). Backend depts are
 *  excluded — they synthesize internal state and are cheap to just rerun on
 *  their own schedule. */
export function decideRetry(statuses: AgentStatus[], retriedToday: DeptId[], disabled: DeptId[]): DeptId | null {
  for (const d of DEPARTMENTS) {
    if (!isFrontendDept(d.id)) continue;
    if (retriedToday.includes(d.id) || disabled.includes(d.id)) continue;
    if (statuses.find((s) => s.dept === d.id)?.state === 'error') return d.id;
  }
  return null;
}

export async function runSweep(deps: { repo: RedisRepo; notify: (t: string) => Promise<void> }):
  Promise<{ retried: DeptId | null; ok?: boolean }> {
  const { repo, notify } = deps;
  const date = new Date().toISOString().slice(0, 10);
  const [statuses, disabled] = await Promise.all([
    Promise.all(DEPARTMENTS.map((d) => repo.getStatus(d.id))),
    repo.getDisabledDepts(),
  ]);
  const retriedToday = (await Promise.all(
    DEPARTMENTS.map(async (d) => ((await repo.wasRetriedToday(d.id, date)) ? d.id : null)),
  )).filter((d): d is DeptId => d !== null);

  const dept = decideRetry(statuses, retriedToday, disabled);
  if (!dept) return { retried: null };

  await repo.markRetried(dept, date); // before the rerun — no retry loops
  try {
    const result = await runAgent({ dept, run: AGENTS[dept] }, { repo, notify }, SAFE_OVERRIDES);
    await repo.pushSweepLog({ dept, ok: true, detail: result.summary, ts: Date.now() });
    await notify(`🔧 OperX self-heal: ${dept.toUpperCase()} recovered`);
    return { retried: dept, ok: true };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await repo.pushSweepLog({ dept, ok: false, detail, ts: Date.now() });
    await notify(`🚨 OperX: ${dept.toUpperCase()} failed twice today — needs you (${detail.slice(0, 120)})`);
    return { retried: dept, ok: false };
  }
}
