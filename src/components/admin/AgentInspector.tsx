'use client';

import { useState } from 'react';
import { Markdown } from '../Markdown';
import { DEPARTMENTS, type DeptId } from '@/lib/data/departments';
import { parseHighlight } from '@/lib/agents/runner';
import type { DashboardAgent } from '@/lib/dashboard';
import type { AgentState } from '@/lib/agents/types';
import { exportMarkdown, exportPdf, exportHistoryCsv } from './exporters';

const STATE_COLOR: Record<AgentState, string> = {
  done: '#3fb950', running: '#d29922', error: '#f85149', idle: '#6e7681',
};

// Human cadence labels mirroring vercel.json crons.
const CADENCE: Record<DeptId, string> = {
  cyb: 'daily', ops: 'daily', fin: 'Mon/Wed/Fri', rnd: 'Tue/Thu', mkt: 'Mon/Thu', ceo: 'Sun',
};

// Model choices for run-with-options (PRICING keys in cost.ts; haiku is the default).
const MODEL_OPTIONS = [
  { value: '', label: 'Default (Haiku)' },
  { value: 'claude-sonnet-4-6', label: 'Sonnet 4.6' },
  { value: 'claude-opus-4-8', label: 'Opus 4.8' },
];

interface Props {
  dept: DeptId;
  agent: DashboardAgent;
  disabled: boolean;
  onToggleDisabled: (next: boolean) => void;
  onRan: () => void;
}

