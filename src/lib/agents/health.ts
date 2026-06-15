import type { DeptId } from '@/lib/data/departments';
import type { AgentStatus, AgentState, DigestEntry, AgentOutputHealth } from './types';

export type Severity = 'critical' | 'warning' | 'info' | 'ok';

export interface HealthIssue {
  kind: 'error' | 'stale' | 'truncated' | 'empty' | 'flags';
  severity: Severity;
  detail: string;
}

export interface AgentHealth {
  dept: DeptId;
  severity: Severity;
  state: AgentState;
  lastRun: string | null;
  stale: boolean;
  issues: HealthIssue[];
}

export interface HealthInput {
  statuses: AgentStatus[];
  outputs: AgentOutputHealth[];
  digest: DigestEntry[];
  now: number;
}

const HOUR_MS = 3600_000;

// MIRRORS vercel.json cron schedules — update BOTH if cadence changes.
export const EXPECTED_CADENCE_HOURS: Record<DeptId, number> = {
  cyb: 24, ops: 24, fin: 72, rnd: 96, mkt: 96, ceo: 168,
};
const STALE_GRACE_HOURS = 12;

const SEVERITY_RANK: Record<Severity, number> = { ok: 0, info: 1, warning: 2, critical: 3 };

export function worst(severities: Severity[]): Severity {
  return severities.reduce<Severity>((a, b) => (SEVERITY_RANK[b] > SEVERITY_RANK[a] ? b : a), 'ok');
}

function daysAgo(ms: number): number {
  return Math.max(1, Math.round(ms / (24 * HOUR_MS)));
}

function assessOne(
  dept: DeptId,
  status: AgentStatus | undefined,
  output: AgentOutputHealth | undefined,
  flagCount: number,
  now: number,
): AgentHealth {
  const issues: HealthIssue[] = [];
  const state: AgentState = status?.state ?? 'idle';
  const lastRun = status?.lastRun ?? null;

  if (state === 'error') {
    issues.push({ kind: 'error', severity: 'critical', detail: `run failed: ${status?.error ?? 'unknown'}` });
  }

  const cadence = EXPECTED_CADENCE_HOURS[dept] ?? 24;
  const limitMs = (cadence + STALE_GRACE_HOURS) * HOUR_MS;
  let stale = false;
  if (!lastRun) {
    stale = true;
    issues.push({ kind: 'stale', severity: 'warning', detail: 'never run' });
  } else {
    const ageMs = now - new Date(lastRun).getTime();
    if (ageMs > limitMs * 2) {
      stale = true;
      issues.push({ kind: 'stale', severity: 'critical', detail: `severely stale: no run in ${daysAgo(ageMs)}d` });
    } else if (ageMs > limitMs) {
      stale = true;
      issues.push({ kind: 'stale', severity: 'warning', detail: `stale: no run in ${daysAgo(ageMs)}d` });
    }
  }

  if (output && (output.incomplete || output.stopReason === 'max_tokens')) {
    issues.push({ kind: 'truncated', severity: 'warning', detail: 'report truncated (max_tokens)' });
  }

  if (state === 'done' && output && output.artifactCount === 0) {
    issues.push({ kind: 'empty', severity: 'warning', detail: 'empty output (0 artifacts)' });
  }

  if (flagCount > 0) {
    issues.push({ kind: 'flags', severity: 'info', detail: `${flagCount} open flags` });
  }

  return { dept, state, lastRun, stale, issues, severity: worst(issues.map((i) => i.severity)) };
}

/** Pure assessment of every monitored agent. Ops excludes itself (it is mid-run). */
export function assessCompanyHealth(input: HealthInput): AgentHealth[] {
  const { statuses, outputs, digest, now } = input;
  const flagByDept = new Map<DeptId, number>();
  for (const e of digest) flagByDept.set(e.dept, (flagByDept.get(e.dept) ?? 0) + e.flags.length);

  return statuses
    .filter((s) => s.dept !== 'ops')
    .map((s) =>
      assessOne(s.dept, s, outputs.find((o) => o.dept === s.dept), flagByDept.get(s.dept) ?? 0, now),
    );
}

export function overallSeverity(healths: AgentHealth[]): Severity {
  return worst(healths.map((h) => h.severity));
}

export function criticalAlerts(healths: AgentHealth[]): AgentHealth[] {
  return healths.filter((h) => h.severity === 'critical');
}

const SEVERITY_EMOJI: Record<Severity, string> = { ok: '🟢', info: '🟢', warning: '🟡', critical: '🔴' };

/** One human-readable line per agent — fed into the Ops prompt. */
export function formatHealth(healths: AgentHealth[]): string {
  return healths
    .map((h) => {
      const detail = h.issues.length ? h.issues.map((i) => i.detail).join('; ') : 'healthy';
      return `${SEVERITY_EMOJI[h.severity]} ${h.dept.toUpperCase()}: ${detail}`;
    })
    .join('\n');
}
