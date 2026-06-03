'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export function AdminLogin() {
  const router = useRouter();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ user, password }),
      });
      if (res.ok) {
        router.refresh();
      } else if (res.status === 401) {
        setErr('Invalid username or password.');
      } else if (res.status === 503) {
        setErr('Admin login is not configured (set ADMIN_USER / ADMIN_PASSWORD).');
      } else {
        setErr('Login failed.');
      }
    } catch {
      setErr('Login failed (network).');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={wrapStyle}>
      <form onSubmit={submit} style={cardStyle}>
        <div style={lockStyle}>🔒</div>
        <h1 style={titleStyle}>Admin Access</h1>
        <p style={subStyle}>NaNote Corp operations console</p>
        <input
          value={user}
          onChange={(e) => setUser(e.target.value)}
          placeholder="username"
          autoComplete="username"
          aria-label="Username"
          style={inputStyle}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
          autoComplete="current-password"
          aria-label="Password"
          style={inputStyle}
        />
        {err && <div style={errStyle}>{err}</div>}
        <button type="submit" disabled={busy || !user || !password} style={btnStyle}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <Link href="/dashboard" style={backStyle}>← Back to public dashboard</Link>
      </form>
    </div>
  );
}

const wrapStyle: React.CSSProperties = { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#060610', padding: 20 };
const cardStyle: React.CSSProperties = { width: '100%', maxWidth: 320, display: 'flex', flexDirection: 'column', gap: 10, background: '#0b0b1e', border: '1px solid #1a1a3a', borderRadius: 14, padding: 28, boxShadow: '0 18px 50px rgba(0,0,0,0.5)' };
const lockStyle: React.CSSProperties = { fontSize: 26, textAlign: 'center' };
const titleStyle: React.CSSProperties = { color: '#fff', fontSize: 17, textAlign: 'center', margin: 0, letterSpacing: 1 };
const subStyle: React.CSSProperties = { color: '#666', fontSize: 10, textAlign: 'center', margin: '0 0 6px' };
const inputStyle: React.CSSProperties = { background: '#0c0c22', border: '1px solid #2a2a4a', borderRadius: 8, color: '#ddd', fontSize: 12, padding: '9px 12px', fontFamily: 'inherit' };
const errStyle: React.CSSProperties = { color: '#ff5470', fontSize: 10, textAlign: 'center' };
const btnStyle: React.CSSProperties = { background: '#14143a', border: '1px solid #3a3a6a', color: '#cfcfe6', borderRadius: 8, fontSize: 12, padding: '9px 12px', cursor: 'pointer', fontFamily: 'inherit', marginTop: 4 };
const backStyle: React.CSSProperties = { color: '#555', fontSize: 9, textAlign: 'center', textDecoration: 'none', marginTop: 4 };
