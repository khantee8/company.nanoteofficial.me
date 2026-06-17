'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Markdown } from '../Markdown';
import { ArtifactRenderer } from '../charts/ArtifactRenderer';
import { DEPARTMENTS, type DeptId } from '@/lib/data/departments';
import type { KbEntry } from '@/lib/agents/types';

type StatusFilter = 'all' | KbEntry['status'];

const STATUS_META: Record<KbEntry['status'], { label: string; color: string }> = {
  draft: { label: 'draft', color: '#d29922' },
  published: { label: 'published', color: '#3fb950' },
  archived: { label: 'archived', color: '#8b949e' },
};

const deptMeta = (id: DeptId) => DEPARTMENTS.find((d) => d.id === id);

export function KnowledgePanel({ focusId }: { focusId?: string | null }) {
  const router = useRouter();
  const [entries, setEntries] = useState<KbEntry[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [prevFocus, setPrevFocus] = useState(focusId);

  // Open the entry the ⌘K palette jumped to (clear the status filter so it's
  // visible). setState-during-render on the focusId change — React-recommended,
  // not a setState-in-effect.
  if (focusId && focusId !== prevFocus) {
    setPrevFocus(focusId);
    setSelectedId(focusId);
    setFilter('all');
  }

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
        const entry = j.entry;
        setEntries((prev) => prev.map((e) => (e.id === id ? entry : e))
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
      if (j.ok) {
        setEntries((prev) => prev.filter((e) => e.id !== id));
        setSelectedId((s) => (s === id ? null : s));
        setMsg('✓ deleted');
      } else setMsg('✕ delete failed');
    } catch {
      setMsg('✕ network error');
    } finally {
      setBusy(null);
    }
  };

  const counts = entries.reduce<Record<string, number>>((a, e) => { a[e.status] = (a[e.status] ?? 0) + 1; return a; }, {});
  const selected = entries.find((e) => e.id === selectedId) ?? null;

  return (
    <div style={splitStyle}>
      {/* List column */}
      <div style={listColStyle}>
        <div style={tabsStyle}>
          {(['all', 'draft', 'published', 'archived'] as StatusFilter[]).map((s) => (
            <button key={s} onClick={() => setFilter(s)} style={{ ...tabStyle, ...(filter === s ? tabActive : null) }}>
              {s}{s !== 'all' && counts[s] != null ? ` (${counts[s]})` : ''}
            </button>
          ))}
        </div>
        {msg && <div style={msgStyle}>{msg}</div>}
        {loading ? (
          <div style={emptyStyle}>Loading…</div>
        ) : entries.length === 0 ? (
          <div style={emptyStyle}>No {filter === 'all' ? '' : filter + ' '}entries.</div>
        ) : (
          <ul style={ulStyle}>
            {entries.map((e) => {
              const meta = deptMeta(e.dept);
              const sm = STATUS_META[e.status];
              return (
                <li key={e.id}>
                  <button onClick={() => setSelectedId(e.id)} style={e.id === selectedId ? listItemSel : listItem}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: meta?.color ?? '#7f8cff', flexShrink: 0 }} />
                      <strong style={liNameStyle}>{meta?.name ?? e.dept}</strong>
                      <span style={{ ...dotBadge, color: sm.color }}>●</span>
                      {e.pinned && <span style={{ fontSize: 9, color: '#ffd86a' }}>★</span>}
                    </div>
                    <span style={liSummaryStyle}>{e.highlight || e.summary}</span>
                    <span style={liDateStyle}>{e.category} · {e.date}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Review-read column */}
      <div style={readColStyle}>
        {!selected ? (
          <div style={emptyStyle}>Select an entry to review.</div>
        ) : (
          <div style={{ padding: 18 }}>
            <div style={readHeadStyle}>
              <strong style={{ fontSize: 15, color: '#fff' }}>{deptMeta(selected.dept)?.name ?? selected.dept}</strong>
              <span style={{ ...statusBadge, color: STATUS_META[selected.status].color, borderColor: STATUS_META[selected.status].color + '55' }}>
                {STATUS_META[selected.status].label}
              </span>
              <span style={{ fontSize: 10, color: '#6e7681', marginLeft: 'auto' }}>{selected.category} · {selected.date} · {selected.provenance}</span>
            </div>

            {selected.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '4px 0 12px' }}>
                {selected.tags.map((t) => <span key={t} style={tagStyle}>#{t}</span>)}
              </div>
            )}

            {/* Curation actions */}
            <div style={actionsStyle}>
              {selected.status !== 'published' && (
                <button disabled={busy === selected.id} onClick={() => patch(selected.id, { status: 'published' }, 'published → Library')} style={publishBtn}>Publish</button>
              )}
              {selected.status !== 'archived' && (
                <button disabled={busy === selected.id} onClick={() => patch(selected.id, { status: 'archived' }, 'archived')} style={miniBtn}>Archive</button>
              )}
              {selected.status === 'archived' && (
                <button disabled={busy === selected.id} onClick={() => patch(selected.id, { status: 'draft' }, 'restored to draft')} style={miniBtn}>Restore</button>
              )}
              <button disabled={busy === selected.id} onClick={() => patch(selected.id, { pinned: !selected.pinned }, selected.pinned ? 'unpinned' : 'pinned')} style={miniBtn}>
                {selected.pinned ? '☆ Unpin' : '★ Pin'}
              </button>
              <button disabled={busy === selected.id} onClick={() => remove(selected.id)} style={deleteBtn}>Delete</button>
            </div>

            {/* Artifacts */}
            {selected.artifacts.length > 0 && (
              <div style={artifactGridStyle}>
                {selected.artifacts.map((a, i) => <ArtifactRenderer key={i} artifact={a} />)}
              </div>
            )}

            {/* Narrative (safe Markdown) */}
            <div style={readBodyStyle}>
              {selected.markdown ? <Markdown text={selected.markdown} /> : <div style={emptyStyle}>No narrative.</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── styles ────────────────────────────────────────────────────────────
const splitStyle: React.CSSProperties = { display: 'flex', height: '100%', minHeight: 0 };
const listColStyle: React.CSSProperties = { width: 300, minWidth: 240, borderRight: '1px solid #21262d', padding: 10, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' };
const tabsStyle: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 4 };
const tabStyle: React.CSSProperties = { background: '#161b22', border: '1px solid #30363d', color: '#8b949e', borderRadius: 6, fontSize: 10, padding: '4px 9px', cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' };
const tabActive: React.CSSProperties = { background: '#1f6feb22', border: '1px solid #1f6feb', color: '#fff' };
const msgStyle: React.CSSProperties = { fontSize: 11, color: '#c9d1d9', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, padding: '6px 10px' };
const emptyStyle: React.CSSProperties = { color: '#6e7681', fontSize: 12, padding: 24, textAlign: 'center', fontStyle: 'italic' };
const ulStyle: React.CSSProperties = { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 4 };
const listItemBase: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 3, width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 7, border: '1px solid transparent', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' };
const listItem: React.CSSProperties = { ...listItemBase };
const listItemSel: React.CSSProperties = { ...listItemBase, background: '#161b22', border: '1px solid #30363d' };
const liNameStyle: React.CSSProperties = { fontSize: 12, color: '#e6edf3' };
const dotBadge: React.CSSProperties = { fontSize: 8 };
const liSummaryStyle: React.CSSProperties = { fontSize: 11, color: '#8b949e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const liDateStyle: React.CSSProperties = { fontSize: 9, color: '#6e7681' };
const readColStyle: React.CSSProperties = { flex: 1, overflowY: 'auto', minWidth: 0 };
const readHeadStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 };
const statusBadge: React.CSSProperties = { fontSize: 9, padding: '2px 9px', borderRadius: 20, border: '1px solid', textTransform: 'uppercase', letterSpacing: 0.5 };
const tagStyle: React.CSSProperties = { fontSize: 9, color: '#58a6ff', background: '#0d1117', border: '1px solid #21262d', borderRadius: 5, padding: '1px 6px' };
const actionsStyle: React.CSSProperties = { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 };
const miniBtn: React.CSSProperties = { background: '#161b22', border: '1px solid #30363d', color: '#8b949e', borderRadius: 6, fontSize: 10, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit' };
const publishBtn: React.CSSProperties = { background: '#0a2a1c', border: '1px solid #1f8f5b', color: '#39ff9d', borderRadius: 6, fontSize: 10, padding: '4px 12px', cursor: 'pointer', fontFamily: 'inherit' };
const deleteBtn: React.CSSProperties = { background: '#2a1018', border: '1px solid #6a2a3a', color: '#ff8aa0', borderRadius: 6, fontSize: 10, padding: '4px 10px', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' };
const artifactGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12, marginBottom: 16 };
const readBodyStyle: React.CSSProperties = { background: '#08080f', border: '1px solid #161b22', borderRadius: 8, padding: '12px 14px' };
