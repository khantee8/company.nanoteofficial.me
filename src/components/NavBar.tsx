'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { DEPARTMENTS } from '@/lib/data/departments';

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

  // The agent sub-nav appears on the public dashboard + per-agent detail pages.
  const onDashboard = pathname.startsWith('/dashboard');

  return (
    <>
      <header className="nav">
        <Link href="/" className="nav-brand" onClick={() => setOpen(false)}>
          ◈ <em>NANO</em>TE CORP<span className="nav-version">v1.3.0</span>
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

      {onDashboard && (
        <nav className="nav-sub" aria-label="Agents">
          <Link href="/dashboard" className={`nav-sub-link${pathname === '/dashboard' ? ' is-active' : ''}`}>
            Overview
          </Link>
          {DEPARTMENTS.map((d) => {
            const href = `/dashboard/${d.id}`;
            const active = pathname === href;
            return (
              <Link key={d.id} href={href} className={`nav-sub-link${active ? ' is-active' : ''}`}>
                <span className="nav-sub-dot" style={{ background: d.color }} />
                {d.name}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
