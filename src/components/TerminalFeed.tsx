'use client';

import { useEffect, useRef, useState } from 'react';
import type { DeptId } from '@/lib/data/departments';
import type { FeedEvent } from '@/lib/agents/types';

const POLL_MS = 8000;
const MAX_LINES = 5;

interface DisplayedLog { time: string; dept: DeptId; msg: string; id: string; }
interface Props { onLog?: (dept: DeptId, plainText: string) => void; }

function hhmmss(iso: string): string {
  const d = new Date(iso);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':');
}
function nowTime(): string {
  const n = new Date();
  return [n.getHours(), n.getMinutes(), n.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':');
}
function deptColor(d: DeptId): string {
  return { ceo: '#ffdd57', mkt: '#ff6b9d', rnd: '#00cfff', ops: '#ff9a3c', fin: '#7f8cff' }[d];
}

export function TerminalFeed({ onLog }: Props) {
  const [lines, setLines] = useState<DisplayedLog[]>([]);
  const [clock, setClock] = useState(nowTime());
  const onLogRef = useRef(onLog);
  useEffect(() => { onLogRef.current = onLog; }, [onLog]);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/feed', { cache: 'no-store' });
        const { events } = (await res.json()) as { events: FeedEvent[] };
        if (!alive || !events?.length) return;
        const display = events.slice(0, MAX_LINES).reverse().map((e) => ({
          time: hhmmss(e.ts), dept: e.dept, msg: e.msg, id: `${e.ts}-${e.dept}-${e.msg}`,
        }));
        setLines(display);
        const newest = events[0];
        if (newest) onLogRef.current?.(newest.dept, newest.msg.slice(0, 28));
      } catch { /* keep last */ }
    };
    poll();
    const feedInterval = setInterval(poll, POLL_MS);
    const clockInterval = setInterval(() => setClock(nowTime()), 1000);
    return () => { alive = false; clearInterval(feedInterval); clearInterval(clockInterval); };
  }, []);

  return (
    <div style={terminalStyle}>
      <div style={headStyle}>◈ LIVE PIPELINE FEED <span suppressHydrationWarning>{clock}</span></div>
      <div style={bodyStyle}>
        <div style={linesStyle}>
          {lines.length === 0 && <div style={{ ...lineStyle, color: '#333' }}>warming up — agents run daily…</div>}
          {lines.map((l, i) => {
            const isLast = i === lines.length - 1;
            return (
              <div key={l.id} style={lineStyle}>
                <span style={tsStyle}>{l.time}</span>
                <span style={{ ...tdStyle, color: deptColor(l.dept) }}>[{l.dept.toUpperCase()}]</span>
                <span style={tmStyle}>{l.msg}{isLast && <span style={cursorStyle} />}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const terminalStyle: React.CSSProperties = { height: 106, minHeight: 106, background: '#060614', borderTop: '1px solid #0e0e20', display: 'flex', flexDirection: 'column', flexShrink: 0 };
const headStyle: React.CSSProperties = { padding: '4px 14px', fontSize: 8, color: '#2a2a4a', letterSpacing: 2, borderBottom: '1px solid #0d0d1e', flexShrink: 0, display: 'flex', gap: 20 };
const bodyStyle: React.CSSProperties = { flex: 1, overflow: 'hidden', position: 'relative' };
const linesStyle: React.CSSProperties = { position: 'absolute', bottom: 4, left: 0, right: 0, padding: '0 14px' };
const lineStyle: React.CSSProperties = { fontSize: 9, lineHeight: 1.9, display: 'flex', gap: 8 };
const tsStyle: React.CSSProperties = { color: '#1a1a38', minWidth: 66 };
const tdStyle: React.CSSProperties = { minWidth: 42, fontWeight: 'bold' };
const tmStyle: React.CSSProperties = { color: '#444', flex: 1 };
const cursorStyle: React.CSSProperties = { display: 'inline-block', width: 6, height: 10, background: '#00ff88', animation: 'dp 1s step-end infinite', verticalAlign: 'bottom', marginLeft: 4 };
