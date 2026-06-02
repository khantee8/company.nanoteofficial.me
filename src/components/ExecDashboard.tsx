'use client';

import { useEffect, useState } from 'react';
import { Markdown } from './Markdown';
import { DEPARTMENTS, type DeptId } from '@/lib/data/departments';
import { parseHighlight, parseFlags } from '@/lib/agents/runner';
import type { DashboardData, DashboardAgent } from '@/lib/dashboard';
import type { AgentState } from '@/lib/agents/types';

const STATE_COLOR: Record<AgentState, string> = {
  done: '#3ddc97', running: '#ffc04d', error: '#ff6b86', idle: '#8b8db5',
};
const deptMeta = (id: DeptId) => DEPARTMENTS.find((d) => d.id === id);
const today = () => new Date().toISOString().slice(0, 10);

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
  footer.textContent = `NaNote Corp · company.nanoteofficial.me · ${new Date().toLocaleString()}`;
  d.body.append(h1, pre, footer);
  setTimeout(() => w.print(), 300);
}

export function ExecDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

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

  const agents = data?.agents ?? [];
  const td = today();
  const reportsToday = agents.filter((a) => a.status?.lastRun?.startsWith(td)).length;
  const activeAgents = agents.filter((a) => a.output).length;
  const totalFlags = agents.reduce((n, a) => n + (a.output ? parseFlags(a.output.markdown).length : 0), 0);
  const lastRunMs = agents.reduce((m, a) => {
    const t = a.status?.lastRun ? Date.parse(a.status.lastRun) : 0;
    return Math.max(m, Number.isFinite(t) ? t : 0);
  }, 0);
  const lastActivity = lastRunMs ? new Date(lastRunMs).toLocaleString() : '—';

  return (
    <div className="exec">
      <div className="exec-hero">
        <h1>Executive Dashboard</h1>
        <p>
          A live, data-driven view of NaNote Corp — six AI agents working across two floors,
          each producing real daily intelligence.
        </p>
      </div>

      <div className="exec-kpis">
        <Kpi value={`${reportsToday}/${agents.length || 6}`} label="Reporting today" />
        <Kpi value={String(activeAgents)} label="Agents with output" />
        <Kpi value={String(totalFlags)} label="Open flags" />
        <Kpi value={lastActivity} label="Last activity" small />
      </div>

      {loading && agents.length === 0 ? (
        <div style={{ color: '#9a9bc4', fontSize: 13, padding: 24 }}>Loading agent intelligence…</div>
      ) : agents.length === 0 ? (
        <div style={{ color: '#9a9bc4', fontSize: 13, padding: 24 }}>
          No agent data yet — agents report on a daily schedule.
        </div>
      ) : (
        <>
          <div className="exec-grid">
            {agents.map((a) => <ExecCard key={a.dept} agent={a} />)}
          </div>
          {data && data.digest.length > 0 && (
            <div className="glass exec-feed">
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Company Pulse</div>
              {data.digest.slice(0, 10).map((e, i) => {
                const m = deptMeta(e.dept);
                return (
                  <div className="row" key={i}>
                    <span className="date" style={{ color: '#7a7ca6' }}>{e.date}</span>
                    <span style={{ color: m?.color ?? '#9a9bc4', fontWeight: 600 }}>{m?.shortName ?? e.dept}</span>
                    <span style={{ color: '#c5c6e2', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {e.highlight || e.summary}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ value, label, small }: { value: string; label: string; small?: boolean }) {
  return (
    <div className="glass exec-kpi">
      <div className="v" style={small ? { fontSize: 14, fontWeight: 600 } : undefined}>{value}</div>
      <div className="l">{label}</div>
    </div>
  );
}

function ExecCard({ agent }: { agent: DashboardAgent }) {
  const meta = deptMeta(agent.dept);
  const name = meta?.name ?? agent.dept;
  const color = meta?.color ?? '#7f8cff';
  const state = (agent.status?.state ?? 'idle') as AgentState;
  const md = agent.output?.markdown ?? '';
  const highlight = md ? parseHighlight(md) : agent.status?.summary ?? '';
  const flags = md ? parseFlags(md) : [];
  const when = agent.output?.ts
    ? new Date(agent.output.ts).toLocaleDateString()
    : agent.status?.lastRun ? new Date(agent.status.lastRun).toLocaleDateString() : '—';

  return (
    <section className="glass exec-card">
      <div className="accent" style={{ background: `linear-gradient(90deg, ${color}, ${color}33)` }} />
      <div className="body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: color, boxShadow: `0 0 10px ${color}88`, flexShrink: 0 }} />
            <strong style={{ color: '#fff', fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</strong>
          </span>
          <span className="exec-pill" style={{ color: STATE_COLOR[state], borderColor: STATE_COLOR[state] + '55' }}>{state}</span>
        </div>
        <div style={{ fontSize: 10, color: '#7a7ca6' }}>updated {when}</div>

        {highlight && (
          <p style={{ fontSize: 13, lineHeight: 1.55, color: '#dfe0f2', margin: 0, fontWeight: 500 }}>{highlight}</p>
        )}

        {flags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {flags.map((f, i) => <span key={i} className="exec-flag">⚑ {f}</span>)}
          </div>
        )}

        <div className="exec-artifact">
          {md ? <Markdown text={md} /> : <div style={{ color: '#6a6c93', fontSize: 12 }}>Awaiting next scheduled run.</div>}
        </div>

        {agent.history.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: '#7a7ca6' }}>history</span>
            {agent.history.slice(0, 7).map((h, i) => (
              <span key={i} title={`${h.date}: ${h.highlight || h.summary}`}
                style={{ width: 7, height: 7, borderRadius: '50%', background: color, opacity: 0.35 + (0.65 * (agent.history.length - i)) / agent.history.length }} />
            ))}
          </div>
        )}

        <div style={{ marginTop: 2 }}>
          <button onClick={() => exportPdf(name, md)} disabled={!md} style={pdfBtn}>Export PDF</button>
        </div>
      </div>
    </section>
  );
}

const pdfBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)',
  color: '#cfd0ee', borderRadius: 8, fontSize: 11, padding: '5px 12px', cursor: 'pointer',
  fontFamily: 'inherit',
};
