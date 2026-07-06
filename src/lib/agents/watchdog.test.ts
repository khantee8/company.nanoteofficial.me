// src/lib/agents/watchdog.test.ts
import { describe, it, expect } from 'vitest';
import { decideRetry, SAFE_OVERRIDES } from './watchdog';
import type { AgentStatus } from './types';

const st = (dept: AgentStatus['dept'], state: AgentStatus['state']): AgentStatus =>
  ({ dept, state, lastRun: '2026-07-05T10:00:00Z' });

describe('decideRetry', () => {
  it('picks a frontend dept in error state', () => {
    expect(decideRetry([st('fin', 'error'), st('cyb', 'done')], [], [])).toBe('fin');
  });
  it('never retries backend depts (ceo/ops)', () => {
    expect(decideRetry([st('ceo', 'error'), st('ops', 'error')], [], [])).toBeNull();
  });
  it('skips already-retried and disabled depts', () => {
    expect(decideRetry([st('fin', 'error')], ['fin'], [])).toBeNull();
    expect(decideRetry([st('fin', 'error')], [], ['fin'])).toBeNull();
  });
  it('returns at most one dept (first failing in registry order)', () => {
    expect(decideRetry([st('rnd', 'error'), st('fin', 'error')], [], [])).toBe('fin');
  });
  it('healthy company → null', () => {
    expect(decideRetry([st('fin', 'done'), st('cyb', 'idle')], [], [])).toBeNull();
  });
});

describe('SAFE_OVERRIDES', () => {
  it('is conservative: 1 search on the default cheap model', () => {
    expect(SAFE_OVERRIDES).toEqual({ maxSearches: 1, model: 'claude-haiku-4-5-20251001' });
  });
});