export function AgentInspector({ dept, agent, disabled, onToggleDisabled, onRan }: Props) {
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState('');
  const [showReport, setShowReport] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [maxSearches, setMaxSearches] = useState('');
  const [model, setModel] = useState('');

  const meta = DEPARTMENTS.find((d) => d.id === dept);
  const name = meta?.name ?? dept;
  const state = (agent.status?.state ?? 'idle') as AgentState;
  const md = agent.output?.markdown ?? '';
  const when = agent.output?.ts
    ? new Date(agent.output.ts).toLocaleString()
    : agent.status?.lastRun ? new Date(agent.status.lastRun).toLocaleString() : '—';

  const run = async (overrides?: { maxSearches?: number; model?: string }) => {
    setRunning(true);
    setMsg(`Running ${name}…`);
    try {
      const res = await fetch(`/api/admin/run?dept=${dept}`, {
        method: 'POST',
        headers: overrides ? { 'Content-Type': 'application/json' } : undefined,
        body: overrides ? JSON.stringify({ overrides }) : undefined,
      });
      if (res.status === 401) { setMsg('✕ Session expired — sign in again.'); return; }
      const j = await res.json().catch(() => ({}));
      if (j.ok) { setMsg(`✓ ${j.summary ?? 'done'}`); onRan(); }
      else setMsg(`✕ failed: ${j.error ?? res.status}`);
    } catch {
      setMsg('✕ run failed (network).');
    } finally {
      setRunning(false);
    }
  };

  const toggleDisabled = async () => {
    const next = !disabled;
    onToggleDisabled(next); // optimistic
    try {
      const res = await fetch('/api/admin/agent', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dept, disabled: next }),
      });
      if (!res.ok) onToggleDisabled(disabled); // revert on failure
    } catch {
      onToggleDisabled(disabled);
    }
  };

  const submitOptions = () => {
    const overrides: { maxSearches?: number; model?: string } = {};
    const n = parseInt(maxSearches, 10);
    if (Number.isFinite(n) && n > 0) overrides.maxSearches = n;
    if (model) overrides.model = model;
    void run(Object.keys(overrides).length ? overrides : undefined);
  };

  return (
    <div style={wrapStyle}>
      <div style={headStyle}>
        <span style={{ ...dotStyle, background: meta?.color ?? '#7f8cff' }} />
        <strong style={{ fontSize: 15, color: '#fff' }}>{name}</strong>
        <span style={{ ...statePillStyle, color: STATE_COLOR[state], borderColor: STATE_COLOR[state] + '66' }}>{state}</span>
      </div>

      {/* Telemetry */}
      <dl style={telemetryStyle}>
        <Row k="Last run" v={when} />
        <Row k="Cadence" v={CADENCE[dept]} />
        <Row k="Summary" v={agent.status?.summary ?? agent.output?.summary ?? '—'} />
        {agent.output?.incomplete && <Row k="Flags" v="⚠ truncated (max_tokens)" warn />}
        {state === 'error' && <Row k="Flags" v="🔴 last run errored" warn />}
      </dl>

      {/* Controls */}
      <div style={controlsStyle}>
        <button onClick={() => void run()} disabled={running} style={{ ...runBtn, opacity: running ? 0.6 : 1 }}>
          {running ? '… running' : '▶ Run now'}
        </button>
        <button onClick={() => setShowOptions((v) => !v)} disabled={running} style={btn}>⚙ Run with options…</button>
        <button onClick={toggleDisabled} style={disabled ? enableBtn : disableBtn}>
          {disabled ? '✓ Enable scheduled runs' : '⏸ Disable scheduled runs'}
        </button>
      </div>

      {disabled && <div style={disabledNoteStyle}>Scheduled cron runs are paused for this agent. Manual runs still work.</div>}

      {showOptions && (
        <div style={optionsStyle}>
          <label style={optLabel}>maxSearches
            <input type="number" min={1} max={10} value={maxSearches} onChange={(e) => setMaxSearches(e.target.value)} placeholder="default" style={optInput} />
          </label>
          <label style={optLabel}>model
            <select value={model} onChange={(e) => setModel(e.target.value)} style={optInput}>
              {MODEL_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          <button onClick={submitOptions} disabled={running} style={runBtn}>Run</button>
        </div>
      )}

      {msg && <div style={msgStyle}>{msg}</div>}

      {/* Report */}
      {md && (
        <div style={{ marginTop: 14 }}>
          <button onClick={() => setShowReport((v) => !v)} style={linkBtn}>
            {showReport ? '▾' : '▸'} Latest report
          </button>
          {!showReport && <span style={previewStyle}>{parseHighlight(md) || agent.output?.summary}</span>}
          {showReport && (
            <>
              <div style={exportRowStyle}>
                <button onClick={() => exportMarkdown(dept, md)} style={miniBtn}>MD</button>
                <button onClick={() => exportPdf(name, md)} style={miniBtn}>PDF</button>
                <button onClick={() => exportHistoryCsv(dept, agent.history)} disabled={!agent.history.length} style={miniBtn}>CSV</button>
              </div>
              <div style={reportStyle}><Markdown text={md} /></div>
            </>
          )}
        </div>
      )}

      {/* History */}
      {agent.history.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={subHeadStyle}>History ({agent.history.length})</div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
            {agent.history.map((h, i) => (
              <li key={i} style={histRowStyle}>
                <span style={{ color: '#6e7681' }}>{h.date}</span>
                <span style={{ color: '#8b949e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.highlight || h.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div style={rowStyle}>
      <dt style={dtStyle}>{k}</dt>
      <dd style={{ ...ddStyle, color: warn ? '#d29922' : '#c9d1d9' }}>{v}</dd>
    </div>
  );
}

// ── styles ────────────────────────────────────────────────────────────
const wrapStyle: React.CSSProperties = { padding: 18, color: '#c9d1d9' };
const headStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 };
const dotStyle: React.CSSProperties = { width: 11, height: 11, borderRadius: '50%', flexShrink: 0 };
const statePillStyle: React.CSSProperties = { marginLeft: 'auto', fontSize: 9, padding: '2px 9px', borderRadius: 20, border: '1px solid', textTransform: 'uppercase', letterSpacing: 1 };
const telemetryStyle: React.CSSProperties = { margin: 0, background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, padding: '4px 12px' };
const rowStyle: React.CSSProperties = { display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid #161b22' };
const dtStyle: React.CSSProperties = { fontSize: 11, color: '#6e7681', minWidth: 80, flexShrink: 0 };
const ddStyle: React.CSSProperties = { fontSize: 12, margin: 0, flex: 1, wordBreak: 'break-word' };
const controlsStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 };
const btn: React.CSSProperties = { background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: 6, fontSize: 11, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' };
const runBtn: React.CSSProperties = { ...btn, background: '#0a2a1c', border: '1px solid #1f8f5b', color: '#39ff9d' };
const disableBtn: React.CSSProperties = { ...btn, color: '#d29922', borderColor: '#d2992255' };
const enableBtn: React.CSSProperties = { ...btn, color: '#3fb950', borderColor: '#3fb95055' };
const disabledNoteStyle: React.CSSProperties = { marginTop: 8, fontSize: 11, color: '#d29922', background: '#21160a', border: '1px solid #4a3410', borderRadius: 6, padding: '6px 10px' };
const optionsStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', marginTop: 10, background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, padding: 12 };
const optLabel: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 10, color: '#8b949e' };
const optInput: React.CSSProperties = { background: '#161b22', border: '1px solid #30363d', color: '#c9d1d9', borderRadius: 5, padding: '5px 8px', fontSize: 12, fontFamily: 'inherit', minWidth: 120 };
const msgStyle: React.CSSProperties = { marginTop: 10, fontSize: 12, color: '#c9d1d9' };
const linkBtn: React.CSSProperties = { background: 'transparent', border: 'none', color: '#58a6ff', fontSize: 12, cursor: 'pointer', padding: 0, fontFamily: 'inherit' };
const previewStyle: React.CSSProperties = { marginLeft: 8, fontSize: 12, color: '#8b949e' };
const exportRowStyle: React.CSSProperties = { display: 'flex', gap: 6, margin: '8px 0' };
const miniBtn: React.CSSProperties = { background: '#161b22', border: '1px solid #30363d', color: '#8b949e', borderRadius: 5, fontSize: 10, padding: '3px 10px', cursor: 'pointer', fontFamily: 'inherit' };
const reportStyle: React.CSSProperties = { maxHeight: 360, overflowY: 'auto', background: '#08080f', border: '1px solid #161b22', borderRadius: 8, padding: '10px 12px' };
const subHeadStyle: React.CSSProperties = { fontSize: 11, color: '#6e7681', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 };
const histRowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '84px 1fr', gap: 8, fontSize: 10, padding: '3px 0' };
