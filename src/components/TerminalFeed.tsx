// src/components/TerminalFeed.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { LOG_MESSAGES, tokensToPlain, type LogMessage, type LogToken } from '@/lib/data/logMessages';
import type { DeptId } from '@/lib/data/departments';

const MAX_LINES = 5;
const TICK_MS = 2800;

interface DisplayedLog {
  time: string;
  dept: DeptId;
  tokens: LogToken[];
  id: number;
}

interface Props {
  onLog?: (dept: DeptId, plainText: string) => void;
}

function nowTime(): string {
  const n = new Date();
  return [n.getHours(), n.getMinutes(), n.getSeconds()]
    .map(v => String(v).padStart(2, '0')).join(':');
}

export function TerminalFeed({ onLog }: Props) {
  const [lines, setLines] = useState<DisplayedLog[]>([]);
  const [clock, setClock] = useState(nowTime());
  const idxRef = useRef(0);
  const idRef = useRef(0);
  const onLogRef = useRef(onLog);
  useEffect(() => {
    onLogRef.current = onLog;
  }, [onLog]);

  useEffect(() => {
    const addLog = () => {
      const msg: LogMessage = LOG_MESSAGES[idxRef.current % LOG_MESSAGES.length];
      idxRef.current++;
      const id = idRef.current++;
      const log: DisplayedLog = { time: nowTime(), dept: msg.dept, tokens: msg.tokens, id };
      setLines(prev => [...prev.slice(-(MAX_LINES - 1)), log]);
      onLogRef.current?.(msg.dept, tokensToPlain(msg.tokens).slice(0, 28));
    };
    addLog();
    const interval = setInterval(addLog, TICK_MS);
    const clockInterval = setInterval(() => setClock(nowTime()), 1000);
    return () => { clearInterval(interval); clearInterval(clockInterval); };
  }, []);

  return (
    <div style={terminalStyle}>
      <div style={headStyle}>
        ◈ LIVE PIPELINE FEED <span>{clock}</span>
      </div>
      <div style={bodyStyle}>
        <div style={linesStyle}>
          {lines.map((l, i) => {
            const isLast = i === lines.length - 1;
            return (
              <div key={l.id} style={lineStyle}>
                <span style={tsStyle}>{l.time}</span>
                <span style={{ ...tdStyle, color: deptColor(l.dept) }}>[{l.dept.toUpperCase()}]</span>
                <span style={tmStyle}>
                  <TokenSpans tokens={l.tokens} />
                  {isLast && <span style={cursorStyle} />}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Render LogToken[] as React spans — type-safe, no innerHTML. */
function TokenSpans({ tokens }: { tokens: LogToken[] }) {
  return (
    <>
      {tokens.map((tok, i) => {
        const color = tok.type === 'ok' ? '#00ff88' : tok.type === 'warn' ? '#ffaa00' : undefined;
        return color
          ? <span key={i} style={{ color }}>{tok.value}</span>
          : <span key={i}>{tok.value}</span>;
      })}
    </>
  );
}

function deptColor(d: DeptId): string {
  return { ceo: '#ffdd57', mkt: '#ff6b9d', rnd: '#00cfff', ops: '#ff9a3c', fin: '#7f8cff' }[d];
}

const terminalStyle: React.CSSProperties = {
  height: 106, minHeight: 106, background: '#060614',
  borderTop: '1px solid #0e0e20', display: 'flex',
  flexDirection: 'column', flexShrink: 0,
};
const headStyle: React.CSSProperties = {
  padding: '4px 14px', fontSize: 8, color: '#2a2a4a',
  letterSpacing: 2, borderBottom: '1px solid #0d0d1e',
  flexShrink: 0, display: 'flex', gap: 20,
};
const bodyStyle: React.CSSProperties = { flex: 1, overflow: 'hidden', position: 'relative' };
const linesStyle: React.CSSProperties = {
  position: 'absolute', bottom: 4, left: 0, right: 0, padding: '0 14px',
};
const lineStyle: React.CSSProperties = {
  fontSize: 9, lineHeight: 1.9, display: 'flex', gap: 8,
};
const tsStyle: React.CSSProperties = { color: '#1a1a38', minWidth: 66 };
const tdStyle: React.CSSProperties = { minWidth: 42, fontWeight: 'bold' };
const tmStyle: React.CSSProperties = { color: '#444', flex: 1 };
const cursorStyle: React.CSSProperties = {
  display: 'inline-block', width: 6, height: 10, background: '#00ff88',
  animation: 'dp 1s step-end infinite', verticalAlign: 'bottom', marginLeft: 4,
};
