'use client';

import { useEffect, useRef, useState } from 'react';
import type { PaletteIndexItem } from '@/lib/adminPalette';

export interface PaletteItem {
  id: string;
  label: string;
  kind: 'section' | 'agent' | 'kb' | 'action';
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Static items built by AdminConsole where handlers are in scope */
  items: PaletteItem[];
  /** Pure index items (agent + kb) from buildPaletteIndex; run handlers appended here */
  indexItems?: PaletteIndexItem[];
}

export function CommandPalette({ open, onClose, items }: Props) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [prevOpen, setPrevOpen] = useState(open);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset transient state on the open→true transition. React-recommended
  // "store info from previous render" pattern — setState during render (NOT a
  // ref, NOT an effect), so it re-renders before paint with no cascade.
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) { setQuery(''); setSelected(0); }
  }

  // Build filtered list from items using direct case-insensitive label match
  const filtered: PaletteItem[] = query.trim()
    ? items.filter((i) => i.label.toLowerCase().includes(query.trim().toLowerCase()))
    : items;

  // Clamp the highlighted index to the filtered list during render.
  const safeSelected = Math.min(selected, Math.max(0, filtered.length - 1));

  // Focus input when palette opens — effect only touches DOM, no setState.
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => Math.min(s + 1, filtered.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) => Math.max(s - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const item = filtered[safeSelected];
      if (item) {
        item.run();
        onClose();
      }
      return;
    }
  };

  if (!open) return null;

  return (
    <div style={backdropStyle} onClick={onClose}>
      <div style={panelStyle} onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
          placeholder="Type a command or search…"
          style={inputStyle}
          aria-label="Command palette search"
        />
        <div style={listStyle} role="listbox">
          {filtered.length === 0 && (
            <div style={emptyStyle}>No results</div>
          )}
          {filtered.map((item, idx) => (
            <button
              key={item.id}
              style={itemStyle(idx === safeSelected)}
              onMouseEnter={() => setSelected(idx)}
              onClick={() => { item.run(); onClose(); }}
              role="option"
              aria-selected={idx === safeSelected}
            >
              <span style={kindBadgeStyle(item.kind)}>{kindLabel(item.kind)}</span>
              <span style={labelStyle}>{item.label}</span>
            </button>
          ))}
        </div>
        <div style={hintStyle}>
          <span>↑↓ navigate</span>
          <span style={{ marginLeft: 12 }}>↵ select</span>
          <span style={{ marginLeft: 12 }}>Esc close</span>
        </div>
      </div>
    </div>
  );
}

function kindLabel(kind: PaletteItem['kind']): string {
  switch (kind) {
    case 'section': return 'NAV';
    case 'agent':   return 'AGENT';
    case 'kb':      return 'BRIEF';
    case 'action':  return 'RUN';
  }
}

// ── styles ─────────────────────────────────────────────────────────────

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.65)',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: 80,
  zIndex: 100,
};

const panelStyle: React.CSSProperties = {
  background: '#161b22',
  border: '1px solid #30363d',
  borderRadius: 10,
  width: 480,
  maxWidth: '90vw',
  boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const inputStyle: React.CSSProperties = {
  padding: '12px 16px',
  background: 'transparent',
  border: 'none',
  borderBottom: '1px solid #30363d',
  color: '#e6edf3',
  fontSize: 14,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const listStyle: React.CSSProperties = {
  maxHeight: 320,
  overflowY: 'auto',
  padding: '4px 0',
};

const emptyStyle: React.CSSProperties = {
  padding: '12px 16px',
  color: '#6e7681',
  fontSize: 13,
};

function itemStyle(active: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    padding: '8px 14px',
    background: active ? 'rgba(99,179,237,0.08)' : 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    borderLeft: active ? '2px solid #63b3ed' : '2px solid transparent',
    transition: 'background 80ms',
  };
}

function kindBadgeStyle(kind: PaletteItem['kind']): React.CSSProperties {
  const colors: Record<string, string> = {
    section: '#8b949e',
    agent: '#7f8cff',
    kb: '#39ff9d',
    action: '#ff9a3c',
  };
  return {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: '0.06em',
    color: colors[kind] ?? '#8b949e',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: 3,
    padding: '2px 5px',
    minWidth: 36,
    textAlign: 'center',
  };
}

const labelStyle: React.CSSProperties = {
  color: '#e6edf3',
  fontSize: 13,
  flex: 1,
};

const hintStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderTop: '1px solid #21262d',
  fontSize: 10,
  color: '#484f58',
  display: 'flex',
};
