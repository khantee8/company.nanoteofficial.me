'use client';

import { useEffect, useRef, useState } from 'react';
import { filterPalette } from '@/lib/adminPalette';
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
  const inputRef = useRef<HTMLInputElement>(null);

  // Build filtered list from items using filterPalette on the label
  const filtered: PaletteItem[] = query.trim()
    ? items.filter((i) => {
        const fakeIndexItem: PaletteIndexItem = { id: i.id, label: i.label, kind: i.kind === 'section' || i.kind === 'action' ? 'agent' : i.kind };
        return filterPalette([fakeIndexItem], query).length > 0;
      })
    : items;

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      // Focus input on next tick so the element is mounted
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Clamp selected when filtered list changes
  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

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
      const item = filtered[selected];
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
              style={itemStyle(idx === selected, item.kind)}
              onMouseEnter={() => setSelected(idx)}
              onClick={() => { item.run(); onClose(); }}
              role="option"
              aria-selected={idx === selected}
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

function itemStyle(active: boolean, _kind: PaletteItem['kind']): React.CSSProperties {
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
