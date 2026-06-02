// src/components/TopBar.tsx
'use client';

import { NavBar } from './NavBar';
import type { DeptId } from '@/lib/data/departments';

interface Props {
  focusedDept: DeptId | null;
  onResetView: () => void;
}

export function TopBar({ focusedDept, onResetView }: Props) {
  return (
    <NavBar
      rightSlot={
        focusedDept ? (
          <button onClick={onResetView} style={resetBtnStyle}>⟲ Full View</button>
        ) : null
      }
    />
  );
}

const resetBtnStyle: React.CSSProperties = {
  background: '#1a1a3a', border: '1px solid #3a3a6a', color: '#7f8cff',
  padding: '3px 10px', borderRadius: 12, fontSize: 9, cursor: 'pointer',
  fontFamily: 'inherit',
};
