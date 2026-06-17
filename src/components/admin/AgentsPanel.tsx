'use client';

import { useEffect, useState } from 'react';
import { AgentInspector } from './AgentInspector';
import { DEPARTMENTS, type DeptId } from '@/lib/data/departments';
import type { DashboardData, DashboardAgent } from '@/lib/dashboard';
import type { AgentState } from '@/lib/agents/types';

const STATE_COLOR: Record<AgentState, string> = {
  done: '#3fb950', running: '#d29922', error: '#f85149', idle: '#6e7681',
};

// Human cadence labels mirroring vercel.json crons.
const CADENCE: Record<DeptId, string> = {
  cyb: 'daily', ops: 'daily', fin: 'Mon/Wed/Fri', rnd: 'Tue/Thu', mkt: 'Mon/Thu', ceo: 'Sun',
};

function ageLabel(agent: DashboardAgent): string {
  const ts = agent.output?.ts ?? agent.status?.lastRun;
  if (!ts) return 'never';
  const ms = Date.now() - new Date(ts).getTime();
  if (!Number.isFinite(ms)) return '—';
  const h = Math.floor(ms / 3.6e6);
  if (h < 1) return `${Math.max(0, Math.floor(ms / 6e4))}m ago`;
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface Props {
  data: DashboardData | null;
  selectedDept: DeptId | null;
  onSelect: (dept: DeptId) => void;
  onRan: () => void;
}

export function AgentsPanel({ data, selectedDept, onSelect, onRan }: Props) {
  const [disabled, setDisabled] = useState<DeptId[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/admin/agent', { cache: 'no-store' });
        const json = (await res.json()) as { disabled: DeptId[] };
        if (alive) setDisabled(json.disabled ?? []);
      } catch {
        /* keep empty */
      }
    })();
    return () => { alive = false; };
  }, []);

  const setDeptDisabled = (dept: DeptId, next: boolean) =>
    setDisabled((cur) => (next ? [...new Set([...cur, dept])] : cur.filter((d) => d !== dept)));

  const agentFor = (dept: DeptId): DashboardAgent | undefined =>
    data?.agents.find((a) => a.dept === dept);

  const selected = selectedDept ? agentFor(selectedDept) : undefined;

  return (
    <div style={splitStyle}>
      {/* Agent list */}
      <div style={listColStyle}>
        {DEPARTMENTS.map((d) => {
          const a = agentFor(d.id);
          const state = (a?.status?.state ?? 'idle') as AgentState;
          const isSel = d.id === selectedDept;
          const isOff = disabled.includes(d.id);
          return (
            <button key={d.id} onClick={() => onSelect(d.id)} style={isSel ? rowSelStyle : rowStyle}>
              <span style={{ ...dotStyle, background: STATE_COLOR[state] }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={rowNameStyle}>{d.name}</span>
                <span style={rowMetaStyle}>{CADENCE[d.id]} · {a ? ageLabel(a) : 'never'}</span>
              </span>
              {isOff && <span style={offPillStyle}>paused</span>}
            </button>
          );
        })}
      </div>

      {/* Inspector */}
      <div style={inspectorColStyle}>
        {selectedDept && selected ? (
          <AgentInspector
            dept={selectedDept}
            agent={selected}
            disabled={disabled.includes(selectedDept)}
            onToggleDisabled={(next) => setDeptDisabled(selectedDept, next)}
            onRan={onRan}
          />
        ) : selectedDept ? (
          <div style={emptyStyle}>No data for this agent yet — run it to populate.</div>
        ) : (
          <div style={emptyStyle}>Select an agent to inspect.</div>
        )}
      </div>
    </div>
  );
}

// ── styles ────────────────────────────────────────────────────────────
const splitStyle: React.CSSProperties = { display: 'flex', height: '100%', minHeight: 0 };
const listColStyle: React.CSSProperties = { width: 260, minWidth: 220, borderRight: '1px solid #21262d', padding: 10, display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' };
const rowBase: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', borderRadius: 7, border: '1px solid transparent', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', width: '100%' };
const rowStyle: React.CSSProperties = { ...rowBase };
const rowSelStyle: React.CSSProperties = { ...rowBase, background: '#161b22', border: '1px solid #30363d' };
const dotStyle: React.CSSProperties = { width: 9, height: 9, borderRadius: '50%', flexShrink: 0 };
const rowNameStyle: React.CSSProperties = { display: 'block', fontSize: 13, color: '#e6edf3', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
const rowMetaStyle: React.CSSProperties = { display: 'block', fontSize: 10, color: '#6e7681', marginTop: 2 };
const offPillStyle: React.CSSProperties = { fontSize: 9, color: '#d29922', border: '1px solid #d2992255', borderRadius: 10, padding: '1px 7px', flexShrink: 0 };
const inspectorColStyle: React.CSSProperties = { flex: 1, overflowY: 'auto', minWidth: 0 };
const emptyStyle: React.CSSProperties = { padding: 24, color: '#6e7681', fontSize: 13, fontStyle: 'italic' };
