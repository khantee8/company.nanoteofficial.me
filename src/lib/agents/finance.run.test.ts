import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/claude', () => ({ completeRaw: vi.fn() }));

import { run } from './finance';
import * as claudeLib from '@/lib/claude';

const completeRaw = vi.mocked(claudeLib.completeRaw);

const FINDINGS = '```json findings\n{"theme":"t","funds":[{"name":"SCB US","amc":"SCBAM","ter":0.4,"aum":1000,"masterFund":"iShares","return1y":18,"hedged":false,"taxType":"none","citation":{"url":"https://market.sec.or.th/x","title":"SEC","date":"2026-06-12"}}]}\n```\n## Highlight\nok\n<!-- ===EN=== -->\nok\n## Flags\nNone.\n---\nbody';

beforeEach(() => {
  completeRaw.mockReset();
  process.env.THAI_FUNDS_MCP_URL = 'https://tf/api/mcp';
  process.env.THAI_FUNDS_MCP_TOKEN = 'tok';
});

// Minimal AgentContext with the real field names formatContext reads.
const ctx = {
  ownHistory: [],
  companyDigest: [],
  todayPeers: [],
} as never;

describe('finance.run with MCP', () => {
  it('calls completeRaw on Sonnet, with mcpServers AND web_search (hybrid)', async () => {
    completeRaw.mockResolvedValueOnce({ text: FINDINGS, stopReason: 'end_turn', usage: { input: 1, output: 1 } });
    const res = await run(ctx);
    const opts = completeRaw.mock.calls[0][0];
    expect(opts.model).toBe('claude-sonnet-4-6');
    expect(opts.webSearch).toBe(true); // hybrid: web_search for names/returns + MCP for SEC numbers
    expect(opts.mcpServers).toEqual([{ url: 'https://tf/api/mcp', name: 'thai-funds', token: 'tok' }]);
    expect(res.provenance).toBe('web');
    expect((res.artifacts ?? []).length).toBeGreaterThan(0);
  });

  it('still runs (no MCP wiring) when env unset', async () => {
    delete process.env.THAI_FUNDS_MCP_URL;
    delete process.env.THAI_FUNDS_MCP_TOKEN;
    completeRaw.mockResolvedValueOnce({ text: FINDINGS, stopReason: 'end_turn', usage: { input: 1, output: 1 } });
    const res = await run(ctx);
    const opts = completeRaw.mock.calls[0][0];
    expect(opts.mcpServers).toBeUndefined();
    expect((res.artifacts ?? []).length).toBeGreaterThan(0);
  });

  it('omits the token when only the URL env is set', async () => {
    process.env.THAI_FUNDS_MCP_URL = 'https://tf/api/mcp';
    delete process.env.THAI_FUNDS_MCP_TOKEN;
    completeRaw.mockResolvedValueOnce({ text: FINDINGS, stopReason: 'end_turn', usage: { input: 1, output: 1 } });
    await run(ctx);
    expect(completeRaw.mock.calls[0][0].mcpServers).toEqual([{ url: 'https://tf/api/mcp', name: 'thai-funds' }]);
  });
});
