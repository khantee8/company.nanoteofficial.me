'use client';

import { Markdown } from './Markdown';
import { DEPARTMENTS, type DeptId } from '@/lib/data/departments';
import type { AgentOutput, AgentStatus } from '@/lib/agents/types';

interface Props {
  dept: DeptId;
  status: AgentStatus | null;
  output: AgentOutput | null;
  onClose: () => void;
}

export function ArtifactPanel({ dept, status, output, onClose }: Props) {
  const meta = DEPARTMENTS.find((d) => d.id === dept);
  const when = output?.ts ? new Date(output.ts).toLocaleString() : status?.lastRun ? new Date(status.lastRun).toLocaleString() : '—';
  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ color: meta?.color, fontWeight: 'bold', fontSize: 12 }}>{meta?.name ?? dept}</span>
        <button onClick={onClose} style={closeStyle}>✕</button>
      </div>
      <div style={subStyle}>state: {status?.state ?? 'idle'} · updated {when}</div>
      <div style={contentStyle}>
        {output?.markdown ? <Markdown text={output.markdown} /> : <div style={{ color: '#444', fontSize: 11 }}>No artifact yet — this agent runs on a daily schedule. Use the Telegram bot /run to trigger it now.</div>}
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = { position: 'absolute', top: 12, right: 12, width: 320, maxHeight: 'calc(100% - 24px)', background: '#0b0b1eee', border: '1px solid #1e1e40', borderRadius: 8, display: 'flex', flexDirection: 'column', overflow: 'hidden', zIndex: 5, backdropFilter: 'blur(4px)' };
const headerStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderBottom: '1px solid #1a1a3a' };
const subStyle: React.CSSProperties = { padding: '4px 12px', fontSize: 8, color: '#555', borderBottom: '1px solid #12122a' };
const contentStyle: React.CSSProperties = { padding: '8px 12px', overflowY: 'auto' };
const closeStyle: React.CSSProperties = { background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: 12 };
