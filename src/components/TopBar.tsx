// src/components/TopBar.tsx
'use client';

import type { DeptId } from '@/lib/data/departments';

interface Props {
  focusedDept: DeptId | null;
  onResetView: () => void;
}

export function TopBar({ focusedDept, onResetView }: Props) {
  return (
    <header style={barStyle}>
      <div style={logoStyle}>
        ◈ <em style={{ color: '#7f8cff', fontStyle: 'normal' }}>NANO</em>TE CORP
        <span style={versionStyle}>v1.0</span>
        <small style={smallStyle}>company.nanoteofficial.me</small>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {focusedDept && (
          <>
            <span style={hintStyle}>click dept again to reset view</span>
            <button onClick={onResetView} style={resetBtnStyle}>⟲ Full View</button>
          </>
        )}
        <div style={liveBadgeStyle}>● 6 AGENTS LIVE</div>
      </div>
    </header>
  );
}

const barStyle: React.CSSProperties = {
  height: 40, minHeight: 40, background: '#0a0a1e',
  borderBottom: '1px solid #1e1e40', padding: '0 18px',
  display: 'flex', justifyContent: 'space-between',
  alignItems: 'center', flexShrink: 0,
};
const logoStyle: React.CSSProperties = {
  fontSize: 13, fontWeight: 'bold', color: '#fff', letterSpacing: 3,
};
const versionStyle: React.CSSProperties = {
  color: '#7f8cff', fontSize: 8, marginLeft: 8, letterSpacing: 1,
  border: '1px solid #3a3a6a', borderRadius: 8, padding: '1px 6px',
  verticalAlign: 'middle', fontWeight: 'normal',
};
const smallStyle: React.CSSProperties = { color: '#333', fontSize: 9, marginLeft: 10 };
const hintStyle: React.CSSProperties = { fontSize: 8, color: '#333' };
const resetBtnStyle: React.CSSProperties = {
  background: '#1a1a3a', border: '1px solid #3a3a6a', color: '#7f8cff',
  padding: '2px 10px', borderRadius: 12, fontSize: 9, cursor: 'pointer',
  fontFamily: 'inherit',
};
const liveBadgeStyle: React.CSSProperties = {
  background: '#00ff8815', border: '1px solid #00ff8855', color: '#00ff88',
  padding: '2px 10px', borderRadius: 20, fontSize: 9,
  animation: 'glow 2s infinite',
};
