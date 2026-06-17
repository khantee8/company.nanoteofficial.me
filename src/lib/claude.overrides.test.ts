import { describe, it, expect } from 'vitest';
import { applyOverrides } from './claude';
import type { AgentContext } from './agents/types';

const baseCtx: AgentContext = { ownHistory: [], companyDigest: [], todayPeers: [] };
const opts = { system: 's', prompt: 'p', maxSearches: 5, model: 'claude-haiku-4-5', maxTokens: 8000, webSearch: true };

describe('applyOverrides', () => {
  it('returns opts unchanged when no overrides', () => {
    expect(applyOverrides(opts, baseCtx)).toEqual(opts);
  });
  it('overlays maxSearches and model when present', () => {
    const ctx = { ...baseCtx, overrides: { maxSearches: 2, model: 'claude-sonnet-4-6' } };
    const out = applyOverrides(opts, ctx);
    expect(out.maxSearches).toBe(2);
    expect(out.model).toBe('claude-sonnet-4-6');
    expect(out.maxTokens).toBe(8000); // untouched
  });
  it('ignores undefined override fields', () => {
    const ctx = { ...baseCtx, overrides: { maxSearches: 3 } };
    expect(applyOverrides(opts, ctx).model).toBe('claude-haiku-4-5');
  });
});
