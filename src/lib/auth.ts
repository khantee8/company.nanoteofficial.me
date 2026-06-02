// src/lib/auth.ts
//
// Stateless admin session: a signed `exp.HMAC` cookie (no DB). The signing
// secret is the admin password, which falls back to the legacy
// DASHBOARD_PASSCODE so an already-set secret keeps working. Fails closed when
// nothing is configured.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const ADMIN_COOKIE = 'nanote_admin';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h
export const SESSION_MAX_AGE_S = Math.floor(SESSION_TTL_MS / 1000);

/** Signing secret + admin password (DASHBOARD_PASSCODE kept as fallback). */
function adminSecret(): string | null {
  return process.env.ADMIN_PASSWORD ?? process.env.DASHBOARD_PASSCODE ?? null;
}

function adminUser(): string | null {
  return process.env.ADMIN_USER ?? null;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** True when both username and password match the configured admin creds. */
export function checkCredentials(user: string, password: string): boolean {
  const u = adminUser();
  const p = adminSecret();
  if (!u || !p) return false; // unconfigured → no login possible
  // Evaluate both (no short-circuit) to avoid leaking which field was wrong.
  const okUser = safeEqual(user, u);
  const okPass = safeEqual(password, p);
  return okUser && okPass;
}

function sign(exp: number, secret: string): string {
  return createHmac('sha256', secret).update(String(exp)).digest('hex');
}

/** Mint a signed session token, or null if admin auth isn't configured. */
export function createSessionToken(now = Date.now()): string | null {
  const secret = adminSecret();
  if (!secret) return null;
  const exp = now + SESSION_TTL_MS;
  return `${exp}.${sign(exp, secret)}`;
}

/** Verify a session token's signature and expiry (constant-time). */
export function verifySession(token: string | undefined | null, now = Date.now()): boolean {
  if (!token) return false;
  const secret = adminSecret();
  if (!secret) return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isFinite(exp) || exp < now) return false;
  return safeEqual(token.slice(dot + 1), sign(exp, secret));
}
