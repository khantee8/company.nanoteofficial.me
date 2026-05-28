// src/components/OfficeApp.tsx
'use client';

import { useState, useCallback } from 'react';
import { TopBar } from './TopBar';
import { DepartmentSidebar } from './DepartmentSidebar';
import { OfficeCanvas } from './OfficeCanvas';
import { TerminalFeed } from './TerminalFeed';
import { DEPARTMENTS, type DeptId } from '@/lib/data/departments';

const TERMINAL_HEIGHT = 106;

export function OfficeApp() {
  const [selectedDept, setSelectedDept] = useState<DeptId | null>(null);
  const [taskTexts, setTaskTexts] = useState<Record<DeptId, string>>(() =>
    Object.fromEntries(DEPARTMENTS.map(d => [d.id, d.task])) as Record<DeptId, string>
  );

  const handleLog = useCallback((dept: DeptId, plainText: string) => {
    setTaskTexts(prev => ({ ...prev, [dept]: '● ' + plainText }));
  }, []);

  const resetView = () => setSelectedDept(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <TopBar focusedDept={selectedDept} onResetView={resetView} />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <DepartmentSidebar
          selectedDept={selectedDept}
          onSelect={setSelectedDept}
          taskTexts={taskTexts}
        />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
          <div style={{ flex: 1, minHeight: 0 }}>
            <OfficeCanvas selectedDept={selectedDept} terminalHeight={TERMINAL_HEIGHT} />
          </div>
          <TerminalFeed onLog={handleLog} />
        </main>
      </div>
    </div>
  );
}
