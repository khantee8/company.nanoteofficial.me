'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const LINKS = [
  { href: '/', label: 'Office' },
  { href: '/dashboard', label: 'Dashboard' },
];

interface Props {
  /** Page-specific control rendered before the live badge (desktop only). */
  rightSlot?: React.ReactNode;
}

export function NavBar({ rightSlot }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <header className="nav">
      <Link href="/" className="nav-brand" onClick={() => setOpen(false)}>
        ◈ <em>NANO</em>TE CORP<span className="nav-version">v1.1</span>
      </Link>

      <nav className="nav-links">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`nav-link${isActive(l.href) ? ' is-active' : ''}`}
          >
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="nav-right">
        {rightSlot && <span className="nav-slot">{rightSlot}</span>}
        <span className="nav-live">● 6 AGENTS LIVE</span>
        <button
          className="nav-burger"
          aria-label="Toggle menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '✕' : '≡'}
        </button>
      </div>

      {open && (
        <nav className="nav-mobile">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`nav-link${isActive(l.href) ? ' is-active' : ''}`}
              onClick={() => setOpen(false)}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
