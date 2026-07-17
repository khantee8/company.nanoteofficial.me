'use client';

import { useEffect, useState } from 'react';
import { DEPARTMENTS, type DeptId } from '@/lib/data/departments';
import type { FeedEvent } from '@/lib/agents/types';

const deptName = (id: DeptId) => DEPARTMENTS.find((d) => d.id === id)?.name ?? id;
const deptColor = (id: DeptId) => DEPARTMENTS.find((d) => d.id === id)?.color ?? '#7f8cff';

export function ActivityPanel() {
  const [feed, setFeed] = useState<FeedEvent[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const f = await fetch('/api/feed', { cache: 'no-store' }).then((r) => r.json());
        if (alive) {
          setFeed((f.events ?? []) as FeedEvent[]);
        }
      } catch {
        /* keep empty */
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div style={wrapStyle}>
      <h2 style={headingStyle}>Activity</h2>
      <div style={colsStyle}>
        {/* Run feed */}
        <section style={colStyle}>
          <div style={colHeadStyle}>Run feed</div>
          {feed.length === 0 ? (
            <div style={emptyStyle}>No recent events.</div>
          ) : feed.map((e, i) => (
            <div key={i} style={rowStyle}>
              <span style={{ ...dotStyle, background: deptColor(e.dept) }} />
              <span style={rowMainStyle}>
                <strong style={{ color: '#e6edf3' }}>{deptName(e.dept)}</strong> {e.msg}
              </span>
              <span style={tsStyle}>{new Date(e.ts).toLocaleString()}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

// ── styles ────────────────────────────────────────────────────────────
const wrapStyle: React.CSSProperties = { padding: 24, color: '#c9d1d9' };
const headingStyle: React.CSSProperties = { fontSize: 16, margin: '0 0 16px', color: '#fff', letterSpacing: 0.5 };
const colsStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 };
const colStyle: React.CSSProperties = { background: '#0d1117', border: '1px solid #21262d', borderRadius: 10, padding: 12 };
const colHeadStyle: React.CSSProperties = { fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #21262d' };
const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 2px', borderBottom: '1px solid #161b22' };
const dotStyle: React.CSSProperties = { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 };
const rowMainStyle: React.CSSProperties = { flex: 1, fontSize: 12, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const tsStyle: React.CSSProperties = { fontSize: 9, color: '#6e7681', flexShrink: 0, whiteSpace: 'nowrap' };
const emptyStyle: React.CSSProperties = { color: '#6e7681', fontSize: 12, padding: 16, fontStyle: 'italic' };
