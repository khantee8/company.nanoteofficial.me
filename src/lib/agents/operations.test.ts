import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { completeRawMock } = vi.hoisted(() => ({
  completeRawMock: vi.fn(async () => ({
    text: 'รายงาน ops\n\n## Highlight\nx\n\n## Flags\nNone',
    stopReason: 'end_turn',
    usage: { input: 1, output: 100 },
    model: 'claude-haiku-4-5-20251001',
  })),
}));

vi.mock('@/lib/claude', () => ({ completeRaw: completeRawMock }));
vi.mock('@/lib/sources/vercelApi', () => ({
  fetchDeployments: vi.fn(async () => []),
  formatDeployments: vi.fn(() => []),
}));
vi.mock('@/lib/sources/githubApi', () => ({
  fetchActivity: vi.fn(async () => []),
  formatActivity: vi.fn(() => []),
}));

import { run } from './operations';
import type { AgentContext, UsageEntry } from './types';

const emptyCtx: AgentContext = { ownHistory: [], companyDigest: [], todayPeers: [] };

describe('operations.run — truncation flag', () => {
  beforeEach(() => completeRawMock.mockClear());

  it('requests a budget that fits a full dual-language report', async () => {
    await run(emptyCtx);
    expect(completeRawMock).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 8000, webSearch: true }),
    );
  });

  it('sets incomplete=true when the model stops on max_tokens', async () => {
    completeRawMock.mockResolvedValueOnce({
      text: 'รายงานถูกตัดกลางคัน',
      stopReason: 'max_tokens',
      usage: { input: 1, output: 4000 },
      model: 'claude-haiku-4-5-20251001',
    });
    const result = await run(emptyCtx);
    expect(result.incomplete).toBe(true);
  });

  it('does not flag a clean end_turn run as incomplete', async () => {
    const result = await run(emptyCtx);
    expect(result.incomplete).toBe(false);
  });
});

describe('operations.run — internal monitoring', () => {
  const now = new Date().toISOString();
  const critCtx: AgentContext = {
    ownHistory: [], companyDigest: [], todayPeers: [],
    companySnapshot: {
      statuses: [
        { dept: 'fin', state: 'error', lastRun: now, error: 'boom' },
        { dept: 'cyb', state: 'done', lastRun: now },
      ],
      digest: [],
      outputs: [
        { dept: 'fin', incomplete: false, artifactCount: 0, hasSummary: false, ts: null },
        { dept: 'cyb', incomplete: false, artifactCount: 3, hasSummary: true, ts: now },
      ],
    },
  };
  const healthyCtx: AgentContext = {
    ownHistory: [], companyDigest: [], todayPeers: [],
    companySnapshot: {
      statuses: [{ dept: 'cyb', state: 'done', lastRun: now }],
      digest: [],
      outputs: [{ dept: 'cyb', incomplete: false, artifactCount: 3, hasSummary: true, ts: now }],
    },
  };

  beforeEach(() => completeRawMock.mockClear());

  it('feeds agent run-health into the prompt', async () => {
    await run(critCtx);
    expect(completeRawMock).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: expect.stringContaining('run failed: boom') }),
    );
  });

  it('returns a critical alert when an agent is down', async () => {
    const r = await run(critCtx);
    expect(r.alert?.severity).toBe('critical');
    expect(r.alert?.text).toContain('OPS ALERT');
    expect(r.alert?.text).toContain('FIN');
  });

  it('emits agent-health artifacts', async () => {
    const r = await run(critCtx);
    expect((r.artifacts ?? []).some((a) => a.title === 'agent health')).toBe(true);
    expect((r.artifacts ?? []).some((a) => a.title === 'agent issues')).toBe(true);
  });

  it('no alert when all monitored agents are healthy', async () => {
    const r = await run(healthyCtx);
    expect(r.alert).toBeUndefined();
  });
});

describe('operations.run — budget monitoring', () => {
  afterEach(() => { vi.unstubAllEnvs(); completeRawMock.mockClear(); });

  const now = Date.now();
  // $6 of Sonnet output (400k @ $15/Mtok) this month — over a $5 budget.
  const overBudget: UsageEntry[] = [{ dept: 'fin', model: 'claude-sonnet-4-6', input: 0, output: 400_000, ts: now }];
  const ctxWithUsage = (usage: UsageEntry[]): AgentContext => ({
    ownHistory: [], companyDigest: [], todayPeers: [],
    companySnapshot: { statuses: [{ dept: 'cyb', state: 'done', lastRun: new Date(now).toISOString() }], digest: [], outputs: [], usage },
  });

  it('fires a critical OPS ALERT when the budget is exceeded', async () => {
    vi.stubEnv('MONTHLY_BUDGET_USD', '5');
    const r = await run(ctxWithUsage(overBudget));
    expect(r.alert?.severity).toBe('critical');
    expect(r.alert?.text).toContain('OPS ALERT');
    expect(r.alert?.text.toUpperCase()).toContain('BUDGET');
  });

  it('does not alert on budget when unset (tracking only)', async () => {
    const r = await run(ctxWithUsage(overBudget)); // no MONTHLY_BUDGET_USD
    expect(r.alert).toBeUndefined();
    expect((r.artifacts ?? []).some((a) => a.title === 'cost & budget')).toBe(true);
  });

  it('always includes the cost & budget artifact', async () => {
    const r = await run(ctxWithUsage([]));
    expect((r.artifacts ?? []).some((a) => a.title === 'cost & budget')).toBe(true);
  });
});
