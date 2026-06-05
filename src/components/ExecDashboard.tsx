'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArtifactRenderer } from './charts/ArtifactRenderer';
import { DEPARTMENTS, type DeptId } from '@/lib/data/departments';
import { parseHighlight, parseFlags } from '@/lib/agents/runner';
import { useLang } from '@/lib/i18n/LangProvider';
import type { DashboardData, DashboardAgent } from '@/lib/dashboard';
import type { AgentState } from '@/lib/agents/types';

const STATE_COLOR: Record<AgentState, string> = {
  done: '#3ddc97', running: '#ffc04d', error: '#ff6b86', idle: '#8b8db5',
};
const deptMeta = (id: DeptId) => DEPARTMENTS.find((d) => d.id === id);
const today = () => new Date().toISOString().slice(0, 10);

export function ExecDashboard() {
  const { t } = useLang();
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
  const ceoArts = agents.find((a) => a.dept === 'ceo')?.output?.artifacts ?? [];
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
        <h1>{t('exec.title')}</h1>
        <p>{t('exec.subtitle')}</p>
      </div>

      <div className="exec-kpis">
        <Kpi value={`${reportsToday}/${agents.length || 6}`} label={t('kpi.reportingToday')} />
        <Kpi value={String(activeAgents)} label={t('kpi.agentsWithOutput')} />
        <Kpi value={String(totalFlags)} label={t('kpi.openFlags')} />
        <Kpi value={lastActivity} label={t('kpi.lastActivity')} small />
      </div>

      {ceoArts.length > 0 && (
        <section className="glass exec-cockpit">
          <div className="exec-cockpit-title">{t('cockpit.title')}</div>
          <div className="exec-cockpit-grid">
            {ceoArts.map((a, i) => (
              <div key={i} className="exec-cockpit-cell"><ArtifactRenderer artifact={a} compact /></div>
            ))}
          </div>
          <Link href="/dashboard/ceo" className="exec-cockpit-link">{t('cockpit.openCeo')}</Link>
        </section>
      )}

      {loading && agents.length === 0 ? (
        <div style={{ color: '#9a9bc4', fontSize: 13, padding: 24 }}>{t('exec.loading')}</div>
      ) : agents.length === 0 ? (
        <div style={{ color: '#9a9bc4', fontSize: 13, padding: 24 }}>
          {t('exec.noData')}
        </div>
      ) : (
        <>
          <div className="exec-grid">
            {agents.map((a) => <ExecCard key={a.dept} agent={a} />)}
          </div>
          {data && data.digest.length > 0 && (
            <div className="glass exec-feed">
              <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{t('exec.pulse')}</div>
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
  const { t } = useLang();
  const meta = deptMeta(agent.dept);
  const name = meta?.name ?? agent.dept;
  const color = meta?.color ?? '#7f8cff';
  const state = (agent.status?.state ?? 'idle') as AgentState;
  const md = agent.output?.markdown ?? '';
  const highlight = md ? parseHighlight(md) : agent.status?.summary ?? '';
  const flags = md ? parseFlags(md) : [];
  const artifact = agent.output?.artifacts?.[0];
  const when = agent.output?.ts
    ? new Date(agent.output.ts).toLocaleDateString()
    : agent.status?.lastRun ? new Date(agent.status.lastRun).toLocaleDateString() : '—';

  return (
    <Link href={`/dashboard/${agent.dept}`} className="glass exec-card">
      <div className="accent" style={{ background: `linear-gradient(90deg, ${color}, ${color}33)` }} />
      <div className="body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            <span style={{ width: 11, height: 11, borderRadius: '50%', background: color, boxShadow: `0 0 10px ${color}88`, flexShrink: 0 }} />
            <strong style={{ color: '#fff', fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</strong>
          </span>
          <span className="exec-pill" style={{ color: STATE_COLOR[state], borderColor: STATE_COLOR[state] + '55' }}>{state}</span>
        </div>
        <div style={{ fontSize: 10, color: '#7a7ca6' }}>{t('common.updated')} {when}</div>

        {highlight && (
          <p style={{ fontSize: 13, lineHeight: 1.55, color: '#dfe0f2', margin: 0, fontWeight: 500 }}>{highlight}</p>
        )}

        {flags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {flags.map((f, i) => <span key={i} className="exec-flag">⚑ {f}</span>)}
          </div>
        )}

        <div className="exec-artifact">
          {artifact ? <ArtifactRenderer artifact={artifact} compact /> : <div style={{ color: '#6a6c93', fontSize: 12 }}>{t('card.awaiting')}</div>}
        </div>

        {agent.history.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: '#7a7ca6' }}>{t('card.history')}</span>
            {agent.history.slice(0, 7).map((h, i) => (
              <span key={i} title={`${h.date}: ${h.highlight || h.summary}`}
                style={{ width: 7, height: 7, borderRadius: '50%', background: color, opacity: 0.35 + (0.65 * (agent.history.length - i)) / agent.history.length }} />
            ))}
          </div>
        )}

        <div className="exec-card-cta">{t('card.viewDetail')}</div>
      </div>
    </Link>
  );
}
