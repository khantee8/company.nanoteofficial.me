'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminNav } from './AdminNav';
import { CommandPalette } from './CommandPalette';
import type { PaletteItem } from './CommandPalette';
import { OverviewPanel } from './OverviewPanel';
import { DEPARTMENTS } from '@/lib/data/departments';
import { buildPaletteIndex } from '@/lib/adminPalette';
import type { DeptId } from '@/lib/data/departments';
import type { DashboardData } from '@/lib/dashboard';
import pkg from '../../../package.json';

export type AdminSection = 'overview' | 'agents' | 'knowledge' | 'activity';

const SECTION_KEYS: Record<string, AdminSection> = {
  '1': 'overview',
  '2': 'agents',
  '3': 'knowledge',
  '4': 'activity',
};

export function AdminConsole() {
  const [section, setSection] = useState<AdminSection>('overview');
  const [selectedDept, setSelectedDept] = useState<DeptId | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);

  // Suppress unused-variable lint — consumed by AgentsPanel in Task 7
  void selectedDept;
  void setSelectedDept;

  // One dashboard fetch shared by all panels (Overview now, Agents/Activity later).
  // refresh() is for manual re-fetch (e.g. after a run); mount fetch is inlined
  // as an async IIFE so setState lands after await, not directly in the effect.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard', { cache: 'no-store' });
      setData((await res.json()) as DashboardData);
    } catch {
      /* keep last */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/dashboard', { cache: 'no-store' });
        const json = (await res.json()) as DashboardData;
        if (alive) setData(json);
      } catch {
        /* keep last */
      }
    })();
    return () => { alive = false; };
  }, []);
  void refresh; // consumed by AgentsPanel/onRan in Task 7

  // Company health for the nav dot: any error → down, any truncated/idle → warn.
  const health = useMemo((): 'ok' | 'warn' | 'down' => {
    const agents = data?.agents ?? [];
    if (agents.length === 0) return 'ok';
    if (agents.some((a) => a.status?.state === 'error')) return 'down';
    if (agents.some((a) => a.output?.incomplete || (a.status?.state ?? 'idle') === 'idle')) return 'warn';
    return 'ok';
  }, [data]);

  // Build the static palette item list (section nav + agent actions)
  const paletteItems = useMemo((): PaletteItem[] => {
    const sections: PaletteItem[] = (
      [
        { id: 'overview',  label: 'Go to Overview' },
        { id: 'agents',    label: 'Go to Agents' },
        { id: 'knowledge', label: 'Go to Knowledge' },
        { id: 'activity',  label: 'Go to Activity' },
      ] as { id: AdminSection; label: string }[]
    ).map((s) => ({
      id: `section:${s.id}`,
      label: s.label,
      kind: 'section' as const,
      run: () => setSection(s.id),
    }));

    const agentActions: PaletteItem[] = DEPARTMENTS.map((d) => ({
      id: `action:run:${d.id}`,
      label: `Run ${d.name}`,
      kind: 'action' as const,
      // Placeholder — Task 7 will wire the actual run trigger
      run: () => { setSection('agents'); setSelectedDept(d.id); },
    }));

    // Index items (agent nav) from pure lib
    const indexItems = buildPaletteIndex(DEPARTMENTS, /* kb= */[]);
    const agentNavItems: PaletteItem[] = indexItems
      .filter((i) => i.kind === 'agent')
      .map((i) => ({
        id: i.id,
        label: i.label,
        kind: 'agent' as const,
        run: () => {
          const deptId = i.id.replace('agent:', '') as DeptId;
          setSelectedDept(deptId);
          setSection('agents');
        },
      }));

    return [...sections, ...agentNavItems, ...agentActions];
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'k') {
          e.preventDefault();
          setPaletteOpen((v) => !v);
          return;
        }
        const target = SECTION_KEYS[e.key];
        if (target) {
          e.preventDefault();
          setSection(target);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div style={shellStyle}>
      <AdminNav
        section={section}
        onSection={setSection}
        health={health}
        version={pkg.version}
      />
      <main style={mainStyle}>
        {section === 'overview'  && <OverviewPanel data={data} />}
        {section === 'agents'    && <section style={placeholderStyle}>agents panel — coming in Task 7</section>}
        {section === 'knowledge' && <section style={placeholderStyle}>knowledge panel — coming in Task 8</section>}
        {section === 'activity'  && <section style={placeholderStyle}>activity panel — coming in Task 9</section>}
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          items={paletteItems}
        />
      </main>
    </div>
  );
}

// ── styles ────────────────────────────────────────────────────────────

const shellStyle: React.CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'row',
  overflow: 'hidden',
  background: '#0b0e14',
  minHeight: 0,
};

const mainStyle: React.CSSProperties = {
  flex: 1,
  overflow: 'auto',
  background: '#0b0e14',
  position: 'relative',
};

const placeholderStyle: React.CSSProperties = {
  padding: 24,
  color: '#6e7681',
  fontSize: 13,
  fontStyle: 'italic',
};

