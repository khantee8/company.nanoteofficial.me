'use client';

import { useState, useCallback, useEffect } from 'react';
import { TopBar } from './TopBar';
import { DepartmentSidebar } from './DepartmentSidebar';
import { OfficeCanvas } from './OfficeCanvas';
import { TerminalFeed } from './TerminalFeed';
import { ArtifactPanel } from './ArtifactPanel';
import { DEPARTMENTS, type DeptId } from '@/lib/data/departments';
import type { AgentStatus, AgentOutput, AgentState } from '@/lib/agents/types';

const TERMINAL_HEIGHT = 106;
const POLL_MS = 8000;

interface AgentRow { dept: DeptId; status: AgentStatus; output: AgentOutput | null; }

export function OfficeApp() {
  const [selectedDept, setSelectedDept] = useState<DeptId | null>(null);
  const [taskTexts, setTaskTexts] = useState<Record<DeptId, string>>(() =>
    Object.fromEntries(DEPARTMENTS.map((d) => [d.id, d.task])) as Record<DeptId, string>,
  );
  const [agents, setAgents] = useState<Record<DeptId, AgentRow>>({} as Record<DeptId, AgentRow>);
  const [agentStates, setAgentStates] = useState<Partial<Record<DeptId, AgentState>>>({});

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/agents', { cache: 'no-store' });
        const { agents: rows } = (await res.json()) as { agents: AgentRow[] };
        if (!alive || !rows?.length) return;
        const map = Object.fromEntries(rows.map((r) => [r.dept, r])) as Record<DeptId, AgentRow>;
        setAgents(map);
        setAgentStates(Object.fromEntries(rows.map((r) => [r.dept, r.status?.state ?? 'idle'])) as Partial<Record<DeptId, AgentState>>);
        setTaskTexts((prev) => {
          const next = { ...prev };
          for (const r of rows) if (r.status?.summary) next[r.dept] = '● ' + r.status.summary;
          return next;
        });
      } catch { /* keep last */ }
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const handleLog = useCallback((dept: DeptId, plainText: string) => {
    setTaskTexts((prev) => ({ ...prev, [dept]: '● ' + plainText }));
  }, []);

  const resetView = () => setSelectedDept(null);
  const selected = selectedDept ? agents[selectedDept] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', fontFamily: 'var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace' }}>
      <TopBar focusedDept={selectedDept} onResetView={resetView} />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <DepartmentSidebar selectedDept={selectedDept} onSelect={setSelectedDept} taskTexts={taskTexts} />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, position: 'relative' }}>
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            <OfficeCanvas selectedDept={selectedDept} terminalHeight={TERMINAL_HEIGHT} agentStates={agentStates} />
            {selectedDept && (
              <ArtifactPanel
                dept={selectedDept}
                status={selected?.status ?? null}
                output={selected?.output ?? null}
                onClose={resetView}
              />
            )}
          </div>
          <TerminalFeed onLog={handleLog} />
        </main>
      </div>
    </div>
  );
}
