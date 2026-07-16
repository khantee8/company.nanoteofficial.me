'use client';

import { useRouter } from 'next/navigation';
import type { AdminSection } from './AdminConsole';

const SECTIONS: { id: AdminSection; label: string; icon: string; kbd: string }[] = [
  { id: 'overview',  label: 'Overview',  icon: '▦', kbd: '⌘1' },
  { id: 'agents',    label: 'Agents',    icon: '◉', kbd: '⌘2' },
  { id: 'knowledge', label: 'Knowledge', icon: '▤', kbd: '⌘3' },
  { id: 'activity',  label: 'Activity',  icon: '≡', kbd: '⌘4' },
];

const HEALTH_COLOR: Record<'ok' | 'warn' | 'down', string> = {
  ok:   '#3fb950',
  warn: '#d29922',
  down: '#f85149',
};

interface AdminNavProps {
  section: AdminSection;
  onSection: (s: AdminSection) => void;
  health: 'ok' | 'warn' | 'down';
  version: string;
}

export function AdminNav({ section, onSection, health, version }: AdminNavProps) {
  const router = useRouter();

  const logout = async () => {
    try { await fetch('/api/admin/logout', { method: 'POST' }); } catch { /* ignore */ }
    router.refresh();
  };

  return (
    <nav style={navStyle}>
      {/* Brand */}
      <div style={brandStyle}>
        <span style={{ ...dotStyle, background: HEALTH_COLOR[health] }} />
        <span>AI Company · Ops</span>
      </div>

      {/* Section buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        {SECTIONS.map(({ id, label, icon, kbd }) => (
          <button
            key={id}
            onClick={() => onSection(id)}
            style={section === id ? activeNavItemStyle : navItemStyle}
            aria-current={section === id ? 'page' : undefined}
          >
            <span style={{ width: 14, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
            <span style={{ flex: 1 }}>{label}</span>
            <span style={kbdStyle}>{kbd}</span>
          </button>
        ))}
      </div>

      {/* Footer */}
      <div style={footerStyle}>
        <button onClick={logout} style={signOutStyle}>⎋ Sign out</button>
        <div style={versionStyle}>v{version}</div>
      </div>
    </nav>
  );
}

// ── styles ────────────────────────────────────────────────────────────

const navStyle: React.CSSProperties = {
  width: 180,
  minWidth: 180,
  background: '#0d1117',
  borderRight: '1px solid #21262d',
  padding: '14px 10px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  height: '100%',
  boxSizing: 'border-box',
};

const brandStyle: React.CSSProperties = {
  fontWeight: 700,
  color: '#ffffff',
  fontSize: 13,
  padding: '4px 8px 12px',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
};

const dotStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: '50%',
  flexShrink: 0,
  display: 'inline-block',
};

const navItemBase: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: 6,
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  width: '100%',
  textAlign: 'left',
};

const navItemStyle: React.CSSProperties = {
  ...navItemBase,
  color: '#8b949e',
};

const activeNavItemStyle: React.CSSProperties = {
  ...navItemBase,
  background: '#161b22',
  color: '#ffffff',
  boxShadow: 'inset 2px 0 0 #1f6feb',
};

const kbdStyle: React.CSSProperties = {
  marginLeft: 'auto',
  fontSize: 9,
  background: '#21262d',
  borderRadius: 3,
  padding: '1px 5px',
  color: '#8b949e',
};

const footerStyle: React.CSSProperties = {
  marginTop: 'auto',
  borderTop: '1px solid #21262d',
  paddingTop: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 11,
  color: '#6e7681',
};

const signOutStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#6e7681',
  fontSize: 11,
  cursor: 'pointer',
  fontFamily: 'inherit',
  textAlign: 'left',
  padding: '2px 0',
};

const versionStyle: React.CSSProperties = {
  color: '#484f58',
  fontSize: 11,
};
