'use client';

import { Markdown } from './Markdown';
import { ArtifactRenderer } from './charts/ArtifactRenderer';
import { DEPARTMENTS, type DeptId } from '@/lib/data/departments';
import { parseHighlight, parseFlags } from '@/lib/agents/runner';
import { narrativeOf } from '@/lib/agents/bilingual';
import { useLang } from '@/lib/i18n/LangProvider';
import { pickMarkdown } from '@/lib/i18n/pickMarkdown';
import type { DashboardAgent } from '@/lib/dashboard';
import type { AgentState, Citation } from '@/lib/agents/types';

function dedupeSources(lists: Citation[][]): Citation[] {
  const seen = new Set<string>();
  const out: Citation[] = [];
  for (const list of lists) for (const c of list) {
    if (c?.url && !seen.has(c.url)) { seen.add(c.url); out.push(c); }
  }
  return out;
}

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

export function AgentDetail({
  dept,
  agent,
  related = [],
}: {
  dept: DeptId;
  agent: DashboardAgent | null;
  related?: { slug: string; title: string; dept: string }[];
}) {
  const { t, lang } = useLang();
  const meta = DEPARTMENTS.find((d) => d.id === dept);
  const name = meta?.name ?? dept;
  const color = meta?.color ?? '#7f8cff';
  const state = (agent?.status?.state ?? 'idle') as AgentState;
  const output = agent?.output ?? null;
  const md = pickMarkdown(output, lang);
  const artifacts = output?.artifacts ?? [];
  const tags = output?.tags ?? [];
  const category = output?.category;
  const highlight = md ? parseHighlight(md) : agent?.status?.summary ?? '';
  const flags = md ? parseFlags(md) : [];
  const when = output?.ts
    ? new Date(output.ts).toLocaleString()
    : agent?.status?.lastRun ? new Date(agent.status.lastRun).toLocaleString() : '—';
  const sources = dedupeSources(artifacts.map((a) => a.sources ?? []));

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
        <Kpi v={state} l={t('detail.status')} />
        <Kpi v={String(flags.length)} l={t('detail.openFlags')} />
        <Kpi v={String(artifacts.length)} l={t('detail.charts')} />
        <Kpi v={String(agent?.history.length ?? 0)} l={t('detail.history')} />
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
        <div className="agent-note">{t('detail.brief')}</div>
      ) : null}

      <section className="glass agent-narrative">
        <div className="agent-section-title">{t('detail.analysis')}</div>
        {md ? <div className="md-measure"><Markdown text={narrativeOf(md)} /></div> : <div style={{ color: '#9a9bc4', fontSize: 14 }}>{t('detail.awaiting')}</div>}
      </section>

      {tags.length > 0 && (
        <div className="agent-tags">
          {tags.map((t, i) => <span key={i} className="agent-tag">{t}</span>)}
        </div>
      )}

      {sources.length > 0 && (
        <section className="glass agent-sources">
          <div className="agent-section-title">{t('detail.sources')}</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sources.map((c, i) => (
              <li key={i} style={{ fontSize: 12, lineHeight: 1.5, color: '#c5c6e2' }}>
                <a
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#7f8cff', textDecoration: 'underline', wordBreak: 'break-all' }}
                >
                  {c.title || c.url}
                </a>
                {c.date && (
                  <span style={{ opacity: 0.6, marginLeft: 6 }}>— {c.date}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {related.length > 0 && (
        <section className="glass agent-related">
          <div className="agent-section-title">{t('detail.related')}</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {related.map((r, i) => (
              <li key={i} style={{ fontSize: 12, color: '#c5c6e2' }}>
                <a
                  href={`/dashboard/${r.dept}`}
                  style={{ color: '#7f8cff', textDecoration: 'underline' }}
                >
                  {r.title || r.slug}
                </a>
              </li>
            ))}
          </ul>
        </section>
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
