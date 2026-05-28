// src/components/DepartmentSidebar.tsx
'use client';

import { DEPARTMENTS, type DeptId, type Department } from '@/lib/data/departments';
import { getSpriteRects, SPRITE_VIEWBOX_W, SPRITE_VIEWBOX_H } from '@/lib/agents/sprites';

interface Props {
  selectedDept: DeptId | null;
  onSelect: (id: DeptId | null) => void;
  taskTexts: Record<DeptId, string>;
}

export function DepartmentSidebar({ selectedDept, onSelect, taskTexts }: Props) {
  const handleClick = (id: DeptId) => {
    onSelect(selectedDept === id ? null : id);
  };

  const panelTitle = selectedDept
    ? `▸ ${DEPARTMENTS.find(d => d.id === selectedDept)?.name} — Tasks`
    : '▸ Overview — All Tasks';

  return (
    <aside style={sidebarStyle}>
      <div style={titleStyle}>Departments</div>
      {DEPARTMENTS.map((d, idx) => (
        <DeptItem
          key={d.id}
          dept={d}
          index={idx}
          active={selectedDept === d.id}
          taskText={taskTexts[d.id] ?? d.task}
          onClick={() => handleClick(d.id)}
        />
      ))}
      <div style={taskPanelStyle}>
        <div style={taskPanelTitleStyle}>{panelTitle}</div>
        <div style={taskRowStyle}>review_reports.py<span style={runStyle}>running</span></div>
        <div style={taskRowStyle}>dispatch_brief.sh<span style={okStyle}>done ✓</span></div>
        <div style={taskRowStyle}>approve_rnd_7.js<span style={runStyle}>pending</span></div>
        <div style={taskRowStyle}>archive_q2.py<span style={{ color: '#252540' }}>idle</span></div>
      </div>
    </aside>
  );
}

interface ItemProps {
  dept: Department;
  index: number;
  active: boolean;
  taskText: string;
  onClick: () => void;
}

function DeptItem({ dept, index, active, taskText, onClick }: ItemProps) {
  const statusDot = dept.task.startsWith('●') ? '#00ff88' : '#252540';
  const dotBlink = dept.task.startsWith('●') ? 'dp 2s infinite' : 'none';
  const animationDelay = `${index * 0.5}s`;

  return (
    <button
      onClick={onClick}
      style={{
        ...deptStyle,
        ...(active ? activeDeptStyle : {}),
        cursor: 'pointer',
        textAlign: 'left',
        width: '100%',
        background: active ? '#0a1a10' : 'transparent',
      }}
    >
      <div style={{ width: 36, height: 40, flexShrink: 0 }}>
        <PixelSprite dept={dept.id} animationDelay={animationDelay} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 10, color: active ? '#00ff88' : '#aaa', fontWeight: 'bold' }}>
          {dept.name}
        </div>
        <div style={{ fontSize: 8, color: active ? '#00ff88' : '#333', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {taskText}
        </div>
      </div>
      <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusDot, animation: dotBlink, flexShrink: 0 }} />
    </button>
  );
}

/** React-rendered pixel-art sprite (no innerHTML). */
function PixelSprite({ dept, animationDelay }: { dept: DeptId; animationDelay: string }) {
  const rects = getSpriteRects(dept);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={36}
      height={40}
      viewBox={`0 0 ${SPRITE_VIEWBOX_W} ${SPRITE_VIEWBOX_H - 1}`}
      style={{ display: 'inline-block', animation: 'bob 2s ease-in-out infinite', animationDelay, imageRendering: 'pixelated' }}
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
      ))}
    </svg>
  );
}

const sidebarStyle: React.CSSProperties = {
  width: 186, minWidth: 186, background: '#0a0a1e',
  borderRight: '1px solid #1a1a3a', display: 'flex',
  flexDirection: 'column', overflow: 'hidden',
};
const titleStyle: React.CSSProperties = {
  fontSize: 8, color: '#2a2a4a', letterSpacing: 2,
  padding: '12px 14px 8px', textTransform: 'uppercase',
  borderBottom: '1px solid #111', flexShrink: 0,
};
const deptStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10,
  padding: '8px 12px', borderTop: 'none', borderRight: 'none',
  borderLeft: '3px solid transparent',
  borderBottom: '1px solid #0d0d25', transition: 'all 0.2s',
};
const activeDeptStyle: React.CSSProperties = { borderLeft: '3px solid #00ff88' };
const taskPanelStyle: React.CSSProperties = {
  flex: 1, padding: '10px 12px', borderTop: '1px solid #0e0e25',
  overflowY: 'auto', minHeight: 0,
};
const taskPanelTitleStyle: React.CSSProperties = {
  fontSize: 8, color: '#7f8cff', letterSpacing: 1, marginBottom: 8,
};
const taskRowStyle: React.CSSProperties = {
  fontSize: 8, color: '#444', padding: '4px 0',
  borderBottom: '1px solid #0d0d20', display: 'flex',
  justifyContent: 'space-between', gap: 4,
};
const okStyle: React.CSSProperties = { color: '#00ff88' };
const runStyle: React.CSSProperties = { color: '#ffaa00' };
