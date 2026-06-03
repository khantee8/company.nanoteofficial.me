'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEPARTMENTS, type DeptId } from '@/lib/data/departments';
import type { KbEntry } from '@/lib/agents/types';

type StatusFilter = 'all' | KbEntry['status'];

const STATUS_META: Record<KbEntry['status'], { label: string; color: string; bg: string }> = {
  draft: { label: 'draft', color: '#ffb45a', bg: '#2a1e08' },
  published: { label: 'published', color: '#39ff9d', bg: '#0a2a1c' },
  archived: { label: 'archived', color: '#8a8aa6', bg: '#15152e' },
};

const deptMeta = (id: DeptId) => DEPARTMENTS.find((d) => d.id === id);

export function KbManager() {
  const router = useRouter();
  const [entries, setEntries] = useState<KbEntry[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async (status: StatusFilter) => {
    try {
      const qs = status === 'all' ? '' : `?status=${status}`;
      const res = await fetch(`/api/admin/kb${qs}`, { cache: 'no-store' });
      if (res.status === 401) { setMsg('Session expired — sign in again.'); router.refresh(); return; }
      const j = (await res.json()) as { entries?: KbEntry[] };
      setEntries(j.entries ?? []);
    } catch {
      setMsg('Failed to load knowledge base.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    let alive = true;
    (async () => { if (alive) await load(filter); })();
    return () => { alive = false; };
  }, [filter, load]);

  const patch = async (id: string, body: Record<string, unknown>, label: string) => {
    setBusy(id); setMsg('');
    try {
      const res = await fetch('/api/admin/kb', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      });
      if (res.status === 401) { setMsg('Session expired — sign in again.'); router.refresh(); return; }
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; entry?: KbEntry; error?: string };
      if (j.ok && j.entry) {
        setEntries((prev) => prev.map((e) => (e.id === id ? j.entry as KbEntry : e))
          .filter((e) => filter === 'all' || e.status === filter));
        setMsg(`✓ ${label}`);
      } else setMsg(`✕ ${j.error ?? 'failed'}`);
    } catch {
      setMsg('✕ network error');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this entry permanently?')) return;
    setBusy(id); setMsg('');
    try {
      const res = await fetch(`/api/admin/kb?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (res.status === 401) { setMsg('Session expired — sign in again.'); router.refresh(); return; }
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (j.ok) { setEntries((prev) => prev.filter((e) => e.id !== id)); setMsg('✓ deleted'); }
      else setMsg('✕ delete failed');
    } catch {
      setMsg('✕ network error');
    } finally {
      setBusy(null);
    }
  };

  const counts = entries.reduce<Record<string, number>>((a, e) => { a[e.status] = (a[e.status] ?? 0) + 1; return a; }, {});

  return (
    <section style={wrapStyle}>
      <div style={headStyle}>
        <div>
          <h2 style={h2Style}>Knowledge Base</h2>
          <p style={subStyle}>Curate agent output — publish drafts to the public feed, archive or pin entries.</p>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {(['all', 'draft', 'published', 'archived'] as StatusFilter[]).map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              style={{ ...tabStyle, ...(filter === s ? tabActive : null) }}>
              {s}{s !== 'all' && counts[s] != null ? ` (${counts[s]})` : ''}
            </button>
          ))}
          <button onClick={() => load(filter)} style={refreshStyle}>↻</button>
        </div>
      </div>

      {msg && <div style={msgStyle}>{msg}</div>}

      {loading ? (
        <div style={emptyStyle}>Loading entries…</div>
      ) : entries.length === 0 ? (
        <div style={emptyStyle}>No {filter === 'all' ? '' : filter + ' '}entries.</div>
      ) : (
        <ul style={listStyle}>
          {entries.map((e) => {
            const meta = deptMeta(e.dept);
            const sm = STATUS_META[e.status];
            const isBusy = busy === e.id;
            return (
              <li key={e.id} style={rowStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: meta?.color ?? '#7f8cff', flexShrink: 0 }} />
                  <strong style={{ color: '#e8e8f4', fontSize: 12 }}>{meta?.name ?? e.dept}</strong>
                  <span style={catStyle}>{e.category}</span>
                  <span style={{ ...statusBadge, color: sm.color, background: sm.bg, borderColor: sm.color + '55' }}>{sm.label}</span>
                  {e.pinned && <span style={pinBadge}>★ pinned</span>}
                  <span style={dateStyle}>{e.date}</span>
                </div>
                {(e.highlight || e.summary) && <p style={summaryStyle}>{e.highlight || e.summary}</p>}
                {e.tags.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {e.tags.map((t) => <span key={t} style={tagStyle}>#{t}</span>)}
                  </div>
                )}
                <div style={rowActions}>
                  {e.status !== 'published' && (
                    <button disabled={isBusy} onClick={() => patch(e.id, { status: 'published' }, 'published')} style={publishBtn}>Publish</button>
                  )}
                  {e.status !== 'archived' && (
                    <button disabled={isBusy} onClick={() => patch(e.id, { status: 'archived' }, 'archived')} style={miniBtn}>Archive</button>
                  )}
                  {e.status === 'archived' && (
                    <button disabled={isBusy} onClick={() => patch(e.id, { status: 'draft' }, 'restored to draft')} style={miniBtn}>Restore</button>
                  )}
                  <button disabled={isBusy} onClick={() => patch(e.id, { pinned: !e.pinned }, e.pinned ? 'unpinned' : 'pinned')} style={miniBtn}>
                    {e.pinned ? '☆ Unpin' : '★ Pin'}
                  </button>
                  <button disabled={isBusy} onClick={() => remove(e.id)} style={deleteBtn}>Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ── styles ────────────────────────────────────────────────────────────
const wrapStyle: React.CSSProperties = { marginTop: 28, background: '#0b0b1e', border: '1px solid #1a1a3a', borderRadius: 12, padding: 16 };
const headStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 };
const h2Style: React.CSSProperties = { color: '#fff', fontSize: 15, margin: 0, letterSpacing: 0.5 };
const subStyle: React.CSSProperties = { color: '#777', fontSize: 11, margin: '4px 0 0' };
const tabStyle: React.CSSProperties = { background: '#12122a', border: '1px solid #2a2a4a', color: '#9a9ac0', borderRadius: 7, fontSize: 10, padding: '5px 11px', cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' };
const tabActive: React.CSSProperties = { background: '#1e1e44', border: '1px solid #4a4a8a', color: '#fff' };
const refreshStyle: React.CSSProperties = { background: '#14142e', border: '1px solid #3a3a6a', color: '#cfcfe6', borderRadius: 7, fontSize: 11, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit' };
const msgStyle: React.CSSProperties = { fontSize: 11, color: '#cfcfe6', background: '#0c0c20', border: '1px solid #1a1a3a', borderRadius: 7, padding: '6px 10px', marginBottom: 10 };
const emptyStyle: React.CSSProperties = { color: '#555', fontSize: 12, padding: 24, textAlign: 'center' };
const listStyle: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 };
const rowStyle: React.CSSProperties = { background: '#08081a', border: '1px solid #14142a', borderRadius: 9, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 };
const catStyle: React.CSSProperties = { fontSize: 9, color: '#8a8ac0', background: '#15152e', border: '1px solid #26264a', borderRadius: 5, padding: '1px 6px' };
const statusBadge: React.CSSProperties = { fontSize: 9, padding: '1px 8px', borderRadius: 20, border: '1px solid', textTransform: 'uppercase', letterSpacing: 0.5 };
const pinBadge: React.CSSProperties = { fontSize: 9, color: '#ffd86a', background: '#2a2408', border: '1px solid #4a4010', borderRadius: 5, padding: '1px 6px' };
const dateStyle: React.CSSProperties = { fontSize: 9, color: '#555', marginLeft: 'auto' };
const summaryStyle: React.CSSProperties = { fontSize: 11, lineHeight: 1.5, color: '#bcbcd8', margin: 0 };
const tagStyle: React.CSSProperties = { fontSize: 9, color: '#7f8cff', background: '#12122a', border: '1px solid #23234a', borderRadius: 5, padding: '1px 6px' };
const rowActions: React.CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 };
const miniBtn: React.CSSProperties = { background: '#12122a', border: '1px solid #2a2a4a', color: '#9a9ac0', borderRadius: 6, fontSize: 10, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' };
const publishBtn: React.CSSProperties = { background: '#0a2a1c', border: '1px solid #1f8f5b', color: '#39ff9d', borderRadius: 6, fontSize: 10, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit' };
const deleteBtn: React.CSSProperties = { background: '#2a1018', border: '1px solid #6a2a3a', color: '#ff8aa0', borderRadius: 6, fontSize: 10, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' };
