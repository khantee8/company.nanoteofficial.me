'use client';

import { Markdown } from './Markdown';
import { ArtifactRenderer } from './charts/ArtifactRenderer';
import { DEPARTMENTS, type DeptId } from '@/lib/data/departments';
import { parseHighlight, parseFlags } from '@/lib/agents/runner';
import type { DashboardAgent } from '@/lib/dashboard';
import type { AgentState } from '@/lib/agents/types';

const STATE_COLOR: Record<AgentState, string> = {
  done: '#3ddc97', running: '#ffc04d', error: '#ff6b86', idle: '#8b8db5',
};
const CATEGORY_LABEL: Record<string, string> = {
  'market-brief': 'Market Brief', 'threat-intel': 'Threat Intel', research: 'Research',
  'content-plan': 'Content Plan', 'ops-status': 'Ops Status', 'exec-brief': 'Exec Brief',
};

// ── dependency-free exports ───────────────────────────────────────────
function downloadBlob(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function csvCell(value: string): string {
  let v = String(value ?? '');
  if (/^[=+\-@]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}
function exportHistoryCsv(name: string, history: DashboardAgent['history']) {
  const rows = [['date', 'summary', 'highlight'], ...history.map((h) => [h.date, h.summary, h.highlight])];
  downloadBlob(`${name}-history.csv`, rows.map((r) => r.map(csvCell).join(',')).join('\r\n'), 'text/csv');
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
  footer.textContent = `NaNote Corp · company.nanoteofficial.me · ${new Date().toLocaleString()}`;
  d.body.append(h1, pre, footer);
  setTimeout(() => w.print(), 300);
}

export function AgentDetail({ dept, agent }: { dept: DeptId; agent: DashboardAgent | null }) {
  const meta = DEPARTMENTS.find((d) => d.id === dept);
  const name = meta?.name ?? dept;
  const color = meta?.color ?? '#7f8cff';
  const state = (agent?.status?.state ?? 'idle') as AgentState;
  const output = agent?.output ?? null;
  const md = output?.markdown ?? '';
  const artifacts = output?.artifacts ?? [];
  const tags = output?.tags ?? [];
  const category = output?.category;
  const highlight = md ? parseHighlight(md) : agent?.status?.summary ?? '';
  const flags = md ? parseFlags(md) : [];
  const when = output?.ts
    ? new Date(output.ts).toLocaleString()
    : agent?.status?.lastRun ? new Date(agent.status.lastRun).toLocaleString() : '—';

  return (
    <div className="agent-detail">
      <div className="agent-hero">
        <span className="agent-hero-dot" style={{ background: color, boxShadow: `0 0 12px ${color}88` }} />
        <h1>{name}</h1>
        {category && <span className="agent-cat">{CATEGORY_LABEL[category] ?? category}</span>}
        <span className="agent-pill" style={{ color: STATE_COLOR[state], borderColor: STATE_COLOR[state] + '55' }}>● {state}</span>
        <span className="agent-when">updated {when}</span>
      </div>

      <div className="agent-kpis">
        <Kpi v={state} l="status" />
        <Kpi v={String(flags.length)} l="open flags" />
        <Kpi v={String(artifacts.length)} l="charts" />
        <Kpi v={String(agent?.history.length ?? 0)} l="history" />
      </div>

      {highlight && <p className="agent-highlight">{highlight}</p>}

      {flags.length > 0 && (
        <div className="agent-flags">
          {flags.map((f, i) => <span key={i} className="exec-flag">⚑ {f}</span>)}
        </div>
      )}

      {artifacts.length > 0 ? (
        <div className="agent-art-grid">
          {artifacts.map((a, i) => (
            <section key={i} className="glass agent-art">
              <ArtifactRenderer artifact={a} />
            </section>
          ))}
        </div>
      ) : md ? (
        <div className="agent-note">This agent reports as a written brief — see the analysis below.</div>
      ) : null}

      <section className="glass agent-narrative">
        <div className="agent-section-title">Analysis</div>
        {md ? <Markdown text={md} /> : <div style={{ color: '#6a6c93', fontSize: 13 }}>Awaiting the next scheduled run.</div>}
      </section>

      {tags.length > 0 && (
        <div className="agent-tags">
          {tags.map((t, i) => <span key={i} className="agent-tag">{t}</span>)}
        </div>
      )}

      <div className="agent-exports">
        <button onClick={() => downloadBlob(`${dept}.md`, md, 'text/markdown')} disabled={!md} className="agent-exp">⤓ MD</button>
        <button onClick={() => exportPdf(name, md)} disabled={!md} className="agent-exp">⤓ PDF</button>
        <button onClick={() => downloadBlob(`${dept}-artifacts.json`, JSON.stringify(artifacts, null, 2), 'application/json')} disabled={!artifacts.length} className="agent-exp">⤓ JSON</button>
        <button onClick={() => exportHistoryCsv(dept, agent?.history ?? [])} disabled={!agent?.history.length} className="agent-exp">⤓ CSV</button>
      </div>
    </div>
  );
}

function Kpi({ v, l }: { v: string; l: string }) {
  return (
    <div className="glass agent-kpi">
      <div className="v">{v}</div>
      <div className="l">{l}</div>
    </div>
  );
}
