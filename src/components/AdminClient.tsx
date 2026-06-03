'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Markdown } from './Markdown';
import { KbManager } from './KbManager';
import { DEPARTMENTS, type DeptId } from '@/lib/data/departments';
import { parseHighlight, parseFlags } from '@/lib/agents/runner';
import type { DashboardData, DashboardAgent } from '@/lib/dashboard';
import type { AgentState, HistoryEntry } from '@/lib/agents/types';

const STATE_COLOR: Record<AgentState, string> = {
  done: '#00ff88', running: '#ffaa00', error: '#ff5470', idle: '#5a5a78',
};
const STATE_LABEL: Record<AgentState, string> = {
  done: 'done', running: 'running', error: 'error', idle: 'idle',
};

const deptMeta = (id: DeptId) => DEPARTMENTS.find((d) => d.id === id);

// ── export helpers (dependency-free) ──────────────────────────────────
function downloadBlob(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function exportMarkdown(name: string, markdown: string) {
  downloadBlob(`${name}.md`, markdown, 'text/markdown');
}

/** Guard against CSV/Excel formula injection in exported cells. */
function csvCell(value: string): string {
  let v = String(value ?? '');
  if (/^[=+\-@]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

function exportHistoryCsv(name: string, history: HistoryEntry[]) {
  const rows = [['date', 'summary', 'highlight'], ...history.map((h) => [h.date, h.summary, h.highlight])];
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  downloadBlob(`${name}-history.csv`, csv, 'text/csv');
}

function exportPdf(title: string, markdown: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  const d = w.document;
  const style = d.createElement('style');
  style.textContent =
    `body{font-family:Georgia,'Times New Roman',serif;max-width:720px;margin:36px auto;padding:0 24px;line-height:1.6;color:#111}` +
    `h1{font-size:20px;border-bottom:2px solid #333;padding-bottom:8px}` +
    `pre{white-space:pre-wrap;word-wrap:break-word;font-family:inherit;font-size:13px;margin:0}` +
    `footer{margin-top:24px;color:#888;font-size:11px}`;
  d.head.appendChild(style);
  d.title = `${title} — NaNote Corp`;
  const h1 = d.createElement('h1'); h1.textContent = title;
  const pre = d.createElement('pre'); pre.textContent = markdown;
  const footer = d.createElement('footer');
  footer.textContent = `NaNote Corp · company.nanoteofficial.me · exported ${new Date().toLocaleString()}`;
  d.body.append(h1, pre, footer);
  setTimeout(() => w.print(), 300);
}

// ── component ─────────────────────────────────────────────────────────
export function AdminClient() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<DeptId | null>(null);
  const [runMsg, setRunMsg] = useState<string>('');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      setData((await res.json()) as DashboardData);
    } catch {
      /* keep last */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/dashboard', { cache: 'no-store' });
        const json = (await res.json()) as DashboardData;
        if (alive) setData(json);
      } catch {
        /* keep last */
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const logout = async () => {
    try { await fetch('/api/admin/logout', { method: 'POST' }); } catch { /* ignore */ }
    router.refresh();
  };

  const runDept = async (dept: DeptId) => {
    setRunning(dept); setRunMsg(`Running ${dept.toUpperCase()}…`);
    try {
      const res = await fetch(`/api/admin/run?dept=${dept}`, { method: 'POST' });
      if (res.status === 401) { setRunMsg('✕ Session expired — sign in again.'); router.refresh(); return; }
      const j = await res.json().catch(() => ({}));
      if (j.ok) { setRunMsg(`✓ ${dept.toUpperCase()} — ${j.summary ?? 'done'}`); await fetchData(); }
      else setRunMsg(`✕ ${dept.toUpperCase()} failed: ${j.error ?? res.status}`);
    } catch {
      setRunMsg(`✕ ${dept.toUpperCase()} run failed (network).`);
    } finally {
      setRunning(null);
    }
  };

  const agents = data?.agents ?? [];
  const counts = agents.reduce<Record<string, number>>((acc, a) => {
    const s = a.status?.state ?? 'idle';
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="dash">
      <header style={topStyle}>
        <div>
          <h1 style={titleStyle}>Admin Console</h1>
          <p style={subtitleStyle}>
            Operational view — trigger runs and inspect raw agent data.{' '}
            {data && <span style={{ color: '#444' }}>updated {new Date(data.generatedAt).toLocaleString()}</span>}
          </p>
        </div>
        <div style={controlsStyle}>
          <button onClick={fetchData} style={btnStyle}>↻ Refresh</button>
          <button onClick={logout} style={logoutStyle}>Sign out</button>
        </div>
      </header>

      <div style={overviewStyle}>
        {(['done', 'running', 'idle', 'error'] as AgentState[]).map((s) => (
          <div key={s} style={statChipStyle}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: STATE_COLOR[s], display: 'inline-block' }} />
            <strong style={{ color: '#ddd' }}>{counts[s] ?? 0}</strong>
            <span style={{ color: '#666' }}>{STATE_LABEL[s]}</span>
          </div>
        ))}
        {runMsg && <div style={{ ...statChipStyle, color: '#cfcfe6', flex: 1, minWidth: 0 }}>{runMsg}</div>}
      </div>

      {loading && agents.length === 0 ? (
        <div style={{ color: '#555', fontSize: 12, padding: 24 }}>Loading agent data…</div>
      ) : agents.length === 0 ? (
        <div style={{ color: '#555', fontSize: 12, padding: 24 }}>No agent data yet.</div>
      ) : (
        <div className="dash-grid">
          {agents.map((a) => (
            <AgentCard key={a.dept} agent={a} running={running === a.dept} onRun={() => runDept(a.dept)} />
          ))}
        </div>
      )}

      <KbManager />
    </div>
  );
}

function AgentCard({ agent, running, onRun }: { agent: DashboardAgent; running: boolean; onRun: () => void }) {
  const [openHistory, setOpenHistory] = useState(false);
  const meta = deptMeta(agent.dept);
  const name = meta?.name ?? agent.dept;
  const color = meta?.color ?? '#7f8cff';
  const state = (agent.status?.state ?? 'idle') as AgentState;
  const md = agent.output?.markdown ?? '';
  const highlight = md ? parseHighlight(md) : agent.status?.summary ?? '';
  const flags = md ? parseFlags(md) : [];
  const when = agent.output?.ts
    ? new Date(agent.output.ts).toLocaleString()
    : agent.status?.lastRun ? new Date(agent.status.lastRun).toLocaleString() : '—';

  return (
    <section style={{ ...cardStyle, borderTopColor: color }}>
      <div style={cardHeadStyle}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <strong style={{ color: '#fff', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</strong>
        </span>
        <span style={{ ...pillStyle, color: STATE_COLOR[state], borderColor: STATE_COLOR[state] + '66' }}>{STATE_LABEL[state]}</span>
      </div>
      <div style={metaLineStyle}>updated {when}</div>

      {highlight && <p style={highlightStyle}>{highlight}</p>}

      {flags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
          {flags.map((f, i) => <span key={i} style={flagChipStyle}>⚑ {f}</span>)}
        </div>
      )}

      <div style={artifactStyle}>
        {md ? <Markdown text={md} /> : <div style={{ color: '#444', fontSize: 11 }}>No artifact yet.</div>}
      </div>

      {agent.history.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <button onClick={() => setOpenHistory((v) => !v)} style={historyToggleStyle}>
            {openHistory ? '▾' : '▸'} History ({agent.history.length})
          </button>
          {openHistory && (
            <ul style={{ margin: '6px 0 0', padding: 0, listStyle: 'none' }}>
              {agent.history.map((h, i) => (
                <li key={i} style={historyRowStyle}>
                  <span style={{ color: '#666' }}>{h.date}</span>
                  <span style={{ color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.highlight || h.summary}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div style={actionsStyle}>
        <button onClick={() => exportMarkdown(agent.dept, md)} disabled={!md} style={miniBtn}>MD</button>
        <button onClick={() => exportPdf(name, md)} disabled={!md} style={miniBtn}>PDF</button>
        <button onClick={() => exportHistoryCsv(agent.dept, agent.history)} disabled={!agent.history.length} style={miniBtn}>CSV</button>
        <button onClick={onRun} disabled={running} style={{ ...runBtn, opacity: running ? 0.6 : 1 }}>
          {running ? '… running' : '▶ Run now'}
        </button>
      </div>
    </section>
  );
}

// ── styles ────────────────────────────────────────────────────────────
const topStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 };
const titleStyle: React.CSSProperties = { color: '#fff', fontSize: 18, margin: 0, letterSpacing: 1 };
const subtitleStyle: React.CSSProperties = { color: '#777', fontSize: 11, margin: '4px 0 0' };
const controlsStyle: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center' };
const btnStyle: React.CSSProperties = { background: '#14142e', border: '1px solid #3a3a6a', color: '#cfcfe6', borderRadius: 8, fontSize: 11, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' };
const logoutStyle: React.CSSProperties = { background: '#2a1018', border: '1px solid #6a2a3a', color: '#ff8aa0', borderRadius: 8, fontSize: 11, padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit' };
const overviewStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 };
const statChipStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, background: '#0c0c20', border: '1px solid #1a1a3a', borderRadius: 8, padding: '6px 12px', fontSize: 11 };
const cardStyle: React.CSSProperties = { background: '#0b0b1e', border: '1px solid #1a1a3a', borderTop: '3px solid #7f8cff', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column' };
const cardHeadStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 };
const pillStyle: React.CSSProperties = { fontSize: 9, padding: '2px 9px', borderRadius: 20, border: '1px solid', textTransform: 'uppercase', letterSpacing: 1, flexShrink: 0 };
const metaLineStyle: React.CSSProperties = { fontSize: 8, color: '#555', margin: '4px 0 8px' };
const highlightStyle: React.CSSProperties = { fontSize: 11, lineHeight: 1.5, color: '#cfcfe6', margin: '0 0 8px', borderLeft: '2px solid #2a2a4a', paddingLeft: 8 };
const flagChipStyle: React.CSSProperties = { fontSize: 9, color: '#ffb45a', background: '#2a1e08', border: '1px solid #4a3410', borderRadius: 6, padding: '2px 7px' };
const artifactStyle: React.CSSProperties = { maxHeight: 240, overflowY: 'auto', background: '#08081a', border: '1px solid #14142a', borderRadius: 8, padding: '8px 10px' };
const historyToggleStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#7f8cff', fontSize: 10, cursor: 'pointer', padding: 0, fontFamily: 'inherit' };
const historyRowStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '74px 1fr', gap: 8, fontSize: 9, padding: '3px 0' };
const actionsStyle: React.CSSProperties = { display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' };
const miniBtn: React.CSSProperties = { background: '#12122a', border: '1px solid #2a2a4a', color: '#9a9ac0', borderRadius: 6, fontSize: 10, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' };
const runBtn: React.CSSProperties = { marginLeft: 'auto', background: '#0a2a1c', border: '1px solid #1f8f5b', color: '#39ff9d', borderRadius: 6, fontSize: 10, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit' };
