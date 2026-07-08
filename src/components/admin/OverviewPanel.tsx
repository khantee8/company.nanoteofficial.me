'use client';

import { DEPARTMENTS, type DeptId } from '@/lib/data/departments';
import type { DashboardData, DashboardAgent } from '@/lib/dashboard';
import type { AgentState } from '@/lib/agents/types';

const STATE_COLOR: Record<AgentState, string> = {
  done: '#3fb950', running: '#d29922', error: '#f85149', idle: '#6e7681', queued: '#d29922',
};

const deptName = (id: DeptId) => DEPARTMENTS.find((d) => d.id === id)?.name ?? id;

// A single agent's coarse health: error → down, truncated/never-run → warn, else ok.
type Health = 'ok' | 'warn' | 'down';
function agentHealth(a: DashboardAgent): Health {
  const state = a.status?.state ?? 'idle';
  if (state === 'error') return 'down';
  if (a.output?.incomplete || state === 'idle') return 'warn';
  return 'ok';
}

/** Pull "spend (MTD)" out of the Operations `cost & budget` table artifact. */
function costMtd(agents: DashboardAgent[]): string {
  const ops = agents.find((a) => a.dept === 'ops');
  const table = ops?.output?.artifacts?.find(
    (art) => art.kind === 'table' && art.title === 'cost & budget',
  );
  if (!table || table.kind !== 'table') return '—';
  const row = table.rows.find((r) => String(r[0]).startsWith('spend (MTD)'));
  return row ? String(row[1]) : '—';
}

function lastActivity(agents: DashboardAgent[]): string {
  const times = agents
    .map((a) => a.output?.ts ?? a.status?.lastRun)
    .filter((t): t is string => !!t)
    .map((t) => new Date(t).getTime())
    .filter((n) => Number.isFinite(n));
  if (times.length === 0) return '—';
  return new Date(Math.max(...times)).toLocaleString();
}

export function OverviewPanel({ data }: { data: DashboardData | null }) {
  const agents = data?.agents ?? [];

  if (agents.length === 0) {
    return <div style={emptyStyle}>No agent data yet. Trigger a run from the Agents section.</div>;
  }

  const health = agents.map(agentHealth);
  const ok = health.filter((h) => h === 'ok').length;
  const warn = health.filter((h) => h === 'warn').length;
  const down = health.filter((h) => h === 'down').length;

  const tiles: { label: string; value: string | number; color: string }[] = [
    { label: 'Healthy', value: ok, color: '#3fb950' },
    { label: 'Warnings', value: warn, color: '#d29922' },
    { label: 'Down', value: down, color: '#f85149' },
    { label: 'Cost (MTD)', value: costMtd(agents), color: '#58a6ff' },
    { label: 'Last activity', value: lastActivity(agents), color: '#8b949e' },
  ];

  return (
    <div style={wrapStyle}>
      <h2 style={headingStyle}>Overview</h2>

      <div style={tileRowStyle}>
        {tiles.map((t) => (
          <div key={t.label} style={tileStyle}>
            <div style={{ ...tileValueStyle, color: t.color }}>{t.value}</div>
            <div style={tileLabelStyle}>{t.label}</div>
          </div>
        ))}
      </div>

      <div style={listStyle}>
        {agents.map((a) => {
          const h = agentHealth(a);
          const state = a.status?.state ?? 'idle';
          const when = a.output?.ts
            ? new Date(a.output.ts).toLocaleString()
            : a.status?.lastRun
              ? new Date(a.status.lastRun).toLocaleString()
              : '—';
          const summary = a.status?.summary ?? a.output?.summary ?? '';
          return (
            <div key={a.dept} style={rowStyle}>
              <span style={{ ...rowDot, background: STATE_COLOR[state] }} title={h} />
              <strong style={rowNameStyle}>{deptName(a.dept)}</strong>
              <span style={rowSummaryStyle}>{summary}</span>
              {a.output?.incomplete && <span style={warnPillStyle}>truncated</span>}
              <span style={rowWhenStyle}>{when}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── styles ────────────────────────────────────────────────────────────
const wrapStyle: React.CSSProperties = { padding: 24, color: '#c9d1d9' };
const headingStyle: React.CSSProperties = { fontSize: 16, margin: '0 0 16px', color: '#fff', letterSpacing: 0.5 };
const emptyStyle: React.CSSProperties = { padding: 24, color: '#6e7681', fontSize: 13, fontStyle: 'italic' };
const tileRowStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24 };
const tileStyle: React.CSSProperties = {
  flex: '1 1 130px', minWidth: 130, background: '#0d1117', border: '1px solid #21262d',
  borderRadius: 10, padding: '14px 16px',
};
const tileValueStyle: React.CSSProperties = { fontSize: 22, fontWeight: 700, lineHeight: 1.1, wordBreak: 'break-word' };
const tileLabelStyle: React.CSSProperties = { fontSize: 11, color: '#8b949e', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 };
const listStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 1, background: '#21262d', border: '1px solid #21262d', borderRadius: 10, overflow: 'hidden' };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: '#0d1117' };
const rowDot: React.CSSProperties = { width: 9, height: 9, borderRadius: '50%', flexShrink: 0 };
const rowNameStyle: React.CSSProperties = { fontSize: 13, color: '#e6edf3', minWidth: 150, flexShrink: 0 };
const rowSummaryStyle: React.CSSProperties = { fontSize: 12, color: '#8b949e', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const warnPillStyle: React.CSSProperties = { fontSize: 9, color: '#d29922', border: '1px solid #d2992266', borderRadius: 10, padding: '1px 8px', flexShrink: 0 };
const rowWhenStyle: React.CSSProperties = { fontSize: 10, color: '#6e7681', flexShrink: 0, whiteSpace: 'nowrap' };
