'use client';

import { useEffect, useState } from 'react';
import { AdminNav } from './AdminNav';
import type { DeptId } from '@/lib/data/departments';
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

  // Suppress unused-variable lint — these will be consumed by child panels in Tasks 5-9
  void selectedDept;
  void setSelectedDept;

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
        health="ok"
        version={pkg.version}
      />
      <main style={mainStyle}>
        {section === 'overview'  && <section style={placeholderStyle}>overview panel — coming in Task 6</section>}
        {section === 'agents'    && <section style={placeholderStyle}>agents panel — coming in Task 7</section>}
        {section === 'knowledge' && <section style={placeholderStyle}>knowledge panel — coming in Task 8</section>}
        {section === 'activity'  && <section style={placeholderStyle}>activity panel — coming in Task 9</section>}
        {/* palette open state is wired here; the overlay component arrives in Task 5 */}
        {paletteOpen && (
          <div style={paletteBackdropStyle} onClick={() => setPaletteOpen(false)}>
            <div style={paletteStubStyle} onClick={(e) => e.stopPropagation()}>
              <span style={{ color: '#6e7681', fontSize: 12 }}>Command palette — coming in Task 5</span>
            </div>
          </div>
        )}
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

const paletteBackdropStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: 80,
  zIndex: 50,
};

const paletteStubStyle: React.CSSProperties = {
  background: '#161b22',
  border: '1px solid #30363d',
  borderRadius: 8,
  padding: '16px 20px',
  minWidth: 360,
};
