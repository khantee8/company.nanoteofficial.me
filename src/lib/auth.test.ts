import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkCredentials, createSessionToken, verifySession } from './auth';

const SNAPSHOT = { ...process.env };

beforeEach(() => {
  process.env.ADMIN_USER = 'boss';
  process.env.ADMIN_PASSWORD = 'sup3r-secret-pass';
  delete process.env.DASHBOARD_PASSCODE;
});
afterEach(() => {
  process.env = { ...SNAPSHOT };
});

describe('admin auth', () => {
  it('accepts correct credentials and rejects wrong ones', () => {
    expect(checkCredentials('boss', 'sup3r-secret-pass')).toBe(true);
    expect(checkCredentials('boss', 'wrong')).toBe(false);
    expect(checkCredentials('nope', 'sup3r-secret-pass')).toBe(false);
    expect(checkCredentials('', '')).toBe(false);
  });

  it('fails closed when admin auth is not configured', () => {
    delete process.env.ADMIN_USER;
    delete process.env.ADMIN_PASSWORD;
    expect(checkCredentials('boss', 'sup3r-secret-pass')).toBe(false);
    expect(createSessionToken()).toBeNull();
    expect(verifySession('anything')).toBe(false);
  });

  it('falls back to DASHBOARD_PASSCODE for the password/secret', () => {
    delete process.env.ADMIN_PASSWORD;
    process.env.DASHBOARD_PASSCODE = 'legacy-code';
    expect(checkCredentials('boss', 'legacy-code')).toBe(true);
    expect(verifySession(createSessionToken())).toBe(true);
  });

  it('issues a session token that verifies', () => {
    const token = createSessionToken();
    expect(token).toBeTruthy();
    expect(verifySession(token)).toBe(true);
  });

  it('rejects tampered, expired, and empty tokens', () => {
    const token = createSessionToken()!;
    const [exp, sig] = token.split('.');
    expect(verifySession(token + 'x')).toBe(false);            // bad signature
    expect(verifySession(`${Number(exp) + 1}.${sig}`)).toBe(false); // exp changed, sig mismatch
    expect(verifySession(createSessionToken(Date.now() - 13 * 60 * 60 * 1000))).toBe(false); // expired
    expect(verifySession(undefined)).toBe(false);
    expect(verifySession('')).toBe(false);
    expect(verifySession('no-dot')).toBe(false);
  });
});
